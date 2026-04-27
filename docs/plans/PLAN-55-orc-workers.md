# PLAN-55 — Gukka builder + Peon gatherer JSON

## Context

M2 introduces non-combat orc workers. **Gukka** auto-repairs walls;
**Peon** gathers gold from passive nodes between waves. Neither has a
combat role. This issue is data-only: author two JSON fixtures under
`src/data/orcs/` that the schema layer (just landed via #65) accepts.

Anchor state:

- `src/data/schemas/unit.schema.ts` (post-#65) carries
  `unitKindSchema` with `'gukka'` and `'peon'` and `unitRoleSchema`
  with `'builder'` and `'gatherer'`. Both are optional fields on
  `unitDefSchema`. Per-role fields (`repairAmount` /
  `repairCooldownMs` / `repairCostGold` / `gatherAmount` /
  `gatherCooldownMs`) were **NOT** added by #65 — the schema is
  permissive and Zod's `.object()` strips unknown keys on parse,
  meaning the JSON validates with the issue-promised field names
  even though the schema doesn't currently enforce them. AI/system
  wiring (#30, #68) is out of scope for this PR.
- `src/data/orcs/grunt.json` is the canonical unit fixture shape we
  mirror.
- `tools/validate-data.ts` runs `unitDefSchema.safeParse` against
  every JSON in `src/data/orcs/`; both new files must show as `✓`.

## Branch

`feat/55-orc-workers`

## Approach

Author two JSON fixtures using grunt's shape + the new optional
`kind`/`role` fields + the issue-promised role-specific fields:

### `src/data/orcs/gukka.json`

- `id: "gukka"`, `name: "Gukka"`
- `category: "builder"`, `faction: "orc"`
- `kind: "gukka"`, `role: "builder"`
- non-combat stats: low HP, slow, zero `dps`
- repair fields: `repairAmount`, `repairCooldownMs`, `repairCostGold`
- `sprite: "orcs/gukka.png"`
- `animations: ["idle", "walk", "repair", "death"]` (no attack — non-combat)
- `abilities: []`
- `unlockRequirement: null`
- orcish flavor string in the same register as grunt's "Klerg jat!"

### `src/data/orcs/peon.json`

- `id: "peon"`, `name: "Peon"`
- `category: "fodder"` (no good fit; peon is non-combat. `builder`
  is taken in spirit by gukka. `fodder` exists in the
  `category` enum and matches "weak unit"; we use it here as the
  closest non-combat fit. See Decisions.)
- `faction: "orc"`, `kind: "peon"`, `role: "gatherer"`
- non-combat stats: very low HP, slow, zero `dps`
- gather fields: `gatherAmount`, `gatherCooldownMs`
- `sprite: "orcs/peon.png"`
- `animations: ["idle", "walk", "gather", "death"]`
- `abilities: []`
- `unlockRequirement: null`
- orcish flavor

## Files

- `src/data/orcs/gukka.json` (new)
- `src/data/orcs/peon.json` (new)
- `docs/plans/PLAN-55-orc-workers.md` (this plan)

No code changes. No schema changes. No barrel edits.

## Test strategy

- `pnpm validate:data` must show both files as `✓` and total passed
  count includes them.
- `pnpm test -- --run` must remain green; the existing schema test
  suite already has positive cases for `kind: 'gukka'`, `kind:
  'peon'`, `role: 'builder'`, `role: 'gatherer'` so no test addition
  is needed.

## Verification

- `pnpm typecheck` — clean (no TS code touched)
- `pnpm lint` — clean (no TS code touched)
- `pnpm test -- --run` — green
- `pnpm validate:data` — green, both fixtures listed as `✓`

## Decisions

1. **Stat numbers (Gukka).** `hp: 50` (well below grunt's 80; gukka
   is unarmored labor), `dps: 0` (non-combat per AC), `speed: 50`
   (slower than grunt's 60), `armor: 0`. `cost: { gold: 35,
   trainTime: 6 }` — slightly pricier than a grunt to gate
   wall-repair economy. `respawnCost: { gold: 20, time: 12 }`
   matches grunt's pattern.
2. **Repair fields (Gukka).** `repairAmount: 8` (HP per tick),
   `repairCooldownMs: 2000` (1 tick / 2s — feels worker-paced, not
   instant), `repairCostGold: 1` (1g per repair tick — matches
   `wall-wood` `repairCost.goldPerHp: 1` so a single tick costs
   ~1g/8hp; can be retuned). Conservative — small, slow, cheap.
3. **Stat numbers (Peon).** `hp: 30` (slightly above peasant-levy's
   20; peons aren't *that* fragile), `dps: 0`, `speed: 55`, `armor:
   0`. `cost: { gold: 20, trainTime: 3 }` — cheapest unit in the
   roster, since the player needs many. `respawnCost: { gold: 10,
   time: 8 }`.
4. **Gather fields (Peon).** `gatherAmount: 5` (gold per gather
   tick), `gatherCooldownMs: 4000` (1 tick / 4s — slow trickle, by
   design between-waves). Conservative; tunable in M2 balance pass.
5. **Peon `category`.** The `category` enum is `'melee' | 'ranged' |
   'caster' | 'builder' | 'siege' | 'healer' | 'fodder'`. Peon is
   not a combat unit so `melee/ranged/caster/siege/healer` don't
   fit. `'builder'` is taken by gukka in spirit. `'fodder'` is the
   closest fit — it's used for `peasant-levy` (the human
   non-combatant) and signals "weak unit" rather than a combat
   shape. New `category` values (e.g. `gatherer`) would need a
   schema change which is out of scope. Future #65-follow-up could
   widen `category`.
6. **Gukka `category`.** Uses `'builder'` — already in the enum and
   matches the unit's role exactly.
7. **No combat animations.** Both units omit `attack` from
   `animations` since they have no combat. Gukka has `repair`,
   peon has `gather`.
8. **`abilities: []`.** Neither worker has a hero-style ability.
9. **`unlockRequirement: null`.** Both are baseline workers
   available from the start of M2.
10. **Schema field enforcement.** The schema doesn't validate
    repair/gather fields (gap left by #65). Zod strip means the JSON
    parses; downstream systems will read the fields directly. A
    future schema PR (#65 follow-up) should harden this with a
    discriminated union on `role`. Documented here so the gap isn't
    forgotten.
11. **Flavor strings.** Use grunt-register orcish: short, gnarled,
    in-character. Gukka: "Klop fix klop!" (literally "wall fix
    wall!"). Peon: "Dig dig, gold gold." Consistent with the
    "Nooograh! Clomp jat!" / "Klerg jat!" style of existing
    fixtures.
