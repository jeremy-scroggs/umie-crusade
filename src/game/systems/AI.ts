import type { UnitDef } from '@/types';
import { SimpleEventEmitter } from '@/game/components';
import type { EventEmitterLike } from '@/game/components';
import type { Orc } from '@/game/entities/Orc';
import type { Human } from '@/game/entities/Human';
import type { Building } from '@/game/entities/Building';
import type { TargetLike, Vec2 } from '@/game/entities/Projectile';
import type { Cell, Pathfinding } from './Pathfinding';
import type { DamageSystem, MeleeAttackerLike } from './Damage';
import { GameEvents, type WallDamagedPayload } from './events';
import type { RepairResult } from './Building';

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

/**
 * Gukka FSM (#30). Builder-role orcs idle until a `wall:damaged` event
 * gives them a target, walk to the wall, then call into BuildingSystem's
 * auto-repair loop. The FSM is intentionally additive — it lives
 * alongside the fighter-orc FSM (`OrcState`) and is driven by a
 * separate `registerGukka` so the existing combat path is untouched.
 */
export const GukkaState = {
  Idle: 'idle',
  MoveToRepair: 'move-to-repair',
  Repairing: 'repairing',
} as const;
export type GukkaStateName = (typeof GukkaState)[keyof typeof GukkaState];

/**
 * Per-order behavior tags (#67). The four Crusade orders carry their
 * tag in `UnitDef.abilities[]` (the schema has no dedicated `behavior`
 * field — D5/D6 chose `abilities[]` as the carrier). Each tag triggers
 * exactly one small mutation in the existing human tick path; no new
 * FSMs.
 */
export const OrderTag = {
  /** Order of Honor — bias target priority toward gates over flanks. */
  GateCharge: 'gate-charge',
  /** Rangers of Justice — stop advancing once inside archery range. */
  Volley: 'volley',
  /** Knights of Valor — never retreat (HP threshold ignored). */
  NoRetreat: 'no-retreat',
  /** Paladins of Compassion — prefer escorting wounded allies. */
  EscortWounded: 'escort-wounded',
} as const;
export type OrderTagValue = (typeof OrderTag)[keyof typeof OrderTag];

/**
 * Default archery range (in tiles) for `OrderTag.Volley` units. The
 * unit schema does not yet carry a per-unit `range` stat, and the
 * #67 bail rule forbids editing the human JSON. Callers can override
 * via `AISystemOptions.archeryRangeTiles`. A future schema update
 * (out-of-scope for #67) will move this onto `UnitDef.stats`.
 */
export const RANGERS_RANGE_TILES_DEFAULT = 5;

/**
 * Default escort-wounded HP ratio: a paladin treats any ally below
 * this fraction of max HP as "wounded" and prioritises escorting
 * them. Overridable via `AISystemOptions.escortWoundedRatio`.
 */
export const ESCORT_WOUNDED_RATIO_DEFAULT = 0.6;

/**
 * Default escort radius (in tiles) — paladins only consider wounded
 * allies inside this Chebyshev distance.
 */
export const ESCORT_RADIUS_TILES_DEFAULT = 6;

/**
 * Default retreat HP ratio. Set to `0` so non-knight humans never
 * retreat unless the scene wires a positive value in
 * `AISystemOptions.retreatThresholdRatio`. Knights short-circuit the
 * gate via `OrderTag.NoRetreat` regardless.
 */
export const RETREAT_THRESHOLD_RATIO_DEFAULT = 0;

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

/**
 * Gukka instance — same shape as `OrcInstance` (Gukkas are Orcs under
 * the hood). A separate alias keeps the call sites self-documenting:
 * `registerGukka(...)` vs `registerOrc(...)`.
 */
export type GukkaInstance = OrcInstance;

/**
 * Minimal store contract for the Gukka gold-gate. Mirrors
 * `BuildingStoreLike` but shares the type only by structure so AI.ts
 * doesn't need to import the `BuildingSystem` types eagerly.
 */
export interface GukkaStoreLike {
  readonly gold: number;
}

/**
 * The slice of `BuildingSystem` AI needs to drive Gukka repairs. We
 * inject only the auto-repair entry-point so AI never reaches into the
 * placement / manual-repair surface.
 */
export interface GukkaBuildingSystem {
  tryAutoRepairWall(cell: Cell, hpAmount: number, costGold: number): RepairResult;
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
  /**
   * Read-only gold source for the Gukka auto-repair gate. When present,
   * Gukkas check `store.gold >= def.repairCostGold` before reacting to
   * `wall:damaged`. When absent, no Gukka ever reacts (the gate fails
   * closed). The actual gold debit happens inside
   * `BuildingSystem.tryAutoRepairWall` — this option is only the
   * pre-flight check.
   */
  store?: GukkaStoreLike;
  /**
   * BuildingSystem providing `tryAutoRepairWall(cell, hp, cost)`. When
   * absent, Gukka repair attempts no-op (the FSM still moves through
   * its states for tests that exercise transitions). In production the
   * scene wires the real `BuildingSystem` here.
   */
  buildingSystem?: GukkaBuildingSystem;
  /**
   * Per-order hook tuning (#67) — Rangers of Justice (`volley`) halt
   * advancing toward `fortGoal` once inside this Chebyshev distance.
   * Defaults to `RANGERS_RANGE_TILES_DEFAULT`. Encoded as a ctor knob
   * because the unit schema does not (yet) carry a per-unit `range`
   * stat and the issue bail rule forbids editing the human JSON.
   */
  archeryRangeTiles?: number;
  /**
   * Generic retreat HP ratio (#67). When > 0, non-Knight humans whose
   * `hp / maxHp` drops below this fraction transition to `Idle` and
   * drop their current target. Knights of Valor (`no-retreat`) ignore
   * the threshold entirely. Default `RETREAT_THRESHOLD_RATIO_DEFAULT`
   * (zero — disabled). Sceens / waves can wire a positive value once
   * retreat tuning lands.
   */
  retreatThresholdRatio?: number;
  /**
   * Per-order hook (#67) — Paladins (`escort-wounded`) treat allies
   * below this HP fraction as "wounded" and prefer escorting them
   * over advancing. Default `ESCORT_WOUNDED_RATIO_DEFAULT`.
   */
  escortWoundedRatio?: number;
  /**
   * Per-order hook (#67) — Paladins only escort wounded allies inside
   * this Chebyshev distance (in tiles). Default
   * `ESCORT_RADIUS_TILES_DEFAULT`.
   */
  escortRadiusTiles?: number;
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

/** Internal per-Gukka state record (#30). */
export interface GukkaBehavior {
  readonly instance: GukkaInstance;
  state: GukkaStateName;
  /**
   * Wall cell currently being serviced (in `MoveToRepair` /
   * `Repairing`). `null` while `Idle`.
   */
  targetWallCell: Cell | null;
  /** Seconds until next tile step. */
  stepCooldown: number;
  /** Seconds until next repair tick (cadence from `def.repairCooldownMs`). */
  repairCooldown: number;
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
  readonly archeryRangeTiles: number;
  readonly retreatThresholdRatio: number;
  readonly escortWoundedRatio: number;
  readonly escortRadiusTiles: number;

  private readonly pathfinding: Pathfinding;
  private readonly damage: DamageSystem;
  private readonly pathEmitter: EventEmitterLike;
  private readonly wallAt: (x: number, y: number) => Building | null;
  private readonly humansProvider: () => Iterable<HumanBehavior>;
  private readonly store: GukkaStoreLike | undefined;
  private readonly buildingSystem: GukkaBuildingSystem | undefined;

  private readonly humans: Map<Human, HumanBehavior> = new Map();
  private readonly orcs: Map<Orc, OrcBehavior> = new Map();
  private readonly gukkas: Map<Orc, GukkaBehavior> = new Map();

  private readonly onPathInvalidated = (): void => {
    // Mark every human for re-path on next tick. Cheap + deterministic.
    for (const h of this.humans.values()) {
      h.needsRepath = true;
    }
  };

  /**
   * Shared-bus handler for `wall:damaged`. Every idle Gukka with
   * sufficient gold latches onto the cell and transitions to
   * `MoveToRepair`. Already-busy Gukkas ignore the event — they
   * finish their current job first. Gold gate: if no `store` was
   * supplied, every Gukka bails (fail-closed).
   */
  private readonly onWallDamaged = (...args: unknown[]): void => {
    const payload = args[0] as WallDamagedPayload | undefined;
    if (!payload) return;
    if (this.gukkas.size === 0) return;
    const targetCell: Cell = { x: payload.x, y: payload.y };
    for (const g of this.gukkas.values()) {
      if (g.state !== GukkaState.Idle) continue;
      if (g.instance.entity.damageable.dead) continue;
      const def = g.instance.entity.def;
      const cost = def.repairCostGold;
      if (cost === undefined) continue;
      const gold = this.store?.gold ?? -1;
      if (gold < cost) continue;
      g.targetWallCell = targetCell;
      g.state = GukkaState.MoveToRepair;
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
    this.archeryRangeTiles = opts.archeryRangeTiles ?? RANGERS_RANGE_TILES_DEFAULT;
    this.retreatThresholdRatio =
      opts.retreatThresholdRatio ?? RETREAT_THRESHOLD_RATIO_DEFAULT;
    this.escortWoundedRatio = opts.escortWoundedRatio ?? ESCORT_WOUNDED_RATIO_DEFAULT;
    this.escortRadiusTiles = opts.escortRadiusTiles ?? ESCORT_RADIUS_TILES_DEFAULT;
    this.emitter = opts.emitter ?? new SimpleEventEmitter();
    this.pathEmitter = opts.pathEmitter ?? this.emitter;
    this.wallAt = opts.wallAt ?? (() => null);
    this.humansProvider = opts.humansProvider ?? (() => this.humans.values());
    this.store = opts.store;
    this.buildingSystem = opts.buildingSystem;

    this.pathEmitter.on(GameEvents.PathInvalidated, this.onPathInvalidated);
    // The `wall:damaged` bus event is emitted by `BuildingSystem` (#30).
    // Subscribe on the same `emitter` instance the BuildingSystem uses;
    // tests / scenes pass the shared bus here.
    this.emitter.on(GameEvents.WallDamaged, this.onWallDamaged);
  }

  destroy(): void {
    this.pathEmitter.off(GameEvents.PathInvalidated, this.onPathInvalidated);
    this.emitter.off(GameEvents.WallDamaged, this.onWallDamaged);
    this.humans.clear();
    this.orcs.clear();
    this.gukkas.clear();
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

  /**
   * Register a Gukka — starts in `Idle`. Throws when the unit's
   * `role` is not `'builder'` so a fighter-orc can't be smuggled into
   * the Gukka tick path.
   */
  registerGukka(instance: GukkaInstance): GukkaBehavior {
    const existing = this.gukkas.get(instance.entity);
    if (existing) return existing;
    const role = instance.entity.def.role;
    if (role !== 'builder') {
      throw new Error(
        `AISystem.registerGukka: '${instance.entity.def.id}' has role '${role ?? 'undefined'}', expected 'builder'`,
      );
    }
    const behavior: GukkaBehavior = {
      instance,
      state: GukkaState.Idle,
      targetWallCell: null,
      stepCooldown: 0,
      repairCooldown: 0,
      cell: { x: instance.cell.x, y: instance.cell.y },
    };
    this.gukkas.set(instance.entity, behavior);
    return behavior;
  }

  unregisterGukka(entity: Orc): void {
    this.gukkas.delete(entity);
  }

  /** Inspect a human's current behavior — for tests + UI. */
  humanBehavior(entity: Human): HumanBehavior | undefined {
    return this.humans.get(entity);
  }

  /** Inspect an orc's current behavior — for tests + UI. */
  orcBehavior(entity: Orc): OrcBehavior | undefined {
    return this.orcs.get(entity);
  }

  /** Inspect a Gukka's current behavior — for tests + UI. */
  gukkaBehavior(entity: Orc): GukkaBehavior | undefined {
    return this.gukkas.get(entity);
  }

  /**
   * Manual override for the Gukka auto-repair task. Called by the
   * player-facing UI (HUD / tap-to-cancel) — drops the current target
   * + cooldown and returns the FSM to `Idle`. No-op when the Gukka is
   * already idle or when the entity is unknown to the AI.
   */
  cancelGukkaTask(entity: Orc): void {
    const g = this.gukkas.get(entity);
    if (!g) return;
    g.state = GukkaState.Idle;
    g.targetWallCell = null;
    g.repairCooldown = 0;
  }

  /**
   * Iterator over every registered human's behavior record. Lets the
   * scene-side glue (e.g. the hero ability dispatch in `gameBridge`)
   * collect candidate targets without poking the private map. Live
   * iteration — callers that mutate during traversal must copy first.
   */
  allHumanBehaviors(): IterableIterator<HumanBehavior> {
    return this.humans.values();
  }

  /**
   * Iterator over every registered orc's behavior record. Symmetric
   * with `allHumanBehaviors` — used by future systems that need to
   * walk the orc set without reaching into the private map.
   */
  allOrcBehaviors(): IterableIterator<OrcBehavior> {
    return this.orcs.values();
  }

  /** Per-tick step. Drives all FSMs. */
  update(dt: number): void {
    for (const h of this.humans.values()) {
      if (h.instance.entity.damageable.dead) continue;
      this.tickHuman(h, dt);
    }
    for (const o of this.orcs.values()) {
      if (o.instance.entity.damageable.dead) continue;
      this.tickOrc(o, dt);
    }
    for (const g of this.gukkas.values()) {
      if (g.instance.entity.damageable.dead) continue;
      this.tickGukka(g, dt);
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

    // Per-order retreat hook (#67). Generic threshold is checked first;
    // Knights of Valor (`no-retreat`) short-circuit it. Disabled in
    // production by default (`retreatThresholdRatio` defaults to 0).
    if (this.shouldRetreat(h)) {
      h.state = HumanState.Idle;
      h.targetWall = null;
      h.targetOrc = null;
      h.path = null;
      return;
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

    // Per-order hook (#67) — Rangers of Justice halt at archery range.
    // Once inside range, the ranger drops its forward path so the
    // next-step block below short-circuits to "no further movement".
    if (this.rangersHalt(h)) {
      return;
    }

    // Per-order hook (#67) — Paladins step toward a wounded ally
    // instead of the fort goal when one is in range.
    if (this.escortStep(h)) {
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
      // Per-order hook (#67) — Order of Honor biases its target priority
      // toward a Chebyshev-1 gate, when one exists, in preference to the
      // direct next-cell wall.
      const preferredGate = this.gateChargeOverride(h);
      if (preferredGate) {
        h.targetWall = preferredGate;
        h.state = HumanState.AttackWall;
        return;
      }
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
  //                Per-order behavior hooks (#67)
  // ------------------------------------------------------------------

  /** Tag-presence helper. Reads `def.abilities[]` (D5/D6 carrier). */
  private hasOrderTag(h: HumanBehavior, tag: OrderTagValue): boolean {
    const abilities = h.instance.entity.def.abilities;
    return Array.isArray(abilities) && abilities.includes(tag);
  }

  /**
   * Order of Honor (`gate-charge`) — when the human's next-step is
   * blocked, scan Chebyshev-1 cells for a Building of category
   * `'gate'` and prefer it as the attack target over the flanking
   * wall directly in front. Returns the preferred gate Building, or
   * `null` if none applies (non-Order, no adjacent gate, etc.).
   */
  private gateChargeOverride(h: HumanBehavior): Building | null {
    if (!this.hasOrderTag(h, OrderTag.GateCharge)) return null;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = h.cell.x + dx;
        const ny = h.cell.y + dy;
        const candidate = this.wallAt(nx, ny);
        if (!candidate || candidate.breakable.damageable.dead) continue;
        if (candidate.def.category === 'gate') return candidate;
      }
    }
    return null;
  }

  /**
   * Rangers of Justice (`volley`) — once the ranger is inside its
   * archery range of the fort goal, halt forward motion. The ranger
   * stops stepping further toward the fort while staying in `Pathing`
   * so the existing `findEngagingOrc` upstream check still pulls it
   * into ATTACK_ORC when an orc closes. Returns `true` when the hook
   * fired (caller should early-return without stepping).
   */
  private rangersHalt(h: HumanBehavior): boolean {
    if (!this.hasOrderTag(h, OrderTag.Volley)) return false;
    if (chebyshev(h.cell, this.fortGoal) > this.archeryRangeTiles) return false;
    return true;
  }

  /**
   * Paladins of Compassion (`escort-wounded`) — when a wounded ally
   * is within `escortRadiusTiles`, step toward that ally instead of
   * advancing along the fort path. Reuses `stepToward` so movement
   * cadence matches the rest of the AI. Returns `true` when the hook
   * fired (caller should early-return).
   */
  private escortStep(h: HumanBehavior): boolean {
    if (!this.hasOrderTag(h, OrderTag.EscortWounded)) return false;
    const ally = this.findWoundedAlly(h);
    if (!ally) return false;
    // Already adjacent — escort holds station; the existing combat
    // path handles engaged orcs upstream.
    if (chebyshev(h.cell, ally.cell) <= this.meleeRangeTiles) return true;
    if (h.stepCooldown > 0) return true;
    this.stepToward(h, ally.cell, h.instance.entity.def);
    return true;
  }

  /**
   * Find the closest wounded ally human (excluding the paladin
   * itself). "Wounded" means `hp / maxHp < escortWoundedRatio`.
   * Returns `null` when no ally qualifies inside `escortRadiusTiles`.
   */
  private findWoundedAlly(h: HumanBehavior): HumanBehavior | null {
    let best: HumanBehavior | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const other of this.humansProvider()) {
      if (other === h) continue;
      if (other.instance.entity.damageable.dead) continue;
      const dmg = other.instance.entity.damageable;
      const ratio = dmg.maxHp > 0 ? dmg.hp / dmg.maxHp : 1;
      if (ratio >= this.escortWoundedRatio) continue;
      const d = chebyshev(h.cell, other.cell);
      if (d > this.escortRadiusTiles) continue;
      if (d < bestD) {
        best = other;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * Knights of Valor (`no-retreat`) short-circuit the generic retreat
   * gate. When `retreatThresholdRatio` is positive AND the human is
   * not a Knight AND HP is below the threshold, the human retreats
   * (drops to IDLE). Returns `true` when the human should retreat
   * this tick.
   */
  private shouldRetreat(h: HumanBehavior): boolean {
    if (this.retreatThresholdRatio <= 0) return false;
    if (this.hasOrderTag(h, OrderTag.NoRetreat)) return false;
    const dmg = h.instance.entity.damageable;
    if (dmg.maxHp <= 0) return false;
    return dmg.hp / dmg.maxHp < this.retreatThresholdRatio;
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
   * One-tile cardinal step from `mover.cell` toward `dest`. Only walks
   * onto walkable tiles; if blocked, the mover simply stays put this
   * tick (orcs/gukkas don't use Pathfinding for now — this is the
   * simple "intercept" the issue describes). Generic in the mover
   * shape so both `OrcBehavior` and `GukkaBehavior` reuse it.
   */
  private stepToward(
    mover: { cell: Cell; stepCooldown: number },
    dest: Cell,
    def: UnitDef,
  ): void {
    const dx = dest.x - mover.cell.x;
    const dy = dest.y - mover.cell.y;
    // Prefer the axis with the larger delta — keeps motion on cardinals.
    let nx = mover.cell.x;
    let ny = mover.cell.y;
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
      nx += Math.sign(dx);
    } else if (dy !== 0) {
      ny += Math.sign(dy);
    }
    if (nx === mover.cell.x && ny === mover.cell.y) return;
    if (!this.pathfinding.isWalkable(nx, ny)) return;
    mover.cell = { x: nx, y: ny };
    mover.stepCooldown = this.secondsPerTile(def);
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

  // ------------------------------------------------------------------
  //                            Gukka FSM
  // ------------------------------------------------------------------

  private tickGukka(g: GukkaBehavior, dt: number): void {
    g.stepCooldown = Math.max(0, g.stepCooldown - dt);
    g.repairCooldown = Math.max(0, g.repairCooldown - dt);

    switch (g.state) {
      case GukkaState.Idle:
        return;

      case GukkaState.MoveToRepair:
        this.gukkaMoveToRepair(g);
        return;

      case GukkaState.Repairing:
        this.gukkaRepair(g);
        return;
    }
  }

  /**
   * Move-to-repair tick. If the wall has vanished or is already pristine,
   * fall back to Idle. When adjacent (Chebyshev ≤ 1), transition to
   * `Repairing` and reset the repair cooldown so the first hit lands
   * on entry.
   */
  private gukkaMoveToRepair(g: GukkaBehavior): void {
    const cell = g.targetWallCell;
    if (!cell) {
      g.state = GukkaState.Idle;
      return;
    }
    const wall = this.wallAt(cell.x, cell.y);
    if (!wall || wall.breakable.dead) {
      g.state = GukkaState.Idle;
      g.targetWallCell = null;
      return;
    }
    if (wall.breakable.hp >= wall.breakable.maxHp) {
      g.state = GukkaState.Idle;
      g.targetWallCell = null;
      return;
    }
    if (chebyshev(g.cell, cell) <= this.meleeRangeTiles) {
      g.state = GukkaState.Repairing;
      g.repairCooldown = 0;
      return;
    }
    if (g.stepCooldown > 0) return;
    this.stepToward(g, cell, g.instance.entity.def);
  }

  /**
   * Repairing tick. Calls `BuildingSystem.tryAutoRepairWall(...)` once
   * per `def.repairCooldownMs` interval. Drops back to Idle when the
   * wall reaches max HP, vanishes, or the player runs out of gold.
   */
  private gukkaRepair(g: GukkaBehavior): void {
    const cell = g.targetWallCell;
    if (!cell) {
      g.state = GukkaState.Idle;
      return;
    }
    const wall = this.wallAt(cell.x, cell.y);
    if (!wall || wall.breakable.dead) {
      g.state = GukkaState.Idle;
      g.targetWallCell = null;
      return;
    }
    if (wall.breakable.hp >= wall.breakable.maxHp) {
      g.state = GukkaState.Idle;
      g.targetWallCell = null;
      return;
    }
    // Out of melee range (e.g. dragged off by some future shove
    // interaction) — re-approach.
    if (chebyshev(g.cell, cell) > this.meleeRangeTiles) {
      g.state = GukkaState.MoveToRepair;
      return;
    }
    if (g.repairCooldown > 0) return;

    const def = g.instance.entity.def;
    const amount = def.repairAmount;
    const cost = def.repairCostGold;
    const cooldownMs = def.repairCooldownMs;
    if (amount === undefined || cost === undefined || cooldownMs === undefined) {
      // Non-builder unit smuggled in — bail safely.
      g.state = GukkaState.Idle;
      g.targetWallCell = null;
      return;
    }

    const sys = this.buildingSystem;
    if (!sys) {
      // No BuildingSystem wired — nothing to debit / heal. Stay in
      // Repairing but back off so we don't busy-loop; the test seam
      // pattern matches the rest of the file (no-op + eventual exit
      // when the wall is healed externally).
      g.repairCooldown = cooldownMs / 1000;
      return;
    }

    const result = sys.tryAutoRepairWall(cell, amount, cost);
    if (!result.ok) {
      // Insufficient gold or any other failure → drop to Idle and let
      // a future `wall:damaged` re-trigger when the player can afford
      // it again. This keeps the FSM strictly forward-progress.
      g.state = GukkaState.Idle;
      g.targetWallCell = null;
      g.repairCooldown = 0;
      return;
    }

    g.repairCooldown = cooldownMs / 1000;
    if (wall.breakable.hp >= wall.breakable.maxHp) {
      g.state = GukkaState.Idle;
      g.targetWallCell = null;
    }
  }
}

