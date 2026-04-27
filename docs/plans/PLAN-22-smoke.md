# PLAN-22 — M1 Integration Smoke Test

## Context

Issue #22 is the go/no-go gate for M1: an end-to-end smoke test that wires
the merged systems (#7-#21) together and drives a 5-wave run via a tick-by-tick
simulated game loop. Plus a "grep guard" that scans `src/game/systems/*.ts`
for hardcoded numeric balance literals to enforce the data-driven rule.

## Branch

`feat/22-smoke`

## Approach

### 1. Integration smoke (`tests/integration/m1-smoke.test.ts`)

Wires every M1 system together using the same jsdom-safe pattern as
`tests/game/systems/Wave.test.ts` and `AI.test.ts`. No Phaser, no canvas.

- **Map**: load the real `src/data/maps/m1-slice.json`. Pathfinding builds
  its grid from layer `passable` properties.
- **Pathfinding**: real instance, sharing the system bus emitter.
- **Damage**: real instance.
- **AI**: real instance, with a `wallAt(x,y)` lookup backed by the
  BuildingSystem's `buildingAt(cell)`. The AI expects a `WallLike` shape
  (`{ breakable: { damageable: { dead, applyDamage } }, cell }`); a Building
  satisfies this structurally (verified by `AI.test.ts` line 105-107 where
  the test wraps a Building.breakable in a `WallLike` literal — Building
  itself ALREADY exposes `breakable` and `cell`, so we can pass it directly
  with a thin adapter).
- **BuildingSystem**: real instance, fortCore + spawns provided so the trap
  check is on. We won't actually call `tryPlaceWall` from the smoke test —
  the wave-defeating happens via orcs intercepting humans, not via walls.
- **Wave**: real instance, loading all 5 wave defs from `src/data/waves/`.
  The `onSpawn` callback registers the human in `AISystem` and Economy.
- **Economy**: real instance, sharing the system bus so it sees
  `wave:complete`. We pass a fake store (resetting Zustand between tests
  is finicky — use the `EconomyStoreLike` test seam).
- **gameStore**: also subscribed to `run:won` / `run:lost` to drive
  `runStatus`. The smoke test asserts BOTH the event AND the store
  transition.

#### Run loop

```
const dt = 1 / 30; // 30 Hz sim — fast + deterministic, like AI.test.ts
const maxTicks = 30 * 60 * 5; // 5 minutes sim time max — defensive bail
for (let i = 0; i < maxTicks; i++) {
  pf updates not needed (event-driven)
  ai.update(dt);
  damage.update(dt);
  wave.update(dt);
  economy.update(dt);
  await flush(); // microtasks for findPath promises
  if (runStatus !== 'running') break;
}
```

#### Orcs

To win, we need orcs intercepting humans. We pre-spawn N orcs at the rally
cell (near the fort-core, west side) so they engage humans approaching the
fort. Orcs come from `mougg-grunt.json` (`hp: 80, dps: 12, speed: 60`); a
peasant levy is `hp: 20, dps: 3` — an orc one-shots a peasant in ~2 swings.
With 4-6 orcs at rally, the fort survives all 5 waves.

#### Wave timing

Wave 5 has the largest spawn at `startDelay: 18s` plus a `count: 5` at
`interval: 0.9s` — the last spawn fires ~22s into wave 5. After kill +
death detection, we expect `run:won` within wave-5-elapsed + ~5s buffer.
30 Hz × 5 minutes is ~9000 ticks, comfortably more than needed.

#### Why no walls

The smoke is about wave defeat → run:won. Walls are tested in #14/#15.
Adding wall placement here would couple the smoke to BuildingSystem state
and increase fragility without adding signal. We DO instantiate
`BuildingSystem` to verify it constructs without error against the real
map, but don't drive placements.

### 2. Grep guard (`tests/integration/grep-guard.test.ts`)

A separate Vitest test that:
1. Reads each `src/game/systems/*.ts` file.
2. Strips comments + string literals (template + single + double quoted).
3. Scans remaining tokens for numeric literals NOT in a whitelist.
4. Asserts zero violations per file (with a per-file allowlist of false
   positives).

#### Whitelisted patterns (false positives)

- `0`, `1`: identity (used everywhere — array length checks, sign tests).
- `2`: division by 2 (centerpoint math).
- Negative `-1`: Array.indexOf miss + sign returns.
- `0.5`: tile-centre offset (used in `unitTarget` / `wallTarget`).
- Power-of-two array indices `[0]`, `[1]` etc. — these are TS array
  bracket access, not balance numbers.
- Index expressions like `path.length - 1`.

We use a permissive heuristic: ANY decimal numeric literal `>= 2` (other
than 0.5) is suspicious. Reading the systems, the actual balance numbers
that USED to be hardcoded (and were then moved to data) include
`secondsPerMeleeAttack: 1`, `aggroRadius: 6 * tileWidth`, etc. — these
live as ctor option DEFAULTS in `AI.ts`. The grep guard MUST allow those
defaults: they're structural fallbacks, not hidden balance.

The whitelist accepts:
- Anything `<= 1` (covers 0, 1, 0.5, fractions in math like `1 / 60`).
- Specific structural defaults documented in `AI.ts` (e.g. `6` for
  aggroRadius default tiles, `1` for melee range, `1` for sec-per-attack
  default).
- Test-pattern numbers when present (none in non-test files).

We document the whitelist in the test file, NOT here, so each entry is
auditable in PRs.

### 3. Findings doc (`docs/plans/PLAN-m1-smoke.md`)

The issue-mandated playtest log + findings doc. Five sections:

- `## Automated test results` — what passes / fails, what we measured.
- `## Grep guard findings` — files with violations + whitelisted defaults.
- `## Manual playtest deferral` — explains DESKTOP/MOBILE/FPS deferral.
- `## Blocker Follow-ups` — list of integration gaps as title + scope.
- `## Go/no-go recommendation` — final call.

## Files

- `tests/integration/m1-smoke.test.ts` (new)
- `tests/integration/grep-guard.test.ts` (new)
- `docs/plans/PLAN-22-smoke.md` (this file)
- `docs/plans/PLAN-m1-smoke.md` (findings; new)

## Test strategy

- Smoke test: assert `runStatus === 'won'` AND `run:won` event fired.
- Smoke test: assert all 5 waves emitted `wave:start` and `wave:complete`.
- Smoke test: assert gold accrued from peasant goldDrop + wave rewards.
- Smoke test: assert at least one orc survived.
- Grep guard: assert each system file has zero non-whitelisted numerics.

## Verification

`pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm validate:data`.

## Decisions

- **Walls excluded** from the smoke — building placement covered in #14/#15.
- **Orc rally placement**: at the cell adjacent to fort-core, so orcs can
  intercept humans before they reach the fort.
- **Sim Hz**: 30 (matches `AI.test.ts` style; deterministic).
- **Manual playtest deferred** to human review per the orchestrator's
  scope notes — we cannot run a browser.
- **Grep guard is gentle**: it whitelists `<= 1` numerics and the
  documented `AI.ts` defaults (aggroRadius `6`, `secondsPerMeleeAttack`,
  `meleeRangeTiles`). Anything else fails the test.
- **No new deps**: pure Node + Vitest + jsdom. Reading test files via
  `node:fs/promises` is allowed (already used in `validate-data.ts`).
