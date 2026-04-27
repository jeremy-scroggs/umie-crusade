# M1 Smoke — Findings + Go/No-Go

**Issue**: #22 — integration smoke (full 5-wave playthrough on desktop + mobile).
**Branch**: `feat/22-smoke`.
**Date**: 2026-04-27 (UTC).

This is the issue-mandated findings doc. The worker's own implementation
plan lives at [PLAN-22-smoke.md](./PLAN-22-smoke.md).

## Automated test results

`tests/integration/m1-smoke.test.ts` wires every M1 system together
against the real `m1-slice` Tiled map and the validated wave / unit /
building defs. The test runs in jsdom (no Phaser, no canvas) and
advances every system on a fixed `dt = 1/30` simulated clock until
`run:won` or `run:lost` fires — same pattern as the existing per-system
tests under `tests/game/systems/`.

Wired systems (real instances, sharing one `SimpleEventEmitter` bus):

| System         | Source                         | Notes                                               |
| -------------- | ------------------------------ | --------------------------------------------------- |
| Pathfinding    | `src/game/systems/Pathfinding` | Real `easystarjs` over the parsed `m1-slice` grid. |
| DamageSystem   | `src/game/systems/Damage`      | Routes melee + projectile + cooldown.               |
| AISystem       | `src/game/systems/AI`          | Both human + orc FSMs. `wallAt` adapts BuildingSystem. |
| BuildingSystem | `src/game/systems/Building`    | Constructed against the real map; not exercised in this smoke. |
| Economy        | `src/game/systems/Economy`     | Bound to a `FakeStore` (test seam).                 |
| WaveSystem     | `src/game/systems/Wave`        | Loads `m1-wave-{1..5}.json` in order.               |

Pre-conditions in the harness:

- 6 orcs are pre-placed at the rally cell (`{x:27, y:11}` — adjacent to
  the fort-core). They start in `IDLE_AT_RALLY`; aggro = 8 tiles
  pixels.
- Fort HP = 5000 — generous so the run is decided by wave-defeat, not by
  fort-survival edge cases (the latter is covered by the unit-level
  fort-core test in `Wave.test.ts`).

Assertions (all pass):

- `WaveSystem.isWon === true`, `isLost === false`.
- 5 × `wave:start`, 5 × `wave:complete`, 1 × `run:won`, 0 × `run:lost`.
- `run:won` event fires AFTER the final `wave:complete`.
- `Economy` credited at minimum the sum of wave rewards
  (`25 + 35 + 45 + 60 + 100 = 265`).
- ≥ 1 orc survived the run.

Sim time consumed to win: well under the 5-minute cap. Final wave
fires its last spawn at `startDelay + (count - 1) * interval ≈ 18 + 4*0.9 = 21.6 s`
of wave-5 elapsed time, which is comfortably under the cap.

`tests/integration/grep-guard.test.ts` scans every `src/game/systems/*.ts`
file for hardcoded numeric literals. Whitelist is conservative:

- Numbers `<= 1` are always allowed (identity comparisons, array-index
  shorthand, `Math.max(0, ...)`, sign tests, the `0.5` tile-centre
  offset, rate fractions like `1 / 60`).
- Larger structural defaults whitelisted per file with rationale (see
  `ALLOWLISTS` in the test). The only entries today are:
  - `AI.ts`: `6` (default aggro radius in tiles — overridden per run).
  - `Input.ts`: `2` (DOM pointer-event right-click button + two-finger
    pinch count — DOM API constants, not balance).

Comments + string literals are stripped before scanning so doc numbers
in JSDoc are never reported.

## Grep guard findings

No violations. All M1 systems source their balance numbers from
validated JSON or pass them through `UnitDef` / `WaveDef` / `WallDef`.
The two structural exceptions documented above are the AI's default
aggro radius and Input's DOM-button code.

The whitelist is the single audit surface — anyone adding a hardcoded
integer ≥ 2 to a system file must either move it to data OR justify it
in `ALLOWLISTS`. PRs that try to add a new entry should be reviewed
against the data-driven rule in `CLAUDE.md`.

## Manual playtest deferral

The issue's AC includes:

- Manual playtest log: desktop + mobile emulator @ 375px.
- FPS target 60 with 100+ entities.

Neither is achievable from the worker sandbox: there is no browser, no
canvas-bound renderer, no wall-clock for FPS measurement. These three
verifications are **DEFERRED to human review** per the orchestrator's
explicit scope notes.

Recommended follow-up steps for a human reviewer:

1. `pnpm dev`, open `http://localhost:3000` on desktop, complete a 5-wave
   run. Visually verify `wave:start` banner / HUD wave counter / Run
   Summary win page.
2. Open Chromium DevTools → Sensors → emulate a mobile device at 375px
   width. Repeat the run. Verify build panel, hero ability button, and
   touch input (tap-to-select, long-press-to-inspect) work.
3. With ~100+ entities active (mid-wave 5 with multiple spawns + orcs),
   open the FPS meter (Performance tab → "Frame rate"). Expect a
   sustained ≥ 55 FPS on a recent laptop / phone. Anything below 30 FPS
   is a hard blocker.

## Blocker Follow-ups

The integration came together cleanly; no wiring gaps found. The list
below is **soft observations** — quality-of-life items the human can
decide whether to file as separate issues against M1 polish or roll
forward into M2 hardening.

### 1. WaveSystem default emitter is its own `SimpleEventEmitter`

**Title**: "WaveSystem should default to the shared bus when integration
expects a single emitter"

**Scope**: `src/game/systems/Wave.ts`. Currently `WaveSystem.emitter`
defaults to a fresh `SimpleEventEmitter()` if no `emitter` ctor option
is passed. This means a smoke / scene that builds Pathfinding+Damage+AI
on one bus and then forgets to pass `emitter: bus` to `WaveSystem` will
silently drop `wave:start` / `wave:complete` / `run:won` from the shared
bus. The smoke test caught this on first run.

**Reason**: minor papercut for integrators. The fix is either (a)
require `emitter` (no default), or (b) document the
"share-the-bus-or-bust" expectation in the WaveSystem class header.

**Severity**: Low. Easily caught by integration tests; not a runtime bug.

### 2. WallLike ↔ Building shape adaptation

**Title**: "Document or codify the WallLike → Building adapter pattern"

**Scope**: `src/game/systems/AI.ts` exposes a `WallLike` interface. The
real `Building` entity already satisfies this structurally (it has
`breakable` and an optional `cell`), but you need a thin adapter
function because `Building.cell` is `BuildingCell | undefined` while
`WallLike.cell` is required. The smoke test wrote a 4-line `wallAt`
adapter; the production scene will need the same shape.

**Reason**: not a bug, but every integrator (smoke test, future scene
glue, future M2 building variants) will write the same adapter.
Worth either a tiny helper in `src/game/entities/Building.ts` or a
note in `AI.ts` pointing readers at the smoke test.

**Severity**: Low. Adapter is 4 lines. Useful to canonicalize.

### 3. Manual playtest is fully deferred

**Title**: "M1 smoke: human-led desktop + mobile + FPS verification"

**Scope**: Run the M1 slice in browser + mobile emulator + measure FPS.
See "Manual playtest deferral" above.

**Reason**: cannot run in the sandbox. The scene-bind layer
(Phaser scene wiring) was not part of this issue's scope but IS the
surface that browser playtest exercises. If it's missing or broken the
manual pass will surface it.

**Severity**: High blocker for the M1 → M2 gate. **Must be cleared by a
human before declaring M1 done.**

## Go/no-go recommendation

**Conditional GO** for M1 → M2 transition.

Automated integration is green: every system composes cleanly, the run
loop reaches `run:won`, balance numbers are sourced from data, and the
grep guard catches future drift. The two soft follow-ups above are
quality-of-life papercuts, not blockers.

The blocker is **manual playtest** (item 3). The machine can't run a
browser. Until a human runs the M1 build on desktop + mobile and
verifies FPS @ 100+ entities, M1 is not safely shippable. That work is
in scope for the human; this worker's automated portion of the gate
passes.
