# PLAN-28 — Tighten `Building.cell` to non-optional, drop AI `WallLike` adapter

## Context

Soft blocker surfaced by the M1 integration smoke test (#22). `Building.cell`
is currently `cell?: BuildingCell` even though every wall is constructed with
a cell once `BuildingSystem.tryPlaceWall` builds it. The optional typing
forces consumers (specifically `AISystem`) to define a parallel `WallLike`
shape with a required `cell` so adjacency math doesn't need a non-null
assertion. The smoke test ends up bridging the two with a 4-line adapter.

This plan tightens the entity contract so a `Building` IS a usable wall
target without a structural shim, and removes `WallLike` from the public
surface.

## Branch

`feat/28-building-cell`

## Approach

### Entity contract (`src/game/entities/Building.ts`)

- Change `readonly cell?: BuildingCell` → `readonly cell: BuildingCell`.
- Make `fromDef`'s third arg required: `cell: BuildingCell`.
- Drop the `if (cell)` guard in the constructor — the destruction
  re-emit is now unconditional. (Note: this is the right behaviour: a
  Building always has a cell, so always re-emit `wall:destroyed` on
  destruction. Towers don't subscribe to this event so it's harmless;
  in practice towers won't be `applyDamage`-ed in M1 outside Damage
  tests that don't listen for this event.)
- Remove the test-line about "Walls instantiated without a cell (older
  tests, towers) skip the re-emit" from the JSDoc and replace with the
  new invariant.

### BuildingSystem (`src/game/systems/Building.ts`)

- Already passes `{ x, y }` to `Building.fromDef` — no change required for
  walls. **No ballista factory exists yet** in `BuildingSystem`; ballista
  placement is not wired through this system in M1 (ballista lives only
  in tower tests via direct `Building.fromDef`). So the audit is: confirm
  no other call site builds towers without a cell in production. (Result:
  none — the only ballista construction is in `tests/game/systems/Damage.test.ts`,
  which builds a tower for combat math only and never subscribes to wall
  events.)

### AI system (`src/game/systems/AI.ts`)

- Drop `interface WallLike` entirely.
- Replace every `WallLike` reference with the `Building` type imported
  from `@/game/entities/Building` (already imported as type).
- `wallAt` callback signature becomes `(x, y) => Building | null`.
- `targetWall: WallLike | null` becomes `targetWall: Building | null`.
- `wallTarget(wall: WallLike, ...)` becomes `wallTarget(wall: Building, ...)`.
- The dead-check `wall.breakable.damageable.dead` and adjacency math
  `chebyshev(h.cell, wall.cell)` continue to work — `Building` exposes
  both via the same shape (now with `cell` non-optional).
- Remove the trailing `export type { Building };` re-export comment block
  (was paired with `WallLike` for callers; no longer needed).

### `src/game/systems/index.ts`

- Drop `WallLike` from the type re-export block.

### Tests

- `tests/game/entities/Building.test.ts` — the existing test "does NOT
  re-emit wall:destroyed when no cell was provided" becomes invalid
  (the contract change makes `cell` required). Remove it. Other tests
  pass `{ x: 7, y: 9 }` etc. and stay valid.
- `tests/game/systems/AI.test.ts` — the "wall-blocked human" test
  currently builds a `WallLike` adapter from a Building. Replace
  with: pass the `Building` directly into the `wallAt` map. The
  `targetWall` assertion (`expect(hb.targetWall).toBe(wallLike)`)
  becomes `expect(hb.targetWall).toBe(wall)`. Drop the
  `import type { ..., WallLike }`.
- `tests/game/systems/Damage.test.ts` — `Building.fromDef(ballistaDef)`
  becomes `Building.fromDef(ballistaDef, undefined, { x: 0, y: 0 })`.
  The test only reads `.combat`; the cell value is structural and
  doesn't influence behavior.
- `tests/integration/m1-smoke.test.ts` — drop the `WallLike` import
  and the 4-line `wallAt` adapter. `wallAt` becomes a one-liner
  returning `building.buildingAt({ x, y }) ?? null`.

## Files

- `src/game/entities/Building.ts` (modify)
- `src/game/systems/AI.ts` (modify)
- `src/game/systems/index.ts` (modify — drop `WallLike` re-export)
- `tests/game/entities/Building.test.ts` (modify — remove no-cell case)
- `tests/game/systems/AI.test.ts` (modify — drop `WallLike` adapter)
- `tests/game/systems/Damage.test.ts` (modify — pass cell)
- `tests/integration/m1-smoke.test.ts` (modify — drop adapter)

## Test strategy

- All existing tests must still pass. Behaviour is unchanged; only the
  type signature and the unused-without-cell branch are gone.
- Specifically watch for: AI.test "wall-blocked human" remains green
  with `targetWall === wall` (Building) instead of `wallLike` shim.

## Verification

`pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm validate:data`

## Decisions

- **Why drop the no-cell unit test?** The contract changes; testing a
  removed branch is meaningless. The invariant ("walls always have a
  cell") moves into the type system.
- **Why not also re-export `Building` from `@/game/systems`?** Callers
  already import `Building` from `@/game/entities/Building`. Keeping
  the imports local to entities preserves the system/entity layering.
- **Ballista audit?** No production code constructs a tower entity
  through BuildingSystem in M1. The only tower factory call lives in
  `Damage.test.ts` and is unaffected behaviorally — it only needs to
  satisfy the new required-cell signature. No production hardcode is
  added; ballista placement remains a future-milestone concern.
