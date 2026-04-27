import type { UnitDef } from '@/types';
import { SimpleEventEmitter } from '@/game/components';
import type { EventEmitterLike } from '@/game/components';
import type { Orc } from '@/game/entities/Orc';
import type { Human } from '@/game/entities/Human';
import type { Building } from '@/game/entities/Building';
import type { TargetLike, Vec2 } from '@/game/entities/Projectile';
import type { Cell, Pathfinding } from './Pathfinding';
import type { DamageSystem, MeleeAttackerLike } from './Damage';
import { GameEvents } from './events';

/**
 * AI — behavior-layer system for Orc + Human entities.
 *
 * Encapsulates two state machines that drive combat + movement on top of
 * the Pathfinding (#7) and Damage (#8) systems.
 *
 * Humans: `IDLE → PATHING → ATTACK_WALL (if blocked) → PATHING → ATTACK_ORC
 *   (if engaged) → PATHING`.
 * Orcs: `IDLE_AT_RALLY → ENGAGE → ATTACK → RETURN_TO_RALLY → IDLE_AT_RALLY`.
 *
 * Design notes:
 * - Behavior state is attached via per-unit maps owned by this system — the
 *   `Orc` / `Human` classes stay pure data hosts (mirrors the `DamageSystem.
 *   towers` map pattern).
 * - Attacks go through `DamageSystem.meleeAttack` (never decrements HP
 *   directly here).
 * - Subscribes to `GameEvents.PathInvalidated` so humans re-request paths
 *   after wall changes.
 * - No Phaser import — runs in Node/jsdom for tests.
 * - No balance numbers are hardcoded: all stats come from `UnitDef`;
 *   aggro + rally are ctor options supplied by the caller (scene / tests).
 *
 * NOTE: `aggroRadius` and the melee cadence `secondsPerMeleeAttack` live
 * on ctor options (not `UnitDef`) for now — the schema doesn't yet carry
 * per-unit aggro / attack-rate. A future schema migration can move them;
 * callers provide a value per-run in the interim.
 */

export const HumanState = {
  Idle: 'idle',
  Pathing: 'pathing',
  AttackWall: 'attack-wall',
  AttackOrc: 'attack-orc',
} as const;
export type HumanStateName = (typeof HumanState)[keyof typeof HumanState];

export const OrcState = {
  IdleAtRally: 'idle-at-rally',
  Engage: 'engage',
  Attack: 'attack',
  ReturnToRally: 'return-to-rally',
} as const;
export type OrcStateName = (typeof OrcState)[keyof typeof OrcState];

/** A Human entity with an associated world cell (supplied on register). */
export interface HumanInstance {
  readonly entity: Human;
  readonly cell: Cell;
}

/** An Orc entity with an associated world cell (supplied on register). */
export interface OrcInstance {
  readonly entity: Orc;
  readonly cell: Cell;
}

export interface AISystemOptions {
  /** Pathfinding system (required — humans path through it). */
  pathfinding: Pathfinding;
  /** Damage system (required — all melee hits route through it). */
  damage: DamageSystem;
  /** Rally cell: orcs return here when no target is in aggro. */
  rally: Cell;
  /** Fort/goal cell: the cell humans pathfind toward. */
  fortGoal: Cell;
  /**
   * Optional shared event bus — defaults to a `SimpleEventEmitter`. The
   * `PathInvalidated` subscription uses the Pathfinding's emitter (set at
   * Pathfinding construction), NOT this one, so a different emitter here
   * is fine and used only for AI-level events (see below).
   */
  emitter?: EventEmitterLike;
  /**
   * Event emitter to subscribe to for `GameEvents.PathInvalidated`. If
   * omitted, defaults to the same emitter as `emitter`. Normally the scene
   * passes the Pathfinding's emitter here.
   */
  pathEmitter?: EventEmitterLike;
  /**
   * Aggro radius (in virtual pixels) for orcs scanning for humans. Default:
   * 6 tiles measured via the Pathfinding's `tileWidth`. Structural default
   * — every real run overrides with a balanced value.
   */
  aggroRadius?: number;
  /**
   * Seconds between melee attacks. `UnitDef` doesn't (yet) carry an
   * attack-rate. Default: 1 second per hit (matches "dps" reading as
   * damage-per-hit-at-1-Hz). Overridable per run via ctor.
   */
  secondsPerMeleeAttack?: number;
  /**
   * Melee engagement distance in tiles (Chebyshev). Default: 1 — adjacent.
   * Structural — not balance; keeps combat within-tile honest.
   */
  meleeRangeTiles?: number;
  /**
   * Source of active wall buildings. The AI calls this once per human
   * tick when the next path-step is blocked to find which wall to attack.
   * Returning `null` means the block is permanent (e.g. terrain) — the
   * human falls back to `IDLE`.
   */
  wallAt?: (x: number, y: number) => Building | null;
  /**
   * Source of all currently alive humans — used by orc aggro scan.
   * Defaults to the set of humans registered via `registerHuman`.
   */
  humansProvider?: () => Iterable<HumanBehavior>;
}

/** Internal per-human state record. */
export interface HumanBehavior {
  readonly instance: HumanInstance;
  state: HumanStateName;
  /** Current path (cells, inclusive endpoints); null when no path yet. */
  path: Cell[] | null;
  /** Index of next cell to step onto in `path`. */
  pathIndex: number;
  /** Set by `path:invalidated`; consumed on next tick. */
  needsRepath: boolean;
  /** Seconds until this human can step to the next tile. */
  stepCooldown: number;
  /** Seconds until this human's next melee swing. */
  attackCooldown: number;
  /** Wall currently targeted by `ATTACK_WALL`, if any. */
  targetWall: Building | null;
  /** Orc currently targeted by `ATTACK_ORC`, if any. */
  targetOrc: OrcBehavior | null;
  /** Current world cell (mirrors `instance.cell`; mutable as we step). */
  cell: Cell;
}

/** Internal per-orc state record. */
export interface OrcBehavior {
  readonly instance: OrcInstance;
  state: OrcStateName;
  /** Current target human, if engaged. */
  target: HumanBehavior | null;
  /** Seconds until next tile step. */
  stepCooldown: number;
  /** Seconds until next melee swing. */
  attackCooldown: number;
  /** Current world cell (mutable as we step). */
  cell: Cell;
}

/**
 * Build a `MeleeAttackerLike` from an entity — the DamageSystem only
 * reads `attacker.def.stats.dps`, so this adapter is trivial.
 */
function asAttacker(entity: Orc | Human): MeleeAttackerLike {
  return { def: entity.def as { stats: { dps: number } } & UnitDef };
}

/**
 * Build a `TargetLike` whose position is the given cell (pixel centre).
 * The DamageSystem only reads `damageable`; `position` is kept honest
 * for future projectile-based targeting.
 */
function wallTarget(wall: Building, pxPerCell: number): TargetLike {
  const position: Vec2 = {
    x: (wall.cell.x + 0.5) * pxPerCell,
    y: (wall.cell.y + 0.5) * pxPerCell,
  };
  return { position, damageable: wall.breakable.damageable };
}

function unitTarget(
  behavior: HumanBehavior | OrcBehavior,
  pxPerCell: number,
): TargetLike {
  const position: Vec2 = {
    x: (behavior.cell.x + 0.5) * pxPerCell,
    y: (behavior.cell.y + 0.5) * pxPerCell,
  };
  return { position, damageable: behavior.instance.entity.damageable };
}

/** Chebyshev distance in tiles between two cells. */
function chebyshev(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Euclidean distance in pixels (both cells scaled by `pxPerCell`). */
function pixelDistance(a: Cell, b: Cell, pxPerCell: number): number {
  const dx = (a.x - b.x) * pxPerCell;
  const dy = (a.y - b.y) * pxPerCell;
  return Math.hypot(dx, dy);
}

export class AISystem {
  readonly emitter: EventEmitterLike;
  readonly rally: Cell;
  readonly fortGoal: Cell;
  readonly aggroRadius: number;
  readonly secondsPerMeleeAttack: number;
  readonly meleeRangeTiles: number;
  readonly pxPerCell: number;

  private readonly pathfinding: Pathfinding;
  private readonly damage: DamageSystem;
  private readonly pathEmitter: EventEmitterLike;
  private readonly wallAt: (x: number, y: number) => Building | null;
  private readonly humansProvider: () => Iterable<HumanBehavior>;

  private readonly humans: Map<Human, HumanBehavior> = new Map();
  private readonly orcs: Map<Orc, OrcBehavior> = new Map();

  private readonly onPathInvalidated = (): void => {
    // Mark every human for re-path on next tick. Cheap + deterministic.
    for (const h of this.humans.values()) {
      h.needsRepath = true;
    }
  };

  constructor(opts: AISystemOptions) {
    this.pathfinding = opts.pathfinding;
    this.damage = opts.damage;
    this.rally = opts.rally;
    this.fortGoal = opts.fortGoal;
    this.pxPerCell = opts.pathfinding.tileWidth;
    this.aggroRadius = opts.aggroRadius ?? 6 * this.pxPerCell;
    this.secondsPerMeleeAttack = opts.secondsPerMeleeAttack ?? 1;
    this.meleeRangeTiles = opts.meleeRangeTiles ?? 1;
    this.emitter = opts.emitter ?? new SimpleEventEmitter();
    this.pathEmitter = opts.pathEmitter ?? this.emitter;
    this.wallAt = opts.wallAt ?? (() => null);
    this.humansProvider = opts.humansProvider ?? (() => this.humans.values());

    this.pathEmitter.on(GameEvents.PathInvalidated, this.onPathInvalidated);
  }

  destroy(): void {
    this.pathEmitter.off(GameEvents.PathInvalidated, this.onPathInvalidated);
    this.humans.clear();
    this.orcs.clear();
  }

  /** Register a human — starts in `IDLE`; first tick triggers a path request. */
  registerHuman(instance: HumanInstance): HumanBehavior {
    const existing = this.humans.get(instance.entity);
    if (existing) return existing;
    const behavior: HumanBehavior = {
      instance,
      state: HumanState.Idle,
      path: null,
      pathIndex: 0,
      needsRepath: true,
      stepCooldown: 0,
      attackCooldown: 0,
      targetWall: null,
      targetOrc: null,
      cell: { x: instance.cell.x, y: instance.cell.y },
    };
    this.humans.set(instance.entity, behavior);
    return behavior;
  }

  unregisterHuman(entity: Human): void {
    this.humans.delete(entity);
  }

  /** Register an orc — starts in `IDLE_AT_RALLY`. */
  registerOrc(instance: OrcInstance): OrcBehavior {
    const existing = this.orcs.get(instance.entity);
    if (existing) return existing;
    const behavior: OrcBehavior = {
      instance,
      state: OrcState.IdleAtRally,
      target: null,
      stepCooldown: 0,
      attackCooldown: 0,
      cell: { x: instance.cell.x, y: instance.cell.y },
    };
    this.orcs.set(instance.entity, behavior);
    return behavior;
  }

  unregisterOrc(entity: Orc): void {
    this.orcs.delete(entity);
  }

  /** Inspect a human's current behavior — for tests + UI. */
  humanBehavior(entity: Human): HumanBehavior | undefined {
    return this.humans.get(entity);
  }

  /** Inspect an orc's current behavior — for tests + UI. */
  orcBehavior(entity: Orc): OrcBehavior | undefined {
    return this.orcs.get(entity);
  }

  /** Per-tick step. Drives both FSMs. */
  update(dt: number): void {
    for (const h of this.humans.values()) {
      if (h.instance.entity.damageable.dead) continue;
      this.tickHuman(h, dt);
    }
    for (const o of this.orcs.values()) {
      if (o.instance.entity.damageable.dead) continue;
      this.tickOrc(o, dt);
    }
  }

  // ------------------------------------------------------------------
  //                            Human FSM
  // ------------------------------------------------------------------

  private tickHuman(h: HumanBehavior, dt: number): void {
    h.stepCooldown = Math.max(0, h.stepCooldown - dt);
    h.attackCooldown = Math.max(0, h.attackCooldown - dt);

    // A repath request asks the human to re-query Pathfinding. We keep
    // the existing path until a new one resolves — so the human keeps
    // walking toward (or discovers a block on) its old route. When the
    // async `findPath` returns, we swap in the new path (or fall back to
    // IDLE if no path exists at all).
    if (h.needsRepath) {
      h.needsRepath = false;
      if (h.state === HumanState.AttackWall && h.targetWall && !h.targetWall.breakable.damageable.dead) {
        // Still standing — stay in ATTACK_WALL; re-path fires again when the wall dies.
      } else {
        if (h.state !== HumanState.Pathing) {
          h.state = HumanState.Pathing;
          h.targetWall = null;
        }
        this.requestPath(h);
      }
    }

    switch (h.state) {
      case HumanState.Idle:
        this.humanBeginPath(h);
        return;

      case HumanState.Pathing:
        this.humanStepPath(h);
        return;

      case HumanState.AttackWall:
        this.humanAttackWall(h);
        return;

      case HumanState.AttackOrc:
        this.humanAttackOrc(h);
        return;
    }
  }

  private humanBeginPath(h: HumanBehavior): void {
    h.state = HumanState.Pathing;
    this.requestPath(h);
  }

  /**
   * Issue a `findPath` request for this human and wire the async callback
   * to update its behavior record. Keeps the old path in place while the
   * new one is in flight — the human can continue walking until the new
   * path arrives or it hits a now-blocked cell.
   */
  private requestPath(h: HumanBehavior): void {
    void this.pathfinding
      .findPath(h.cell.x, h.cell.y, this.fortGoal.x, this.fortGoal.y)
      .then((path) => {
        if (path === null) {
          // No path — keep the old one (if any) so the human walks until
          // it hits a block, at which point ATTACK_WALL kicks in. If there
          // was never a path, fall back to IDLE so the next invalidation
          // retries.
          if (h.path === null) {
            h.state = HumanState.Idle;
          }
          return;
        }
        h.path = path;
        h.pathIndex = 0;
      });
  }

  private humanStepPath(h: HumanBehavior): void {
    // Check for engaged orc first — any orc attacking us pulls us to
    // ATTACK_ORC.
    const engagedOrc = this.findEngagingOrc(h);
    if (engagedOrc) {
      h.targetOrc = engagedOrc;
      h.state = HumanState.AttackOrc;
      return;
    }

    if (!h.path) {
      // No path cached — kick off a request. We stay in PATHING; the async
      // request will set `path` when it resolves.
      void this.pathfinding
        .findPath(h.cell.x, h.cell.y, this.fortGoal.x, this.fortGoal.y)
        .then((path) => {
          if (path === null) {
            h.state = HumanState.Idle;
            return;
          }
          h.path = path;
          h.pathIndex = 0;
        });
      return;
    }

    // Already at goal?
    if (h.cell.x === this.fortGoal.x && h.cell.y === this.fortGoal.y) {
      return;
    }

    if (h.stepCooldown > 0) return;

    const nextIndex = this.nextPathIndex(h);
    if (nextIndex >= (h.path?.length ?? 0)) return;
    const next = h.path![nextIndex]!;

    // If the next cell is blocked (e.g. a wall went up since we pathed),
    // switch to ATTACK_WALL if we can find one, else re-path.
    if (!this.pathfinding.isWalkable(next.x, next.y)) {
      const wall = this.wallAt(next.x, next.y);
      if (wall && !wall.breakable.damageable.dead) {
        h.targetWall = wall;
        h.state = HumanState.AttackWall;
        return;
      }
      // No wall — base terrain is just impassable. Request a fresh path.
      h.needsRepath = true;
      return;
    }

    // Step onto the next cell.
    h.cell = { x: next.x, y: next.y };
    h.pathIndex = nextIndex;
    h.stepCooldown = this.secondsPerTile(h.instance.entity.def);
  }

  private humanAttackWall(h: HumanBehavior): void {
    const wall = h.targetWall;
    if (!wall || wall.breakable.damageable.dead) {
      // Wall gone — re-path and resume.
      h.targetWall = null;
      h.state = HumanState.Pathing;
      h.needsRepath = true;
      return;
    }
    // Must be adjacent to swing.
    if (chebyshev(h.cell, wall.cell) > this.meleeRangeTiles) {
      // Shouldn't happen from normal flow — fall back to re-path.
      h.targetWall = null;
      h.state = HumanState.Pathing;
      h.needsRepath = true;
      return;
    }
    if (h.attackCooldown > 0) return;
    this.damage.meleeAttack(
      asAttacker(h.instance.entity),
      wallTarget(wall, this.pxPerCell),
    );
    h.attackCooldown = this.secondsPerMeleeAttack;
  }

  private humanAttackOrc(h: HumanBehavior): void {
    const orc = h.targetOrc;
    if (!orc || orc.instance.entity.damageable.dead) {
      h.targetOrc = null;
      h.state = HumanState.Pathing;
      h.needsRepath = true;
      return;
    }
    if (chebyshev(h.cell, orc.cell) > this.meleeRangeTiles) {
      // Out of range — resume pathing.
      h.targetOrc = null;
      h.state = HumanState.Pathing;
      return;
    }
    if (h.attackCooldown > 0) return;
    this.damage.meleeAttack(
      asAttacker(h.instance.entity),
      unitTarget(orc, this.pxPerCell),
    );
    h.attackCooldown = this.secondsPerMeleeAttack;
  }

  /**
   * If any orc is in melee range of this human, return its behavior record.
   * Priority: closest by Chebyshev distance.
   */
  private findEngagingOrc(h: HumanBehavior): OrcBehavior | null {
    let best: OrcBehavior | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const o of this.orcs.values()) {
      if (o.instance.entity.damageable.dead) continue;
      const d = chebyshev(h.cell, o.cell);
      if (d <= this.meleeRangeTiles && d < bestD) {
        best = o;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * Find the next cell index in `h.path` that is strictly after the human's
   * current cell. `path` includes the start cell, so we must advance past
   * it on the first step.
   */
  private nextPathIndex(h: HumanBehavior): number {
    const path = h.path;
    if (!path) return 0;
    // If pathIndex-th cell is our current cell, next is pathIndex + 1.
    const at = path[h.pathIndex];
    if (at && at.x === h.cell.x && at.y === h.cell.y) return h.pathIndex + 1;
    // Otherwise find our current cell in the path and advance one past.
    for (let i = 0; i < path.length; i += 1) {
      const c = path[i]!;
      if (c.x === h.cell.x && c.y === h.cell.y) return i + 1;
    }
    return path.length;
  }

  // ------------------------------------------------------------------
  //                             Orc FSM
  // ------------------------------------------------------------------

  private tickOrc(o: OrcBehavior, dt: number): void {
    o.stepCooldown = Math.max(0, o.stepCooldown - dt);
    o.attackCooldown = Math.max(0, o.attackCooldown - dt);

    switch (o.state) {
      case OrcState.IdleAtRally: {
        const target = this.findNearestHumanInAggro(o);
        if (target) {
          o.target = target;
          o.state = OrcState.Engage;
        }
        return;
      }

      case OrcState.Engage:
        this.orcEngage(o);
        return;

      case OrcState.Attack:
        this.orcAttack(o);
        return;

      case OrcState.ReturnToRally:
        this.orcReturnToRally(o);
        return;
    }
  }

  private orcEngage(o: OrcBehavior): void {
    const target = o.target;
    if (!target || target.instance.entity.damageable.dead) {
      o.target = null;
      o.state = OrcState.ReturnToRally;
      return;
    }
    const d = chebyshev(o.cell, target.cell);
    if (d <= this.meleeRangeTiles) {
      o.state = OrcState.Attack;
      return;
    }
    // Out of aggro — drop target and return.
    if (pixelDistance(o.cell, target.cell, this.pxPerCell) > this.aggroRadius) {
      o.target = null;
      o.state = OrcState.ReturnToRally;
      return;
    }
    if (o.stepCooldown > 0) return;
    this.stepToward(o, target.cell, o.instance.entity.def);
  }

  private orcAttack(o: OrcBehavior): void {
    const target = o.target;
    if (!target || target.instance.entity.damageable.dead) {
      o.target = null;
      o.state = OrcState.ReturnToRally;
      return;
    }
    if (chebyshev(o.cell, target.cell) > this.meleeRangeTiles) {
      o.state = OrcState.Engage;
      return;
    }
    if (o.attackCooldown > 0) return;
    this.damage.meleeAttack(
      asAttacker(o.instance.entity),
      unitTarget(target, this.pxPerCell),
    );
    o.attackCooldown = this.secondsPerMeleeAttack;
  }

  private orcReturnToRally(o: OrcBehavior): void {
    if (o.cell.x === this.rally.x && o.cell.y === this.rally.y) {
      o.state = OrcState.IdleAtRally;
      return;
    }
    // Opportunistic re-engage on the way home.
    const target = this.findNearestHumanInAggro(o);
    if (target) {
      o.target = target;
      o.state = OrcState.Engage;
      return;
    }
    if (o.stepCooldown > 0) return;
    this.stepToward(o, this.rally, o.instance.entity.def);
  }

  /**
   * One-tile cardinal step from `o.cell` toward `dest`. Only walks onto
   * walkable tiles; if blocked, the orc simply stays put this tick (orcs
   * don't use Pathfinding for now — this is the simple "intercept" the
   * issue describes).
   */
  private stepToward(o: OrcBehavior, dest: Cell, def: UnitDef): void {
    const dx = dest.x - o.cell.x;
    const dy = dest.y - o.cell.y;
    // Prefer the axis with the larger delta — keeps motion on cardinals.
    let nx = o.cell.x;
    let ny = o.cell.y;
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
      nx += Math.sign(dx);
    } else if (dy !== 0) {
      ny += Math.sign(dy);
    }
    if (nx === o.cell.x && ny === o.cell.y) return;
    if (!this.pathfinding.isWalkable(nx, ny)) return;
    o.cell = { x: nx, y: ny };
    o.stepCooldown = this.secondsPerTile(def);
  }

  private findNearestHumanInAggro(o: OrcBehavior): HumanBehavior | null {
    let best: HumanBehavior | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const h of this.humansProvider()) {
      if (h.instance.entity.damageable.dead) continue;
      const d = pixelDistance(o.cell, h.cell, this.pxPerCell);
      if (d <= this.aggroRadius && d < bestD) {
        best = h;
        bestD = d;
      }
    }
    return best;
  }

  private secondsPerTile(def: UnitDef): number {
    const speed = def.stats.speed;
    if (speed <= 0) return Number.POSITIVE_INFINITY;
    return this.pxPerCell / speed;
  }
}

