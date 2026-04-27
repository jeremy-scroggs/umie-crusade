# PLAN-30 — Gukka auto-repair behavior

## Context

Issue #30 adds the Gukka builder's auto-repair behavior. Gukka units listen
for `wall:damaged` events; when idle and the player has enough gold, they
walk to the damaged wall and repair it (calling into the existing
`BuildingSystem`-side repair plumbing). The player can manually override
the auto-repair (cancel back to IDLE).

Inputs already in tree (from prior issues):

- `src/data/orcs/gukka.json` (#55) — has `role: 'builder'`,
  `repairAmount: 8`, `repairCooldownMs: 2000`, `repairCostGold: 1`.
- `src/game/systems/Building.ts` (#15) — exposes `tryRepairWall(cell, hp)`
  manual-repair API + `buildingAt(cell)` + `hasWallAt(cell)`.
- `src/game/components/Breakable.ts` — `damageable` emits per-Building
  `'damaged'` events on the Building's own emitter (NOT the shared bus).
- `src/state/gameStore.ts` — `gold` + `spendGold(amount): boolean`.
- `src/game/systems/AI.ts` (#9) — existing FSMs for humans + orcs; this
  plan adds a Gukka branch alongside them.

The shared bus has `wall:built` and `wall:destroyed` system-level events
but NOT a system-level `wall:damaged`. We add it: `BuildingSystem`
forwards each Building's per-emitter `'damaged'` to the shared bus as
`wall:damaged` with `{ x, y, hp, maxHp }`. This mirrors the pattern
`BuildingSystem` already uses for `wall:destroyed`.

## Branch

`feat/30-gukka-repair`

## Approach

1. **Event surface**: extend `events.ts` with `WallDamaged: 'wall:damaged'`
   + `WallDamagedPayload { x, y, hp, maxHp }`. Re-export from
   `systems/index.ts`. No magic numbers.

2. **BuildingSystem forwarder**: in `tryPlaceWall`, attach a `'damaged'`
   listener on the new Building's emitter that emits
   `GameEvents.WallDamaged` on the shared bus with the per-cell
   coordinates and current HP/maxHp. Single new line of plumbing — does
   not touch the existing manual-repair API.

3. **BuildingSystem auto-repair entry-point**: add
   `tryAutoRepairWall(cell, hpAmount, costGold)` — distinct from
   `tryRepairWall` so the Gukka FSM passes its unit-defined cost
   straight from `gukka.json` rather than the wall-def's `goldPerHp`.
   Manual repair is unchanged. Auto-repair check order:
   1. `not-a-wall`  — no placed wall at this cell
   2. `bad-amount` — `hpAmount` must be a positive integer
   3. `bad-cost`   — `costGold` must be a non-negative integer
   4. `at-max-hp`  — wall is already pristine
   5. `insufficient-gold`
   On success: debits `costGold`, heals by `min(hpAmount, missing)`,
   returns `{ ok, cell, hpRestored, cost }`.

4. **Schema extension**: add three optional numeric fields to
   `unitDefSchema`: `repairAmount?`, `repairCooldownMs?`,
   `repairCostGold?`. Optional so existing units (grunt, brute,
   peasant-levy, peon, skowt, mojoka) stay valid. Surfaced through
   `UnitDef` for typed reads in AI.ts.

5. **Gukka FSM in AI.ts**:
   - States: `Idle`, `MoveToRepair`, `Repairing`. Exported as a
     `GukkaState` const-object alongside `OrcState`/`HumanState`.
   - Internal `GukkaBehavior` record (cell, state, target wall cell,
     repairCooldown, attackCooldown reused as repair cadence).
   - `registerGukka(instance)` — separate from `registerOrc` so the
     existing fighter-orc code path stays untouched. Gukka entities
     are still `Orc`s underneath; their `def.role === 'builder'` is
     enforced in `registerGukka` for safety.
   - On `wall:damaged`:
     - For every idle Gukka, if gold ≥ `repairCostGold` and the wall
       still exists + has missing HP, set target cell + transition to
       `MoveToRepair`. Bail (stay IDLE) if gold-gated.
   - `MoveToRepair`: step toward target cell each tick (reuse the
     existing `stepToward` helper). When adjacent (Chebyshev ≤ 1) and
     wall still damaged → transition to `Repairing`. If wall vanishes
     or is full HP mid-route → IDLE.
   - `Repairing`: if `repairCooldown <= 0`, call
     `BuildingSystem.tryAutoRepairWall(cell, repairAmount, repairCostGold)`.
     Reset cooldown to `repairCooldownMs / 1000`. After each tick,
     if wall is at max HP or destroyed → IDLE. If gold-gated → IDLE.
   - **Cancel API**: `cancelGukkaTask(orc)` — public method that drops
     the target + cooldown and returns the FSM to IDLE. The HUD wiring
     (out of scope for #30) calls this when the player clicks "cancel
     auto-repair".
   - `wallAt` is already on `AISystemOptions`; reuse it as the source
     of "is there a wall at (x,y)" for Gukka pickup + transitions.

6. **Wiring**: ADD-ONLY exports for `GukkaState`, `GukkaBehavior`,
   `GukkaInstance`. The scene bootstrap is NOT modified by this issue —
   that is M2 wave-spawner work. The system stays callable.

## Files

- `src/game/systems/events.ts` — add `WallDamaged` + `WallDamagedPayload`.
- `src/game/systems/index.ts` — re-export new event + Gukka types.
- `src/game/systems/Building.ts` — forward `damaged` → `wall:damaged`
  on the shared bus; add `tryAutoRepairWall(...)`.
- `src/data/schemas/unit.schema.ts` — add optional `repairAmount`,
  `repairCooldownMs`, `repairCostGold`.
- `src/game/systems/AI.ts` — add `GukkaState`, `GukkaBehavior`,
  `registerGukka`, `unregisterGukka`, `gukkaBehavior`, `cancelGukkaTask`,
  internal Gukka tick.
- `tests/game/systems/AI.test.ts` — Gukka pickup, gold-gated bail,
  manual cancel.
- `tests/game/systems/Building.test.ts` — auto-repair entry-point +
  `wall:damaged` forwarder (if a smaller dedicated test file exists,
  add to it; otherwise extend the existing one).

## Test strategy

- Unit tests in `AI.test.ts` covering:
  1. Idle Gukka picks up `wall:damaged` → `MoveToRepair` (gold ok).
  2. Idle Gukka receives `wall:damaged` with insufficient gold →
     stays `Idle`.
  3. `cancelGukkaTask(gukka)` from `MoveToRepair` returns to `Idle`.
- Building.test.ts (extend existing tests):
  4. `tryAutoRepairWall(cell, hp, cost)` debits `cost` (not
     `goldPerHp`), heals by `min(hp, missing)`, returns
     `{ ok, hpRestored, cost }`.
  5. `wall:damaged` is emitted on the shared bus when the wall takes
     damage post-place.
  6. `tryAutoRepairWall` rejects with `insufficient-gold` when the
     store is short.

Run gate: `pnpm typecheck && pnpm lint && pnpm test -- --run &&
pnpm validate:data`.

## Verification

- AC1 — FSM IDLE → MOVE_TO_REPAIR → REPAIRING → IDLE: covered by the
  pickup test (drives the FSM through all three transitions to wall full
  HP).
- AC2 — Triggered by `wall:damaged` when idle + gold ≥ cost: pickup
  test + gold-gated bail test.
- AC3 — Player can manually override (cancel auto-repair): cancel test.
- AC4 — Repair cost deducted from `gameStore.gold`: building auto-repair
  test asserts `spendGold` was called with the unit-defined cost.
- AC5 — Unit tests cover idle pickup, gold-gated bail, cancel: see
  test list above.
- AC6 — `pnpm test` green: enforced by run-gate.

## Decisions

- **Auto-repair takes a unit-supplied cost** (not the wall def's
  `goldPerHp`). Keeps the JSON-driven invariant ("repair cost from
  gukka.json") intact and avoids forcing a parallel knob into
  `wallDefSchema` (which already drives manual repair).
- **`registerGukka` is separate from `registerOrc`** to keep the
  existing fighter-orc tick path untouched. The taxonomy split lines
  up with `role`: `'fighter'` orcs go through `registerOrc`,
  `'builder'` orcs go through `registerGukka`. (A future M2 issue can
  collapse them behind a single `registerUnit`.)
- **Cooldown is gated on `attackCooldown`** field name reuse —
  semantic in this branch is "cadence between repair ticks", but
  reusing the existing field avoids broadening the type for one
  caller. The `GukkaBehavior` record uses a fresh `repairCooldown`
  field for clarity.
- **Per-Building `'damaged'` listener is system-level forwarded only**
  — the per-instance emitter still fires for sprite refresh; the
  shared-bus `wall:damaged` is purely a notification surface.
- **No magic numbers**: cost / amount / cooldown all read from
  `gukka.json` via `def.repairCostGold` / `def.repairAmount` /
  `def.repairCooldownMs`. AI.ts ctor takes no Gukka-specific options
  — the unit def is the source of truth.
