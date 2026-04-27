# PLAN-61 — Buildings: stone wall + gate + watchtower JSON

## Context

Issue #61 (M2 buildings tier) calls for three new building fixtures that exercise
the discriminated-union shapes introduced by #65 in `building.schema.ts`:

- `wall-stone` — heavier, costlier variant of `wall-wood`. Uses the dedicated
  `wall-stone` category arm (NOT a `material` field on `wall`), so the existing
  `wall-wood.json` is left untouched.
- `gate` — wall-shaped fortification with `passableByTeam` enum. M2 default is
  open to orcs, blocking humans (`'orc'`).
- `watchtower` — tower-shaped with both `combat` block and a separate
  `sightRadius` (vision distinct from firing envelope).

`pnpm validate:data` walks `src/data/buildings/*.json` through
`buildingDefSchema` (the discriminated union). All three new files must pass.

## Branch

`feat/61-buildings-stone-gate-tower`

## Approach

JSON-only feature. Mirror the patterns from `wall-wood.json` and `ballista.json`,
swapping in the M2 fields. No system code, no schema edits, no test edits — the
schema and tests for these shapes already shipped via #65.

## Files

- `src/data/buildings/wall-stone.json` (new)
- `src/data/buildings/gate.json` (new)
- `src/data/buildings/watchtower.json` (new)
- `docs/plans/PLAN-61-buildings-stone-gate-tower.md` (this file)

## Test strategy

- `pnpm validate:data` — validates each JSON against `buildingDefSchema`.
- `pnpm test --run tests/data/schema-validation.test.ts` — existing schema tests
  cover the M2 shapes (stone wall, gate, watchtower) with synthetic fixtures, so
  a passing run confirms our shapes still match if we keep field names stable.
- `pnpm typecheck` and `pnpm lint` for sanity.

## Verification

1. `pnpm validate:data` — all green, three new files listed.
2. `pnpm test --run` — schema-validation suite passes.
3. `pnpm typecheck` and `pnpm lint` clean.

## Decisions

### wall-stone stat reasoning vs wall-wood

Wood: hp 100, armor 0, buildCost 20g, repairCost 1 g/hp, 3 damage states
(1.0 / 0.66 / 0.33 thresholds).

Stone scales as a clear upgrade tier:

- `hp: 250` — 2.5× wood. Big enough that stone walls are strategically
  meaningful but not so high that orc raids feel hopeless against captured
  human masonry.
- `armor: 3` — adds meaningful flat damage reduction vs human levy/zealot dps
  bands (~5 dps); wood stays at 0 to keep early game fragile.
- `buildCost: { gold: 60 }` — 3× wood. Discourages spamming stone in early
  waves; aligns with ballista cost so stone is a real economic decision.
- `repairCost: { goldPerHp: 2 }` — 2× wood. Higher per-hp repair tax keeps
  stone from being trivially patched mid-wave.
- 3 damage states matching wood (`pristine` / `cracked` / `crumbling` at
  `1.0` / `0.66` / `0.33`). The schema test asserts a 2-state stone wall is
  valid, but the issue calls for "damage states (pristine/cracked/crumbling)",
  so we ship the full set.
- Sprite naming: `buildings/wall-stone-{pristine,cracked,crumbling}.png` —
  kebab-case, namespaced under `buildings/`, matching wall-wood convention.
- Flavor: `"Klop hard."` — short orcish boast, consistent voice. (Schema test
  uses the same line; matches the lore tone.)

### gate cost

- `id: "gate"` — issue #61 explicitly names the file `gate.json` and acceptance
  criteria reference "gate" without a material qualifier. The schema test uses
  `gate-wood` as a synthetic fixture, but our canonical M2 fixture is the
  baseline `gate`.
- `hp: 120` — slightly tougher than wood wall (100) since a gate is a focal
  defensive point and breaching it routes the wave; but well below stone (250)
  to keep gates a softer chokepoint than stone walls.
- `armor: 1` — light reinforcement (banded wood / iron strapping flavor), one
  step above wall-wood.
- `buildCost: { gold: 40 }` — 2× wood wall. Cheaper than stone (60) and
  ballista (60) because a single gate is required to make a wall ring useful;
  pricing it out would gate (heh) M2 base layouts unnecessarily.
- `repairCost: { goldPerHp: 1 }` — same as wood; encourages quickly patching
  the breach point.
- `passableByTeam: "orc"` — the M2 default per issue brief. Orcs sally through;
  humans do not. Schema permits `'human' | 'both' | 'none'` for future
  sabotage / siege states (e.g., gate breached open = `'both'`).
- 3 damage states `closed / battered / breached` so the visual telegraphs the
  approaching `passableByTeam: 'both'` failure mode. Sprite paths
  `buildings/gate-closed.png` etc.

### watchtower sight radius

- `hp: 90` — mid-tier; slightly tougher than ballista (80) because watchtowers
  are passive-vision pieces players rely on for early warning, but still
  destructible.
- `armor: 1` — same as ballista.
- `buildCost: { gold: 70 }` — modestly above ballista (60). Watchtower trades
  raw firepower for vision.
- `combat: { range: 220, damage: 8, attackRate: 1.0, projectileSpeed: 280 }` —
  a real but weak weapon (lighter than ballista's 240/20/0.8). Still positive
  on every field per schema. Watchtowers are scouts that can plink, not main
  damage dealers.
- `sightRadius: 360` — 1.6× the watchtower's own firing range (220) and
  meaningfully larger than ballista's range (240), so a watchtower placed
  forward of a ballista lights up targets before they enter the ballista's
  envelope. Issue brief: "extends sight radius for nearby ballistas."
- Sprite: `buildings/watchtower.png` (single sprite — no damage states schema
  requirement on towers/watchtowers).
- Flavor: `"Skowt see far!"` — orcish-voiced, ties to scout (skowt) lore.

### Out of scope

- No system code changes. The watchtower sight-buff for nearby ballistas is a
  S5/S6 concern (vision system / tower targeting), not data.
- No new sprite assets — sprite paths are placeholders matching the kebab-case
  asset convention; art lands in a separate pass.
- No new tests — `tests/data/schema-validation.test.ts` already covers the M2
  shapes via inline fixtures.
