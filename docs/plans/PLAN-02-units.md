# PLAN-02 — Mougg'r grunt + Peasant Levy unit JSON

## Context
Issue #2 asks us to author the two unit JSON files required for the M1 slice:
a playable Mougg'r grunt orc and an enemy Peasant Levy human. This is a
data-only change; all balance numbers live in JSON under `src/data/`. The Zod
unit schema (from #1) already supports both factions via `faction` and allows
`goldDrop` on humans and `respawnCost` on orcs.

The schema file `src/data/schemas/unit.schema.ts` is the source of truth, and
`src/data/schemas/index.ts` already registers `humans` → `unitDefSchema` so
`pnpm validate:data` will pick up the new file with no code changes required.

## Branch
`feat/2-units`

## Approach
1. Confirm the existing `src/data/orcs/mougg-grunt.json` fixture satisfies the
   acceptance criteria. Reference against `PROJECT_PLAN.md` §5.3 fields: id,
   name, bloodline, category, stats, cost, respawnCost, sprite, animations,
   abilities, unlockRequirement, flavor. All present. Schema also requires
   `faction` (added in #1) which is present (`"orc"`).
2. Author `src/data/humans/peasant-levy.json` following the shape the test in
   `tests/data/schema-validation.test.ts` already pins for the "human with
   goldDrop and no respawnCost" case. Use fodder-tier numbers: low HP, low
   DPS, fast, drops a handful of gold.
3. Run the local gate: `pnpm typecheck && pnpm lint && pnpm test -- --run &&
   pnpm validate:data`.

## Files
- `src/data/humans/peasant-levy.json` (new)
- `docs/plans/PLAN-02-units.md` (this file, new)

No changes to `src/data/orcs/mougg-grunt.json` — see Decisions.

## Test strategy
- `pnpm validate:data` will iterate `src/data/humans/` and the new file must
  validate against `unitDefSchema`.
- The existing vitest suite already has a test case that matches the shape we
  need; no new tests required.
- Typecheck + lint must stay green; since this is a pure JSON add, there
  should be no TS/ESLint impact.

## Verification
- `pnpm typecheck` — clean
- `pnpm lint` — clean
- `pnpm test -- --run` — all existing tests green
- `pnpm validate:data` — both `orcs/mougg-grunt.json` and
  `humans/peasant-levy.json` pass (directories iterated by
  `tools/validate-data.ts` via `dataRegistry`)

## Decisions
- **Leave `mougg-grunt.json` untouched.** The file was authored during M0 as
  a fixture to prove the unit schema in #1. It already has every field the
  PROJECT_PLAN §5.3 schema shape calls for, including the `faction: "orc"`
  discriminator introduced in #1. Modifying balance numbers now would be
  scope creep; the AC only requires the file "follows the schema shape",
  which it does. Issue-note from the orchestrator explicitly allows this.
- **Peasant Levy numbers (fodder vs. wave-5 difficulty):**
  - hp 20, dps 3, speed 70, armor 0 — a tier below the grunt (hp 80, dps 12).
  - cost `{ gold: 0, trainTime: 0 }` — humans are not trained by the player,
    they spawn via waves. Schema requires the field; zero is the conservative
    neutral value.
  - no `respawnCost` — humans don't respawn.
  - `goldDrop: 4` — small bounty; wave clears should feel rewarding without
    being exploitable.
  - `category: "fodder"` — schema supports this enum member.
  - `bloodline: "none"` — per #1's human-faction design decision already
    encoded in the schema-validation test.
  - `abilities: []` — a levy has no special tricks.
  - `unlockRequirement: null` — not applicable to enemies.
  - `flavor` — short in-character cry; stays clear of Ultima IP.
