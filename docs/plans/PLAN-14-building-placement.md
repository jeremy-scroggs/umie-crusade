# PLAN-14 — Building: grid wall placement + pathfinding recompute

## Context

Issue #14 introduces the player-driven wall-placement loop. The player picks
a grid cell, the system validates it, deducts gold, and emits `wall:built` —
which Pathfinding (#7) is already wired to consume to flip the cell to
impassable and invalidate its path cache.

Upstream already merged:
- `wall-wood.json` (#11) — `buildCost.gold: 20`, `hp: 100`, etc. The system
  reads the def at runtime; no hardcoded cost.
- `Pathfinding` (#7) — listens to `GameEvents.WallBuilt` /
  `WallDestroyed`, exposes `findPath`, `isWalkable`, `inBounds`,
  `setWall`. Decoupled — Building only emits.
- `Economy` (#13) / `gameStore.spendGold(amount): boolean` — returns false
  on insufficient funds without throwing.
- `BuildingDef` schema with discriminated union on `category` (`wall` vs
  `tower`); a `WallDef` is a discriminator.
- `Building` entity factory (`Building.fromDef(def, emitter)`) — used today
  for instantiation by the AI tests.

The orchestrator note clarifies that mobile touch input (#21) is deferred.
This issue exposes a programmatic `tryPlaceWall(cell)` API; the input wiring
lands later.

## Branch

`feat/14-building-placement`

## Approach

### 1. New system: `src/game/systems/Building.ts`

A pure-TS class (jsdom-safe — no Phaser top-level import) that:
- Reads a validated `BuildingDef` (must be `category === 'wall'`) at
  construction. All balance numbers (cost, hp via def consumers) flow from
  the def — zero hardcoded magic.
- Holds references to:
  - `pathfinding: Pathfinding` — used for `inBounds`, `isWalkable`, and
    the path-critical pre-check.
  - `emitter: EventEmitterLike` — used to emit `wall:built` (and where
    Pathfinding is also subscribed).
  - `store: { gold; spendGold(n): boolean }` — same `EconomyStoreLike`
    contract Economy uses, for testability via `bridge.getGameStore()` in
    production.
  - Optional `fortCore: Cell` and `spawns: Cell[]` for path-critical
    validation (caller passes these from the parsed map's `spawns` object
    layer; if omitted, the trap-prevention check is skipped — see
    Decisions).
- Tracks a private `Set<string>` of placed walls keyed `"x,y"` so we can
  reject re-placement on the same cell without round-tripping through
  Pathfinding (Pathfinding's `setWall` is also idempotent, but the system
  needs to reject *before* spending gold).

#### API

```ts
export type PlaceFailure =
  | 'out-of-bounds'
  | 'occupied'         // already a wall here
  | 'impassable'       // base terrain rejects it (water, etc.)
  | 'fort-core'        // cannot wall over fort-core
  | 'would-trap-fort'  // path-critical cell
  | 'insufficient-gold';

export interface PlaceSuccess {
  ok: true;
  cell: Cell;
  cost: number;
}
export interface PlaceRejection {
  ok: false;
  reason: PlaceFailure;
  needed?: number;
  have?: number;
}
export type PlaceResult = PlaceSuccess | PlaceRejection;

class BuildingSystem {
  constructor(opts: BuildingSystemOptions);
  tryPlaceWall(cell: Cell): PlaceResult;
  hasWallAt(cell: Cell): boolean;
}
```

#### `tryPlaceWall(cell)` order of checks

1. `inBounds` → reject `out-of-bounds`.
2. Cell equals `fortCore` (if provided) → reject `fort-core`.
3. Already in our `walls` set → reject `occupied`.
4. `pathfinding.isWalkable(cell.x, cell.y)` is `false` and not because we
   placed a wall there (#3 already handled that) → reject `impassable`.
5. Path-critical pre-check (only if both `fortCore` and `spawns` provided):
   temporarily mark the cell impassable on the pathfinder via
   `pathfinding.setWall(x,y,true)`, run `findPath` from each spawn to
   `fortCore`; if **all** return null, revert with `setWall(x,y,false)`
   and reject `would-trap-fort`. Otherwise revert (we'll re-place via the
   real event in step 7).
6. `store.spendGold(def.buildCost.gold)` returns false → reject
   `insufficient-gold` with `{ needed, have }`.
7. Add to `walls` set, **emit `wall:built` with `{ x, y }`**. Pathfinding
   handles the actual grid mutation + cache invalidation. Return
   `{ ok: true, cell, cost: def.buildCost.gold }`.

The "trap" pre-check uses `setWall` directly so it's deterministic with
sync easystar. We then revert (so the real path through `wall:built`
remains the single source of truth for state changes). If the system is
constructed without a fort-core / spawns, the trap check is skipped — the
caller has chosen to defer this check. Documented in Decisions.

### 2. Systems barrel — additive

`src/game/systems/index.ts`: add
`export { BuildingSystem } from './Building';` plus its exported types.
Never re-order existing exports.

### 3. No data changes, no schema changes

`wall-wood.json` already supplies `buildCost.gold`. `BuildingDef` already
exists.

### 4. No new deps

Pure TS — uses existing `EventEmitterLike` + `Pathfinding`.

## Files

- `docs/plans/PLAN-14-building-placement.md` (this plan)
- `src/game/systems/Building.ts` (new)
- `src/game/systems/index.ts` — additive export
- `tests/game/systems/Building.test.ts` (new)

## Test strategy

All Vitest + jsdom + `SimpleEventEmitter`. No Phaser. Pattern follows
`Pathfinding.test.ts` and `Economy.test.ts`.

1. **Valid placement on an empty walkable cell.**
   - Set up corridor, real `Pathfinding`, stub store with enough gold.
   - `tryPlaceWall({x:1, y:0})` → `{ ok: true, cell, cost: 20 }`.
   - Spy on emitter → `wall:built` fired with `{x:1, y:0}`.
   - Pathfinding now reports the cell as not walkable.
   - Store gold debited by 20.

2. **Rejects already-occupied cell (double-place).**
   - Place once; second attempt returns `{ ok: false, reason: 'occupied' }`.
   - Store gold unchanged after the second call.
   - Emitter spy: `wall:built` fired only once.

3. **Rejects impassable cell (water).**
   - Build a map where cell is `passable: false`.
   - `tryPlaceWall` → `{ ok: false, reason: 'impassable' }`. Store unchanged.
   - No `wall:built` fired.

4. **Rejects out-of-bounds cell.**
   - `tryPlaceWall({x:-1, y:0})` → `{ ok: false, reason: 'out-of-bounds' }`.

5. **Rejects fort-core cell (when fortCore provided).**
   - Construct system with `fortCore: {x:2, y:0}`.
   - `tryPlaceWall({x:2, y:0})` → `{ ok: false, reason: 'fort-core' }`.

6. **Rejects insufficient gold (returns needed/have, AC).**
   - Stub store with gold < buildCost.
   - `tryPlaceWall({x:1, y:0})` → `{ ok: false, reason: 'insufficient-gold',
     needed: 20, have: 5 }`.
   - Store gold unchanged. Emitter spy: no `wall:built`.

7. **Path-critical (would-trap) check rejects when set.**
   - Build a 1D corridor. Spawn at `(0,0)`, fort-core at `(4,0)`.
   - `tryPlaceWall({x:2, y:0})` would block the only route → returns
     `{ ok: false, reason: 'would-trap-fort' }`.
   - Pathfinding still reports `(2,0)` as walkable (revert succeeded).
   - Store gold unchanged. No `wall:built` emitted.

8. **Path-critical with detour available — placement allowed.**
   - 2-row corridor: route can detour. Placement on direct path succeeds.

9. **Trap pre-check skipped when fortCore/spawns not provided.**
   - Same single-corridor case but constructed without `fortCore` →
     `tryPlaceWall` succeeds (deferred trap check). Documents the explicit
     opt-in.

10. **Reads cost from def, not a hardcoded number.**
    - Spy/inspect: build with a bespoke `WallDef` cost `99`; assert the
      debit was `99`. Confirms data-driven (CLAUDE.md guardrail).

11. **`hasWallAt` reports placed cells.**
    - After a successful placement, `hasWallAt(cell)` is true; for any
      other cell it's false.

## Verification

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test -- --run`
4. `pnpm validate:data`
5. Grep `Building.ts` for numeric literals — only structural constants
   (no balance numbers). The `buildCost.gold` value is read from the def.
6. No Phaser import in `Building.ts` (jsdom-friendly).

## Decisions

- **Programmatic `tryPlaceWall(cell)` API, no input wiring.** The issue
  mentions "Input → tile-selection handoff", but mobile touch is #21
  (deferred). This system exposes a unit-testable API; future input
  layer feeds it grid coords.
- **Path-critical (trap) check is OPT-IN via constructor `fortCore` +
  `spawns`.** The check uses `pathfinding.setWall(x,y,true)` →
  `findPath(spawn → fortCore)` for each spawn → revert. If *every* spawn
  fails to reach the fort, the placement is rejected. This is the
  recommended implementation in the orchestrator note. When the caller
  doesn't supply both, the check is skipped — useful for tests and for
  early bring-up where spawns/fort-core haven't been parsed yet. The
  scene that wires this up (later) is responsible for passing them.
- **The system EMITS `wall:built`; Pathfinding mutates its grid.** This
  preserves the decoupling already designed in #7. The system only owns
  the *gold + occupancy* half of the contract.
- **Internal `walls` Set tracks placed cells separately from
  Pathfinding's grid** so we can reject `occupied` *before* spending
  gold. Pathfinding's set is the rendering source of truth for *what's
  walkable*; ours is *what we placed*. They stay in sync because both
  react to the same event.
- **Discriminated `PlaceResult` union — no throws.** Same pattern as
  `Economy.RespawnResult`. Callers branch on `ok`.
- **Cost source is `def.buildCost.gold` from the validated JSON.** Zero
  hardcoded magic numbers; CLAUDE.md non-negotiable.
- **No tower placement in this issue.** `tryPlaceWall` rejects at the
  type level — system is constructed with a `WallDef`, not a generic
  `BuildingDef`. Tower placement is a future issue.
- **Event payload matches existing `WallEventPayload` shape** (`{x, y}`)
  exactly so Pathfinding's existing handler picks it up unchanged.
- **`spawns` and `fortCore` use `Cell` type** (already exported from
  Pathfinding). Caller responsible for converting Tiled object-layer
  pixel coords → cell coords (out of scope here).
