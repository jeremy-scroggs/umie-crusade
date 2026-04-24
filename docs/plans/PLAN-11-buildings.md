# PLAN-11 — Buildings: wood wall + ballista JSON

## Context

Issue #11 requires authoring the two building JSON files for the M1 slice:
wood wall (defensive structure with damage states) and ballista (tower with
combat block). Zod schemas and the `validate-data` CLI already landed via
issue #1.

Schema (`src/data/schemas/building.schema.ts`) is a discriminated union on
`category`:
- `wall` — requires `hp`, `armor`, `buildCost.gold`, `repairCost.goldPerHp`,
  `damageStates[]` with `{hpThreshold, sprite}`, plus shared `id`, `name`,
  `sprite`, `flavor`.
- `tower` — requires `hp`, `armor`, `buildCost.gold`, `combat.{range, damage,
  attackRate, projectileSpeed}`, plus shared fields.

Inline fixtures in `tests/data/schema-validation.test.ts` already use the
exact IDs `wall-wood` and `ballista` with sprite names `buildings/wall-wood-*`
and `buildings/ballista.png`. I'll match those conventions so the files are
consistent with existing tests' source of truth.

## Branch

`feat/11-buildings`

## Approach

Author two JSON files under `src/data/buildings/` that conform to the
discriminated union. Lean on the test fixtures for structural shape; pick
numeric values that are conservative against a notional Peasant Levy
(~20 HP, ~3 dps) as noted by the orchestrator. Final wave-#5 tuning is
deferred to issue #22.

## Files

- `src/data/buildings/wall-wood.json` (new) — category `wall`
- `src/data/buildings/ballista.json` (new) — category `tower`
- `docs/plans/PLAN-11-buildings.md` (this doc)

## Test strategy

- Schema test suite already covers the wall + tower shapes via inline
  fixtures; no new tests required.
- `pnpm validate:data` will read every `*.json` under `src/data/buildings/`
  and parse it through `buildingDefSchema`. Both files must pass.
- Full local gate: `pnpm typecheck && pnpm lint && pnpm test -- --run &&
  pnpm validate:data`.

## Verification

Match issue acceptance:
1. `wall-wood.json`: HP, 3 damage states (pristine/cracked/crumbling),
   build cost, repair cost-per-HP, sprite refs per state. ✓
2. `ballista.json`: HP, range, damage, attackRate, projectileSpeed,
   build cost, sprite. ✓
3. `pnpm validate:data` passes. ✓
4. Numbers conservative, tunable in #22. ✓

## Decisions

- **Wall HP = 100**, **armor = 0**: at ~3 dps from a levy, one attacker takes
  ~33s to break a wall; five hits (each of 3 damage = 15 HP total) drop it to
  85% — consistent with "soak 5–10 levy hits before visible degrade"
  if we define "hit" as ~3 damage. Pristine stays above 66% threshold.
- **Damage state thresholds**: `1.0` (pristine, default), `0.66` (cracked at
  2/3 HP), `0.33` (crumbling at 1/3 HP). Matches the fixture in the schema
  test.
- **Build cost = 20 gold**, **repair = 1 gold per HP**: early-game cheap so
  players can wall up before wave 1. Repair equal to HP cost keeps full
  rebuild ~= new build.
- **Ballista HP = 80**, **armor = 1**: tougher than a wall per square but
  still killable — towers are high-value targets.
- **Ballista combat**:
  - `damage = 20` — one-shots a 20 HP levy, two-shots a slightly tougher
    human. Matches "drop a levy in 1–2 hits."
  - `range = 240` px — around 3.75 tiles at 64px, good standoff.
  - `attackRate = 0.8` shots/sec (one every 1.25s) — slow, deliberate.
  - `projectileSpeed = 300` px/sec — visibly travels, can be dodged at
    long range.
- **Build cost = 60 gold** — ~3x wall cost; single ballista is a meaningful
  investment.
- **Sprite naming** follows CLAUDE.md kebab-case namespaced convention and
  matches the schema-test fixtures:
  `buildings/wall-wood-pristine.png`, `-cracked.png`, `-crumbling.png`, and
  `buildings/ballista.png`. The wall's top-level `sprite` points at the
  pristine art (the default render).
- **Flavor text** kept short and in the Bloodrock voice — wall's "Nub pass!"
  already used in test fixture; ballista gets a fresh orc-exclaim.

All numbers are intentionally conservative — real calibration lands in #22.
