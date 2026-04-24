# PLAN-03 — Hand-authored M1 Waves

## Context

Issue #3 — author 5 hand-designed waves for the M1 vertical slice. Tension curve
should teach on wave 1 and climax on wave 5. Difficulty must be beatable with
wood walls (HP 100) + one ballista (range 240, damage 20, rate 0.8/s) + hero.

Upstream done:
- #1 schemas — `waveDefSchema` at `src/data/schemas/wave.schema.ts`
- #2 units — `src/data/humans/peasant-levy.json` (hp 20, dps 3, speed 70, armor 0, goldDrop 4)
- #11 buildings — `wall-wood.json` (HP 100) + `ballista.json` (range 240, dmg 20, rate 0.8/s)

## Branch

`feat/3-waves`

## Approach

Author 5 waves as 5 separate JSON files under `src/data/waves/` — one wave per
file. This keeps the existing schema-per-file registry invariant intact (the
validate-data CLI iterates `src/data/waves/*.json` and parses each through
`waveDefSchema`, which describes a single wave). Authoring a single array would
require either changing the schema or the CLI — both out of scope for a data task.

### Difficulty curve

Ballista kill math (sanity check): damage 20, rate 0.8/s → 16 dps; peasant HP 20
→ ~1.25s per kill. Hero + ballista combined can comfortably clear ~1 levy every
~0.8s at close range; walls buy time.

Wave shape:

| # | Total levies | Edges        | Interval (s) | Start delays           | Reward gold | Cry                  |
|---|--------------|--------------|--------------|------------------------|-------------|----------------------|
| 1 | 5            | N            | 1.8          | 2.0                    | 25          | battle.waveStart     |
| 2 | 8            | N, W         | 1.6          | 2.0, 4.0               | 35          | battle.waveStart     |
| 3 | 12           | N, S, W      | 1.4          | 2.0, 3.5, 6.0          | 45          | battle.waveStart     |
| 4 | 18           | N, S, W (2xN)| 1.2          | 2.0, 5.0, 8.0, 14.0    | 60          | battle.waveStart     |
| 5 | 26           | N, S, W (3-way pincer + late trickle) | 1.0 / 0.9 on pincer | 2.0, 4.0, 6.0, 18.0 | 100 | battle.bossWave |

Wave 5 sends three simultaneous groups from each edge, then a late reinforcement
from N to keep the pressure on once the player thinks they are clear. Total levy
HP across wave 5 = 26 × 20 = 520. Ballista + hero combined dps ≈ 20–25 effective
after travel/target-switching; walls absorb the rest. Beatable, not trivial.

## Files

New:
- `src/data/waves/m1-wave-1.json`
- `src/data/waves/m1-wave-2.json`
- `src/data/waves/m1-wave-3.json`
- `src/data/waves/m1-wave-4.json`
- `src/data/waves/m1-wave-5.json`

No code changes. No schema changes.

## Test strategy

- `pnpm validate:data` — every wave file parses against `waveDefSchema`
- `pnpm typecheck` — no TS change but run for sanity
- `pnpm lint` — no TS change but run for sanity
- `pnpm test -- --run` — existing wave-schema tests continue to pass

No new unit tests added — the data is validated end-to-end by the validate-data
CLI, which is stricter than ad-hoc fixture tests.

## Verification

Acceptance criteria mapping:

- [x] 5 waves defined with edge/count/timing → 5 files, ramp documented above
- [x] Difficulty ramps, wave 5 climactic but beatable → curve justified above
- [x] Post-wave gold reward per wave defined → 25/35/45/60/100
- [x] Win condition triggered after wave 5 complete → wave 5 exists with
      `number: 5`; the Phaser battle scene (future issue) will listen for its
      complete event. No runtime code change is part of this issue.
- [x] Passes `pnpm validate:data`

## Decisions

1. **5 files, not 1 array.** The registry + CLI validate each JSON file against
   `waveDefSchema` (a single wave). Authoring an array would break that invariant
   or require changing the schema/CLI — explicitly called out by the orchestrator
   as the conservative choice. File naming: `m1-wave-N.json`.
2. **Cry keys reuse existing strings.** `battle.waveStart` for waves 1–4,
   `battle.bossWave` for wave 5 — both already present in `src/data/strings/en.json`.
   No new strings to avoid scope creep into issue #4 (strings).
3. **Win-condition wiring is runtime code, out of scope.** This issue is data
   only. The wave-5 complete event is emitted by a future battle scene; authoring
   `number: 5` is the data-side contract.
4. **Edge distribution.** M1 map has only three open edges (N/S/W) per the
   schema. Ramping is achieved by adding edges and shortening intervals, not by
   introducing a 4th edge.
