# PLAN-12 — Mougg'r hero + Clomp'uk ability JSON

## Context
Issue #12 asks us to author the hero definition for the M1 slice: a Mougg'r
bloodline hero (`Mougg'r`) with the active `Clomp'uk` ground-slam ability.
This is a data-only change.

The hero schema from #1 lives at `src/data/schemas/hero.schema.ts` and extends
`unitDefSchema` with a required `ability` block (id, damage, radius, stunMs,
cooldownMs, optional cost.souls). `src/data/schemas/index.ts` already routes
`src/data/heroes/*.json` through `heroDefSchema`, and
`tools/validate-data.ts` iterates every directory in the registry — so adding
a new file under `src/data/heroes/` will be picked up with no code changes.

The hero must clearly out-class the grunt (`src/data/orcs/mougg-grunt.json`:
hp 80, dps 12, speed 60, armor 2; cost.gold 25, trainTime 4; respawnCost.gold
15, respawnCost.time 10).

## Branch
`feat/12-heroes`

## Approach
1. Author `src/data/heroes/mougg-r.json` using `heroDefSchema`:
   - `id: "mougg-r-hero"`, `name: "Mougg'r"`, `bloodline: "mougg-r"`,
     `faction: "orc"`, `category: "melee"` (tank/stun).
   - Stats clearly above the grunt: hp 260, dps 22, speed 55, armor 5.
     (Hero is slower than the grunt's 60 — he's a stompy tank, not a skirmisher.)
   - Cost clearly above the grunt: `{ gold: 150, trainTime: 12 }`.
     `respawnCost: { gold: 80, time: 30 }` — longer respawn delay as AC requires.
   - `sprite: "orcs/mougg-r-hero.png"` — kebab-case, namespaced under `orcs/`.
   - `animations: ["idle", "walk", "attack", "ability", "death"]` (adds an
     `ability` anim vs. the grunt).
   - `abilities: ["clompuk"]` (references the ability id in the ability block).
   - `unlockRequirement: null` — hero is available from the start of M1.
   - `flavor: "KWAT DA TRA!"` — Mougg'r war cry for the ability trigger,
     per the AC. Bloodrock-original language; no Ultima/UO IP.
   - `ability`: `{ id: "clompuk", damage: 30, radius: 64, stunMs: 1500,
     cooldownMs: 12000 }`. No `cost` block — first pass doesn't price souls
     yet; the field is optional.

2. Run local gate: `pnpm typecheck && pnpm lint && pnpm test -- --run &&
   pnpm validate:data`.

## Files
- `src/data/heroes/mougg-r.json` (new)
- `docs/plans/PLAN-12-heroes.md` (this file, new)

## Test strategy
Pure JSON add. No new test code needed:
- `pnpm validate:data` — will iterate `src/data/heroes/` (registered as
  `heroes → heroDefSchema`) and validate the new file.
- Existing `tests/data/schema-validation.test.ts` already covers
  `heroDefSchema` (accept/reject cases using the exact shape this file takes),
  so the hero schema contract is already pinned.

## Verification
- `pnpm typecheck` — clean
- `pnpm lint` — clean (JSON files aren't linted but nothing else changes)
- `pnpm test -- --run` — all existing tests green
- `pnpm validate:data` — reports `✓ src/data/heroes/mougg-r.json`

## Decisions
- **`id`: `"mougg-r-hero"`.** Distinguishes from the `mougg-grunt` so lookups
  can't collide. Bloodline stays `mougg-r` (shared with the grunt, as the
  orchestrator confirmed).
- **Stat calibration (all numeric; lives in JSON):**
  - hp 260 (3.25× grunt) — hero absorbs a lot; matches "tank" role in
    PROJECT_PLAN §4.3.
  - dps 22 (~1.8× grunt) — higher than grunt but not overwhelming; the burst
    comes from Clomp'uk, not auto-attacks.
  - speed 55 (grunt = 60) — slightly slower. Clearly above zero, clearly
    still "above the grunt in combat" on hp/dps/armor; the AC is "higher
    HP, DPS, armor" — speed isn't constrained, so we pick a value that
    reflects the heavy-tank fantasy.
  - armor 5 (grunt = 2) — higher as required.
- **Cost calibration:**
  - gold 150 (6× grunt), trainTime 12 (3× grunt) — hero is clearly the
    expensive, late-game spend.
  - respawnCost gold 80 (>15 grunt), time 30 (3× grunt) — satisfies
    "longer respawn delay + higher gold cost".
- **Ability (Clomp'uk) numbers — matches the orchestrator's calibration
  guidance and the existing hero-schema test fixture:**
  - `damage: 30` — roughly one grunt-second of AoE burst.
  - `radius: 64` — ~2 tiles at 32px map grid.
  - `stunMs: 1500` — enough to interrupt a charge, not enough to trivialize
    a wave.
  - `cooldownMs: 12000` — on the order of a wave-pace, so a single Clomp'uk
    is a meaningful tactical commitment.
  - `cost` — omitted. Souls economy isn't plumbed in M1; keeping the field
    absent (it's optional) avoids encoding a placeholder price.
- **Sprite path `orcs/mougg-r-hero.png`** — kebab-case, namespaced under the
  `orcs/` category per CLAUDE.md asset rules. Placeholder; asset pipeline is
  out of scope for this issue.
- **Flavor line `"KWAT DA TRA!"`** — the example line called out in the AC.
  Bloodrock-original dialect; no Ultima/UO references.
