# PLAN-15 — Walls: damage states + manual repair

## Context

Issue #15 layers two behaviours onto the existing wall pipeline:

1. **Damage states** — derive a current "pristine | cracked | crumbling" state
   from the wall's HP fraction so a future render layer can swap sprites; emit
   `wall:destroyed` (with grid `{x,y}`) at HP 0 so Pathfinding's existing
   listener (#7) flips the cell back to walkable + invalidates its cache.
2. **Manual repair** — the player spends gold to restore HP, where the
   per-HP cost lives in `wall-wood.json` (`repairCost.goldPerHp`). No UI
   wiring here (#19). Auto-repair via Gukka is explicitly deferred to M2.

Upstream already merged:
- `Breakable` (#6) — composes `Damageable`, sorts `damageStates` highest
  threshold first, exposes `currentSprite()`, emits
  `damage-state-changed` on threshold transitions, but does NOT emit a
  destruction event nor expose a named-state derivation.
- `Damageable` (#6) — owns HP, emits `damaged`/`died`, has `heal(amount)`
  capped at `maxHp`. Already supports the repair primitive.
- `Building.fromDef` (#11) — wires `Breakable` over a `WallDef` with the
  def's `damageStates` + `sprite` fallback.
- `BuildingSystem` (#14) — owns wall placement at a grid cell with a
  per-cell `Set<string>` of placed walls and a `BuildingStoreLike` for
  gold debits. Knows the cell-level identity of every wall it placed —
  the natural place to host repair, since repair targets a placed wall.
- `Pathfinding` (#7) — already subscribes to `wall:destroyed` and
  reverts the cell back to base terrain + invalidates cache.
- `wall-wood.json` — has `damageStates` and `repairCost.goldPerHp: 1`.
- `building.schema.ts` — `wallDefSchema` already validates `repairCost`
  + `damageStates` (>=1). No schema changes needed.
- `gameStore.spendGold(n): boolean` — already returns false on
  insufficient funds.

## Branch

`feat/15-walls`

## Approach

### 1. Extend `Breakable` (additive)

Add to `src/game/components/Breakable.ts`:
- A new derived getter `currentDamageState(): 'pristine' | 'cracked' |
  'crumbling'` that maps the current HP fraction to a structural name
  the test layer can assert on without depending on sprite filenames.
- An emit of `'destroyed'` exactly once when HP first reaches 0
  (riding the existing `damaged` listener — we already recompute the
  sprite there). This is a component-level signal; the Building entity
  will translate it into the system-level `wall:destroyed` event with a
  grid coordinate (Breakable does not know its cell).
- A `heal(amount: number): number` passthrough to the underlying
  `Damageable.heal` so callers don't need to reach into the inner
  component. This keeps the public surface coherent and avoids the
  `b.damageable.heal` antipattern.

The state name is derived from the same threshold ordering as the
sprite, but without depending on filename text:
- `pristine`   — fraction === 1.0  (only the very first state with
  threshold 1.0; HP loss of any amount is no longer pristine).
- `crumbling`  — fraction below the **lowest** non-1.0 threshold.
- `cracked`    — anything in between.
- `destroyed`  — HP === 0 (or `dead`). Returned as `'crumbling'` for
  the *visual* state name to keep the union tight; consumers should
  use the existing `dead` boolean for "is it gone" checks.

This keeps the existing sprite logic untouched and adds a small
companion derivation. The mapping is structural (not balance), so it
lives in code; the JSON still owns the threshold numbers and sprite
names.

The `'destroyed'` emission is gated on a `_destroyedFired` flag so
repeated `applyDamage(0)` calls don't double-emit.

### 2. Extend `Building` entity (additive)

`src/game/entities/Building.ts` already builds the `Breakable`. Add a
`cell?: Cell` constructor option (Tiled grid coords) so the entity
knows where it lives. When `Breakable` emits `'destroyed'`, the
entity re-emits `wall:destroyed` with `{x, y}` on the same emitter —
which is the exact shape Pathfinding's `WallDestroyed` handler wants.

A wall built without a `cell` (e.g. older tests) simply doesn't
re-emit `wall:destroyed` (logged structurally — no throw). New `cell`
parameter is optional → backwards compatible with existing tests.

### 3. Extend `BuildingSystem` with repair API (additive)

`src/game/systems/Building.ts` already owns "which cells have walls".
Add `tryRepairWall(cell, hpAmount): RepairResult` that:

1. Rejects `not-a-wall` if the cell isn't in our placed-walls map.
2. Rejects `bad-amount` if `hpAmount <= 0` or not an integer (we
   debit per whole HP).
3. Computes `restorable = min(hpAmount, maxHp - currentHp)`. If 0 →
   reject `at-max-hp`.
4. Computes `cost = restorable * def.repairCost.goldPerHp`.
5. Calls `store.spendGold(cost)`. If false → reject
   `insufficient-gold` (with `needed`/`have`).
6. Calls `building.breakable.heal(restorable)`. Returns
   `{ ok: true, cell, hpRestored: restorable, cost }`.

To do (3)–(6), the system needs to know which `Building` corresponds
to which placed cell. Today the system only stores the cell key in a
`Set<string>`. We change that to a `Map<string, Building>` (the
existing `hasWallAt` simply switches `Set.has` → `Map.has`, no
external behaviour change). On a successful `tryPlaceWall`, the
system constructs a `Building` via `Building.fromDef(def, emitter,
cell)` and stores it.

This means the existing tests for placement are unchanged in their
visible behaviour — they only relied on `hasWallAt` and the
`wall:built` event. The new internal `Building` per cell is what
repair manipulates.

The `tryPlaceWall` path now also gives `Building.fromDef` the cell so
the destruction-event re-emit is wired automatically — i.e. when a
placed wall's HP hits 0, the system's internal `Building` re-emits
`wall:destroyed`, which Pathfinding consumes. No system-level
destruction tracking needed; the chain is event-driven end to end.

When a wall is destroyed, the system also drops it from its internal
map (so a future placement on the same cell doesn't `'occupied'` and
so a subsequent `tryRepairWall` rejects `'not-a-wall'`). It listens
to `GameEvents.WallDestroyed` on its emitter and removes the cell
key. (Same emitter the system already owns; no new bus.)

#### `tryRepairWall` API

```ts
export type RepairFailure =
  | 'not-a-wall'        // no wall placed by this system at this cell
  | 'bad-amount'        // hpAmount <= 0 or non-integer
  | 'at-max-hp'         // wall is already pristine
  | 'insufficient-gold';

export interface RepairSuccess {
  ok: true;
  cell: Cell;
  hpRestored: number;   // may be < hpAmount if capped at maxHp
  cost: number;         // gold actually spent
}
export interface RepairRejection {
  ok: false;
  reason: RepairFailure;
  needed?: number;      // insufficient-gold only
  have?: number;        // insufficient-gold only
}
export type RepairResult = RepairSuccess | RepairRejection;
```

### 4. No data, no schema changes

Both `damageStates` and `repairCost.goldPerHp` are already in
`wall-wood.json` and validated by `wallDefSchema`. All numbers stay
in JSON.

### 5. No new deps

Pure TS additions to existing files.

### 6. No auto-repair (Gukka, M2)

Structurally, "no auto-repair" means:
- `BuildingSystem` exposes only `tryRepairWall(cell, hpAmount)` —
  caller-driven. No timer, no internal heal loop, no listener that
  invokes repair on its own.
- `Breakable.heal` / `Damageable.heal` exist as primitives, but the
  only caller is the explicit player-driven repair path here.
- A comment in both `BuildingSystem.tryRepairWall` and the plan flags
  this so the M2 worker knows where the auto-repair hook will land.

## Files

- `docs/plans/PLAN-15-walls.md` (this plan)
- `src/game/components/Breakable.ts` — add `currentDamageState()`,
  `heal(amount)`, and the `'destroyed'` emission.
- `src/game/entities/Building.ts` — accept optional `cell`, re-emit
  `wall:destroyed` with `{x,y}` when `Breakable` emits `'destroyed'`.
- `src/game/systems/Building.ts` — switch internal `Set` →
  `Map<string, Building>`, add `tryRepairWall`, listen for
  `wall:destroyed` to drop entries, export new types.
- `src/game/systems/index.ts` — additive export of `RepairResult`,
  `RepairSuccess`, `RepairRejection`, `RepairFailure`.
- `tests/game/components/Breakable.test.ts` — add cases for
  `currentDamageState()`, `'destroyed'` emission once-only, and
  `heal`.
- `tests/game/entities/Building.test.ts` — add cases for `wall:destroyed`
  re-emission with `{x,y}` from a placed cell, and that walls without a
  cell don't re-emit.
- `tests/game/systems/Building.test.ts` — add a `describe` block for
  repair: success, capped at maxHp, at-max-hp, insufficient-gold,
  bad-amount, not-a-wall, destroyed wall is no longer repairable, and
  `pathfinding.isWalkable` flips back to true after destruction.

## Test strategy

All Vitest + jsdom + `SimpleEventEmitter`. No Phaser. Patterns mirror
existing `Breakable.test.ts`, `Building.test.ts`, and
`systems/Building.test.ts`.

### Breakable

1. `currentDamageState()` returns `'pristine'` at full HP.
2. After dropping below the highest non-1.0 threshold but above the
   lowest → `'cracked'`.
3. Below the lowest threshold → `'crumbling'`.
4. At HP 0 → `'crumbling'` (visual state) AND `dead` is true.
5. `'destroyed'` event fires exactly once when HP first reaches 0,
   even after subsequent `applyDamage` calls.
6. `heal(amount)` raises HP and the visual state climbs back through
   the bands; capped at `maxHp`.
7. `heal` after `dead` is a no-op (Damageable's existing contract).

### Building entity

1. A `Building` constructed with `cell: {x:3, y:5}` re-emits
   `wall:destroyed` with `{x:3, y:5}` when the Breakable signals
   destruction. (Spy on emitter.)
2. A `Building` constructed without `cell` does NOT re-emit
   `wall:destroyed` even when the Breakable says destroyed.
3. `wall:destroyed` is emitted exactly once even on extra damage.

### BuildingSystem repair

1. **Success path:** place a wall, damage it for 30, repair 10 →
   result `{ ok: true, hpRestored: 10, cost: 10 }`; HP back to 80;
   gold debited by 10.
2. **Capped at maxHp:** damage for 5, request repair 100 →
   `hpRestored: 5`, `cost: 5`; HP back to 100.
3. **At-max-hp:** wall undamaged → `{ ok: false, reason: 'at-max-hp' }`;
   gold unchanged.
4. **Insufficient-gold:** damage for 50, store has 1 gold, repair 50 →
   `{ ok: false, reason: 'insufficient-gold', needed: 50, have: 1 }`;
   gold unchanged; HP unchanged.
5. **Bad amount:** repair 0 or -1 → `{ ok: false, reason: 'bad-amount' }`.
6. **Not-a-wall:** repair on a cell we never placed → `{ ok: false,
   reason: 'not-a-wall' }`.
7. **Destruction flow end-to-end:** damage placed wall to 0 →
   `wall:destroyed` fires with `{x,y}` once; `Pathfinding.isWalkable`
   flips back to true; `BuildingSystem.hasWallAt` flips to false; a
   subsequent `tryRepairWall` returns `not-a-wall`.
8. **Cost is data-driven:** with a custom `WallDef` whose
   `repairCost.goldPerHp = 7`, repair 4 HP → `cost: 28`. Confirms no
   hardcoded magic number.

## Verification

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test -- --run`
4. `pnpm validate:data`
5. Grep `Breakable.ts`, `Building.ts` (entity + system) for numeric
   literals — only structural constants. Cost per HP is read from
   `def.repairCost.goldPerHp`.
6. No Phaser import in any of the touched files (jsdom-friendly).

## Decisions

- **Damage-state derivation lives in `Breakable`** because the HP
  fraction → state mapping is structural, not balance. The JSON owns
  thresholds + sprite names; the union of state *names* is a code
  contract.
- **`'destroyed'` is a component-level event; `wall:destroyed` is a
  system-level event with grid coords.** Components don't know cells;
  entities do. The bridge is the `Building` entity, which is the
  only place that can attach a cell to the destruction signal.
  Avoids leaking grid coords into `Breakable`.
- **Repair lives on `BuildingSystem`, not `Building` entity.**
  Because repair touches the gold store and the system is the cell ↔
  building registry. This matches how placement already works
  (`tryPlaceWall` is on the system, not the entity).
- **Internal `Set` → `Map<string, Building>` is additive.** All
  external behaviour of `tryPlaceWall` and `hasWallAt` is preserved;
  existing tests pass unchanged. The map is needed so `tryRepairWall`
  can find the right Breakable.
- **Repair amount is integer HP, debited per HP.** Avoids
  fractional-gold edge cases. Caller can pass any positive integer;
  the system caps at `maxHp - hp` and refunds the cap by spending
  only what was actually applied.
- **No auto-repair.** `tryRepairWall` is the only repair path. No
  internal timer or cron. Gukka's auto-repair (M2) will be a separate
  caller of this same API — explicitly opt-in, not a default
  behaviour. Comment in code calls this out so the M2 worker knows
  where to plug in.
- **`wall:destroyed` payload shape matches `WallEventPayload`** so
  Pathfinding's existing handler picks it up unchanged.
- **`tryRepairWall` order of checks** mirrors `tryPlaceWall`:
  cheapest-first, gold last. Failures don't mutate gold or HP. The
  only mutation on success is `store.spendGold` + `breakable.heal`,
  in that order; if `heal` somehow returns less than expected
  (Damageable's contract guarantees it won't, given our cap), we
  still report the actual `hpRestored`.
