import { SimpleEventEmitter } from '@/game/components';
import type { EventEmitterLike } from '@/game/components';
import { Projectile } from '@/game/entities/Projectile';
import type { TargetLike, Vec2 } from '@/game/entities/Projectile';
import type { TowerDef } from '@/types';

/**
 * Damage — runtime system that orchestrates the damage pipeline.
 *
 * Responsibilities:
 *  - Apply melee damage on the attack-frame event (`meleeAttack`).
 *  - Spawn and drive ballista projectiles (`fireProjectile` + `update`).
 *  - Track per-tower cooldown and auto-fire via an optional selectTarget
 *    callback (target selection itself is AI, issue #9 — out of scope here).
 *  - Listen for `'died'` on damaged entities and hand them to an optional
 *    `onEntityDied` callback — "freed" = removed from caller's active sets.
 *
 * This system never re-implements armor / HP math; it only calls
 * `Damageable.applyDamage`. All balance numbers flow from validated defs
 * (`UnitDef.stats.dps`, `TowerDef.combat.{damage,attackRate,projectileSpeed}`).
 */

/** Melee attacker shape — reads the attacker's DPS off the UnitDef. */
export interface MeleeAttackerLike {
  readonly def: { readonly stats: { readonly dps: number } };
}

/** Tower entity shape — reads combat block off the validated TowerDef. */
export interface TowerLike {
  readonly position: Vec2;
  readonly combat: TowerDef['combat'];
}

export type SelectTargetFn = (tower: TowerLike) => TargetLike | null;

export interface DamageSystemOptions {
  emitter?: EventEmitterLike;
  /** Optional target-selection hook; default never auto-fires. */
  selectTarget?: SelectTargetFn;
  /**
   * Optional hook invoked when a target we damaged dies. Callers use this
   * to remove the entity from active sets. Per PLAN-08 "freed" = removed.
   */
  onEntityDied?: (target: TargetLike) => void;
  /**
   * Optional delay (seconds) between death and the `onEntityDied` call —
   * future seam for a short death animation. Defaults to 0 (immediate).
   */
  deathLingerSeconds?: number;
}

export interface RegisteredTower {
  /** Seconds until this tower can fire again. 0 = ready. */
  cooldown: number;
}

interface PendingDeath {
  target: TargetLike;
  remaining: number;
}

export class DamageSystem {
  readonly emitter: EventEmitterLike;
  readonly projectiles: Set<Projectile> = new Set();
  readonly towers: Map<TowerLike, RegisteredTower> = new Map();

  private readonly selectTarget: SelectTargetFn;
  private readonly onEntityDied: (target: TargetLike) => void;
  private readonly deathLingerSeconds: number;
  private readonly pendingDeaths: PendingDeath[] = [];
  private readonly watchedDeaths: WeakSet<object> = new WeakSet();

  constructor(opts: DamageSystemOptions = {}) {
    this.emitter = opts.emitter ?? new SimpleEventEmitter();
    this.selectTarget = opts.selectTarget ?? (() => null);
    this.onEntityDied = opts.onEntityDied ?? (() => {});
    this.deathLingerSeconds = opts.deathLingerSeconds ?? 0;
  }

  /** Register a tower in the auto-fire loop. Starts ready to fire. */
  register(tower: TowerLike): void {
    if (this.towers.has(tower)) return;
    this.towers.set(tower, { cooldown: 0 });
  }

  unregister(tower: TowerLike): void {
    this.towers.delete(tower);
  }

  /**
   * Apply a melee hit at the attack animation frame. Damage comes from
   * `attacker.def.stats.dps`; armor reduction + death handling live on
   * `target.damageable`.
   */
  meleeAttack(attacker: MeleeAttackerLike, target: TargetLike): number {
    this.watchDeath(target);
    const amount = attacker.def.stats.dps;
    const effective = target.damageable.applyDamage(amount);
    this.emitter.emit('melee-hit', { attacker, target, effective });
    return effective;
  }

  /**
   * Spawn a projectile from `tower` at `target`. Reads speed + damage off
   * the tower's validated `combat` block.
   */
  fireProjectile(tower: TowerLike, target: TargetLike): Projectile {
    this.watchDeath(target);
    const p = new Projectile({
      from: tower.position,
      target,
      speed: tower.combat.projectileSpeed,
      damage: tower.combat.damage,
    });
    this.projectiles.add(p);
    this.emitter.emit('projectile-spawned', { tower, target, projectile: p });
    return p;
  }

  /**
   * Per-tick step. Advances tower cooldowns (auto-fires when a target is
   * available), then advances all live projectiles and resolves hits.
   */
  update(dt: number): void {
    this.tickTowers(dt);
    this.tickProjectiles(dt);
    this.tickPendingDeaths(dt);
  }

  private tickTowers(dt: number): void {
    for (const [tower, state] of this.towers) {
      state.cooldown = Math.max(0, state.cooldown - dt);
      if (state.cooldown > 0) continue;

      const target = this.selectTarget(tower);
      if (!target) continue;
      if (target.damageable.dead) continue;

      this.fireProjectile(tower, target);
      state.cooldown = 1 / tower.combat.attackRate;
    }
  }

  private tickProjectiles(dt: number): void {
    const resolved: Projectile[] = [];
    for (const p of this.projectiles) {
      p.update(dt);
      if (p.hasReachedTarget()) {
        const effective = p.applyDamageOnHit();
        this.emitter.emit('projectile-hit', { projectile: p, effective });
        resolved.push(p);
      } else if (p.done) {
        // Target died en-route; drop without a hit event.
        resolved.push(p);
      }
    }
    for (const p of resolved) this.projectiles.delete(p);
  }

  private tickPendingDeaths(dt: number): void {
    if (this.pendingDeaths.length === 0) return;
    const stillPending: PendingDeath[] = [];
    for (const pd of this.pendingDeaths) {
      pd.remaining -= dt;
      if (pd.remaining <= 0) {
        this.onEntityDied(pd.target);
      } else {
        stillPending.push(pd);
      }
    }
    this.pendingDeaths.length = 0;
    for (const pd of stillPending) this.pendingDeaths.push(pd);
  }

  /**
   * Subscribe once to the target's `'died'` event so we can emit a
   * system-level `'target-died'` and hand the entity to the free hook.
   */
  private watchDeath(target: TargetLike): void {
    if (this.watchedDeaths.has(target)) return;
    this.watchedDeaths.add(target);
    const emitter = (target as { emitter?: EventEmitterLike }).emitter;
    if (!emitter) return;

    const onDied = (): void => {
      this.emitter.emit('target-died', { target });
      if (this.deathLingerSeconds > 0) {
        this.pendingDeaths.push({
          target,
          remaining: this.deathLingerSeconds,
        });
      } else {
        this.onEntityDied(target);
      }
    };
    emitter.on('died', onDied);
  }
}
