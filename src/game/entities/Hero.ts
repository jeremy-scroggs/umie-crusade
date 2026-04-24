import type { HeroDef } from '@/types';
import {
  Ability,
  Damageable,
  Targetable,
  CATEGORY_TARGET_PRIORITY,
  SimpleEventEmitter,
} from '@/game/components';
import type { EventEmitterLike } from '@/game/components';
import type { Vec2 } from '@/game/entities/Projectile';

/**
 * Hero — Bloodrock-faction player-avatar entity.
 *
 * Structurally similar to Orc (same Damageable / Targetable composition)
 * but owns an additional Ability component driven by the validated
 * `HeroDef.ability` block. A separate class keeps `Orc` generic (no
 * hero-only fields) while still reusing the same component pattern.
 *
 * All balance numbers come from the validated def — this file contains
 * zero hardcoded stats.
 */

/**
 * Minimal structural shape a target must satisfy for Clomp'uk to affect
 * it. Mirrors `TargetLike` from Projectile but adds the writable stun
 * timestamp field. Structural typing means any Human implementation
 * matches automatically once it gains a `stunnedUntilMs` slot.
 */
export interface HeroAbilityTargetLike {
  readonly position: Vec2;
  readonly damageable: {
    readonly dead: boolean;
    applyDamage(amount: number): number;
  };
  stunnedUntilMs?: number;
}

export interface HeroAbilityContext {
  /** Current timestamp in ms. Caller owns the clock. */
  nowMs: number;
  /** World position where the slam lands (usually the hero's position). */
  position: Vec2;
  /** Candidate targets the caller wants considered (spatial pre-filter). */
  targets: readonly HeroAbilityTargetLike[];
}

export interface HeroAbilityHit {
  target: HeroAbilityTargetLike;
  /** Effective damage after armor reduction (from Damageable). */
  effective: number;
}

export type HeroAbilityResult =
  | {
      used: true;
      hits: HeroAbilityHit[];
      stunUntilMs: number;
    }
  | {
      used: false;
      reason: 'cooldown';
    };

export interface HeroAbilityUsedPayload {
  id: string;
  position: Vec2;
  hits: HeroAbilityHit[];
  stunUntilMs: number;
  usedAtMs: number;
}

export class Hero {
  readonly def: HeroDef;
  readonly emitter: EventEmitterLike;
  readonly damageable: Damageable;
  readonly targetable: Targetable;
  readonly ability: Ability;

  private constructor(
    def: HeroDef,
    emitter: EventEmitterLike,
    damageable: Damageable,
    targetable: Targetable,
    ability: Ability,
  ) {
    this.def = def;
    this.emitter = emitter;
    this.damageable = damageable;
    this.targetable = targetable;
    this.ability = ability;
  }

  static fromDef(def: HeroDef, emitter?: EventEmitterLike): Hero {
    if (def.faction !== 'orc') {
      throw new Error(
        `Hero.fromDef: expected faction 'orc', got '${def.faction}' (${def.id})`,
      );
    }
    const ee: EventEmitterLike = emitter ?? new SimpleEventEmitter();
    const damageable = new Damageable({
      hp: def.stats.hp,
      armor: def.stats.armor,
      emitter: ee,
    });
    const targetable = new Targetable({
      priority: CATEGORY_TARGET_PRIORITY[def.category],
      emitter: ee,
    });
    const ability = new Ability({ def: def.ability, emitter: ee });
    return new Hero(def, ee, damageable, targetable, ability);
  }

  /**
   * Attempt to trigger Clomp'uk (or the hero's configured active
   * ability). Returns `{ used: false, reason: 'cooldown' }` when the
   * ability isn't ready; otherwise applies AoE damage + stun to every
   * target within radius and returns the hit list.
   *
   * The hero does NOT perform spatial queries itself — the caller
   * (AI / Scene / test) passes the candidate targets in
   * `ctx.targets`. Hero filters them by radius (from the def) and
   * alive-ness.
   *
   * Reads every balance number from the validated def — no hardcoded
   * stats. Damage flows through `Damageable.applyDamage` so the
   * existing armor/death pipeline from #6/#8 is preserved. Stun is
   * applied as an absolute-timestamp field (`stunnedUntilMs`) so
   * consumers can check `nowMs < stunnedUntilMs` in a single compare.
   */
  tryUseAbility(ctx: HeroAbilityContext): HeroAbilityResult {
    if (!this.ability.canUse(ctx.nowMs)) {
      return { used: false, reason: 'cooldown' };
    }

    const { damage, radius, stunMs } = this.def.ability;
    const radiusSq = radius * radius;
    const stunUntilMs = ctx.nowMs + stunMs;

    const hits: HeroAbilityHit[] = [];
    for (const target of ctx.targets) {
      if (target.damageable.dead) continue;
      const dx = target.position.x - ctx.position.x;
      const dy = target.position.y - ctx.position.y;
      if (dx * dx + dy * dy > radiusSq) continue;

      const effective = target.damageable.applyDamage(damage);
      target.stunnedUntilMs = stunUntilMs;
      hits.push({ target, effective });
    }

    this.ability.markUsed(ctx.nowMs);

    const payload: HeroAbilityUsedPayload = {
      id: this.def.ability.id,
      position: { x: ctx.position.x, y: ctx.position.y },
      hits,
      stunUntilMs,
      usedAtMs: ctx.nowMs,
    };
    this.emitter.emit('hero-ability-used', payload);

    return { used: true, hits, stunUntilMs };
  }
}
