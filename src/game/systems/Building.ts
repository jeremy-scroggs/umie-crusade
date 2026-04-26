import type { EventEmitterLike } from '@/game/components';
import type { WallDef } from '@/types';
import { Building } from '@/game/entities/Building';
import { GameEvents, type WallEventPayload } from './events';
import type { Cell, Pathfinding } from './Pathfinding';

/**
 * BuildingSystem — player-driven wall placement on the grid.
 *
 * Responsibilities:
 *  - Validate a candidate cell against grid + occupancy + fort-core
 *    rules (and an optional path-critical trap check).
 *  - Debit gold via the supplied store (`spendGold(n)` returns boolean).
 *  - Emit `wall:built` with `{ x, y }` so Pathfinding (#7) flips the
 *    cell to impassable and invalidates its path cache.
 *
 * The system emits the event; Pathfinding owns the grid mutation. This
 * matches the decoupling established in #7. All balance numbers (cost,
 * armor, hp) flow from the validated `WallDef`; this file contains zero
 * hardcoded balance values.
 *
 * Construction is jsdom-safe — no Phaser top-level import.
 */

/** Minimum store shape — same contract as Economy's `EconomyStoreLike`. */
export interface BuildingStoreLike {
  readonly gold: number;
  spendGold(amount: number): boolean;
}

export interface BuildingSystemOptions {
  /** Validated wall definition. `buildCost.gold` is read at runtime. */
  def: WallDef;
  /** Pathfinding instance — used for bounds, walkability, trap pre-check. */
  pathfinding: Pathfinding;
  /** Emitter shared with Pathfinding so `wall:built` is observed there. */
  emitter: EventEmitterLike;
  /** Store with `spendGold(n): boolean`. Test seam + production bridge. */
  store: BuildingStoreLike;
  /**
   * Optional fort-core cell — placements on this cell are rejected, and
   * if `spawns` is also provided the trap pre-check uses this as the
   * destination. When omitted, neither check runs.
   */
  fortCore?: Cell;
  /**
   * Optional spawn cells — used for the trap pre-check. When provided
   * along with `fortCore`, a candidate is rejected if blocking it would
   * leave NO spawn able to reach the fort. When either is omitted, the
   * trap check is skipped (caller has explicitly deferred it).
   */
  spawns?: readonly Cell[];
}

/** Why a placement was rejected. */
export type PlaceFailure =
  | 'out-of-bounds'
  | 'occupied'
  | 'impassable'
  | 'fort-core'
  | 'would-trap-fort'
  | 'insufficient-gold';

export interface PlaceSuccess {
  ok: true;
  cell: Cell;
  /** Gold debited — equals `def.buildCost.gold`. */
  cost: number;
}

export interface PlaceRejection {
  ok: false;
  reason: PlaceFailure;
  /** Only set for `insufficient-gold`. */
  needed?: number;
  /** Only set for `insufficient-gold`. */
  have?: number;
}

export type PlaceResult = PlaceSuccess | PlaceRejection;

/** Why a repair was rejected. */
export type RepairFailure =
  | 'not-a-wall'
  | 'bad-amount'
  | 'at-max-hp'
  | 'insufficient-gold';

export interface RepairSuccess {
  ok: true;
  cell: Cell;
  /** Whole HP restored. May be < requested if capped at maxHp. */
  hpRestored: number;
  /** Gold actually debited — equals `hpRestored * def.repairCost.goldPerHp`. */
  cost: number;
}

export interface RepairRejection {
  ok: false;
  reason: RepairFailure;
  /** Only set for `insufficient-gold`. */
  needed?: number;
  /** Only set for `insufficient-gold`. */
  have?: number;
}

export type RepairResult = RepairSuccess | RepairRejection;

export class BuildingSystem {
  readonly def: WallDef;
  readonly emitter: EventEmitterLike;
  private readonly pathfinding: Pathfinding;
  private readonly store: BuildingStoreLike;
  private readonly fortCore?: Cell;
  private readonly spawns: readonly Cell[];
  /**
   * Walls we have placed, keyed `${x},${y}`. Each entry maps to the
   * `Building` entity for that cell (used by `tryRepairWall`).
   */
  private readonly walls = new Map<string, Building>();

  constructor(opts: BuildingSystemOptions) {
    this.def = opts.def;
    this.pathfinding = opts.pathfinding;
    this.emitter = opts.emitter;
    this.store = opts.store;
    this.fortCore = opts.fortCore;
    this.spawns = opts.spawns ?? [];
  }

  /**
   * Try to place a wall at `cell`. Returns a discriminated result; never
   * throws. On success, debits gold and emits `wall:built`.
   *
   * Rejection order:
   *   1. out-of-bounds
   *   2. fort-core (if configured)
   *   3. occupied (already placed by us)
   *   4. impassable (base terrain or other dynamic obstruction)
   *   5. would-trap-fort (only if fortCore + spawns configured)
   *   6. insufficient-gold (only check that mutates the store)
   */
  tryPlaceWall(cell: Cell): PlaceResult {
    const { x, y } = cell;

    if (!this.pathfinding.inBounds(x, y)) {
      return { ok: false, reason: 'out-of-bounds' };
    }

    if (this.fortCore && this.fortCore.x === x && this.fortCore.y === y) {
      return { ok: false, reason: 'fort-core' };
    }

    const key = `${x},${y}`;
    if (this.walls.has(key)) {
      return { ok: false, reason: 'occupied' };
    }

    if (!this.pathfinding.isWalkable(x, y)) {
      return { ok: false, reason: 'impassable' };
    }

    if (this.fortCore && this.spawns.length > 0) {
      if (this.wouldTrapFort(cell, this.fortCore, this.spawns)) {
        return { ok: false, reason: 'would-trap-fort' };
      }
    }

    const cost = this.def.buildCost.gold;
    const have = this.store.gold;
    if (!this.store.spendGold(cost)) {
      return {
        ok: false,
        reason: 'insufficient-gold',
        needed: cost,
        have,
      };
    }

    // Build the per-cell entity. Each Building owns its own emitter so
    // per-wall 'damaged'/'destroyed' events stay scoped to that wall;
    // we forward the system-level `wall:destroyed` onto the shared bus
    // (where Pathfinding listens) below.
    const building = Building.fromDef(this.def, undefined, { x, y });
    building.emitter.on(GameEvents.WallDestroyed, (...args: unknown[]) => {
      this.walls.delete(key);
      this.emitter.emit(GameEvents.WallDestroyed, ...args);
    });
    this.walls.set(key, building);

    const payload: WallEventPayload = { x, y };
    this.emitter.emit(GameEvents.WallBuilt, payload);

    return { ok: true, cell: { x, y }, cost };
  }

  /** True if a wall has been placed by this system at `cell`. */
  hasWallAt(cell: Cell): boolean {
    return this.walls.has(`${cell.x},${cell.y}`);
  }

  /**
   * Look up the `Building` placed at `cell`, or `undefined` if none.
   * Exposed for callers (HUD, future tower-placement system, tests)
   * that need to inspect HP / damage state.
   */
  buildingAt(cell: Cell): Building | undefined {
    return this.walls.get(`${cell.x},${cell.y}`);
  }

  /**
   * Manually repair a placed wall. Caller-driven only — there is NO
   * auto-repair in M1. The Gukka auto-repair (M2) will be a separate
   * caller of this same API.
   *
   * Order of checks:
   *   1. not-a-wall    — no placed wall at this cell
   *   2. bad-amount    — hpAmount must be a positive integer
   *   3. at-max-hp     — wall is already pristine (no HP missing)
   *   4. insufficient-gold — only check that mutates the store
   *
   * On success: debits `restorable * goldPerHp`, heals the Breakable
   * by `restorable`, returns `{ ok, cell, hpRestored, cost }`.
   * `restorable = min(hpAmount, maxHp - currentHp)`.
   *
   * Per-HP cost is read from `def.repairCost.goldPerHp` — zero
   * hardcoded magic numbers.
   */
  tryRepairWall(cell: Cell, hpAmount: number): RepairResult {
    const key = `${cell.x},${cell.y}`;
    const building = this.walls.get(key);
    if (!building) {
      return { ok: false, reason: 'not-a-wall' };
    }

    if (
      !Number.isInteger(hpAmount) ||
      hpAmount <= 0
    ) {
      return { ok: false, reason: 'bad-amount' };
    }

    const breakable = building.breakable;
    const missing = breakable.maxHp - breakable.hp;
    if (missing <= 0) {
      return { ok: false, reason: 'at-max-hp' };
    }

    const restorable = Math.min(hpAmount, missing);
    const goldPerHp = this.def.repairCost.goldPerHp;
    const cost = restorable * goldPerHp;
    const have = this.store.gold;
    if (!this.store.spendGold(cost)) {
      return {
        ok: false,
        reason: 'insufficient-gold',
        needed: cost,
        have,
      };
    }

    const restored = breakable.heal(restorable);

    return {
      ok: true,
      cell: { x: cell.x, y: cell.y },
      hpRestored: restored,
      cost,
    };
  }

  /**
   * Path-critical check: temporarily mark the cell impassable, run a
   * sync `findPath` from each spawn to the fort. If *all* spawns fail
   * to reach the fort, the cell is path-critical → reject placement.
   *
   * The mutation is reverted before returning so the real wall-built
   * flow remains the single source of truth for grid state.
   *
   * Pathfinding's `findPath` returns a Promise but uses easystar in
   * sync mode — the resolver fires inline on `calculate()`. We capture
   * the resolved value via `.then` synchronously into a local; this is
   * safe because the resolver runs before the surrounding microtask
   * boundary in sync mode. To avoid relying on that subtle ordering,
   * we instead use easystar's exposed grid through a small helper:
   * place wall, ask Pathfinding for paths, await them, revert.
   *
   * Implementation note: we keep the helper synchronous by reading
   * `isWalkable` after toggling the wall (impassable cells short-circuit
   * findPath to `null`) — but that doesn't tell us if a *route* exists.
   * We must actually call `findPath`. Since `findPath` is async (Promise
   * over a sync callback), we wrap each call in a thenable and collect
   * results synchronously by exploiting easystar sync mode (the resolver
   * fires inside `calculate()` which runs before `findPath` returns its
   * promise's then-chain). To remain robust we instead implement the
   * trap check using `findPathSync` semantics by running BFS over the
   * Pathfinding grid via `isWalkable` + neighbor walks — see
   * `routeExists` below.
   */
  private wouldTrapFort(
    cell: Cell,
    fortCore: Cell,
    spawns: readonly Cell[],
  ): boolean {
    // Temporarily block the candidate cell on the pathfinder.
    this.pathfinding.setWall(cell.x, cell.y, true);
    try {
      // If ANY spawn can still reach the fort, placement is fine.
      for (const spawn of spawns) {
        if (this.routeExists(spawn, fortCore)) return false;
      }
      return true;
    } finally {
      // Always revert — the real placement re-applies via the event below.
      this.pathfinding.setWall(cell.x, cell.y, false);
    }
  }

  /**
   * Cardinal-only BFS over `pathfinding.isWalkable`. Diagonals are off
   * by default in Pathfinding; this matches that. Returns true iff a
   * walkable route from `from` to `to` exists.
   */
  private routeExists(from: Cell, to: Cell): boolean {
    if (!this.pathfinding.isWalkable(from.x, from.y)) return false;
    if (!this.pathfinding.isWalkable(to.x, to.y)) return false;
    if (from.x === to.x && from.y === to.y) return true;

    const seen = new Set<string>();
    const queue: Cell[] = [{ x: from.x, y: from.y }];
    seen.add(`${from.x},${from.y}`);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      const neighbors: Cell[] = [
        { x: cur.x + 1, y: cur.y },
        { x: cur.x - 1, y: cur.y },
        { x: cur.x, y: cur.y + 1 },
        { x: cur.x, y: cur.y - 1 },
      ];
      for (const n of neighbors) {
        const k = `${n.x},${n.y}`;
        if (seen.has(k)) continue;
        if (!this.pathfinding.isWalkable(n.x, n.y)) continue;
        if (n.x === to.x && n.y === to.y) return true;
        seen.add(k);
        queue.push(n);
      }
    }

    return false;
  }
}
