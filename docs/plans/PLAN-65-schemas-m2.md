# PLAN-65 — extend unit/wave/building schemas for M2

## Context

M2 introduces gatherer/builder/scout/caster orcs (peon, gukka, skowt,
mojoka), procedurally-shaped wave generators, and stone fortifications
(stone walls, gates, watchtowers). This issue ships the **schema-only**
foundation so future M2 data PRs can land without re-litigating shape.

Anchor state, post #24:

- `unit.schema.ts` has no `kind` field today (bloodline was dropped, not
  renamed). The roster is keyed by `id`. We add a *new* optional `kind`
  enum and a *new* optional `role` enum — both additive, so the existing
  `grunt.json`, `peasant-levy.json`, and `brute.json` (which all omit
  these fields) continue to validate.
- `building.schema.ts` is a 2-arm discriminated union (`wall`, `tower`).
  We add three new arms (`wall-stone`, `gate`, `watchtower`) so the
  existing `wall-wood.json` and `ballista.json` keep parsing.
- `wave.schema.ts` exposes a single `waveDefSchema`. We split: keep
  `waveDefSchema` exactly as-is, and add two NEW sibling schemas —
  `wavePatternSchema` and `waveGeneratorConfigSchema`.
- Barrel (`src/data/schemas/index.ts`) is add-only.

## Branch

`feat/65-schemas-m2`

## Approach

### unit.schema.ts

Add two new exported enums + two new optional fields on
`unitDefSchema`:

```ts
export const unitKindSchema = z.enum([
  'grunt', 'brute', 'peon', 'gukka', 'skowt', 'mojoka',
]);
export const unitRoleSchema = z.enum([
  'fighter', 'builder', 'gatherer', 'caster', 'scout',
]);
```

Then on `unitDefSchema`:

```ts
kind: unitKindSchema.optional(),
role: unitRoleSchema.optional(),
```

Both optional because existing fixtures don't carry them.
`grunt`/`brute` are kept in the kind enum so future fixtures can opt in
without forcing a re-emit on the M1 set.

### building.schema.ts

Convert the discriminator from `category` literal arms `'wall'`,
`'tower'` to a 5-arm union:

- `wallDefSchema` (existing) — `category: 'wall'`
- `towerDefSchema` (existing) — `category: 'tower'`
- `wallStoneDefSchema` (new) — `category: 'wall-stone'`, same shape as
  `wallDefSchema` (hp/armor/buildCost/repairCost/damageStates) plus
  required `stoneCost` field on `buildCost` (see Decisions #2 below —
  we keep it minimal and just add `stone` as an optional cost line on a
  separate `buildCost` shape, mirroring wood-wall semantics).
- `gateDefSchema` (new) — `category: 'gate'`, base + `passableByTeam:
  z.enum(['orc','human','both','none'])`, `damageStates` shaped like
  walls.
- `watchtowerDefSchema` (new) — `category: 'watchtower'`, base +
  `combat` (range/damage/attackRate/projectileSpeed) + `sightRadius:
  z.number().positive()`.

`buildingDefSchema = z.discriminatedUnion('category', [wall, tower,
wallStone, gate, watchtower])`.

### wave.schema.ts

Keep `spawnEdgeSchema`, `waveSpawnSchema`, `waveDefSchema` byte-for-byte.
Add:

```ts
export const wavePatternSchema = z.object({
  id: z.string().min(1),
  // a named composition — e.g. 'rush', 'wedge', 'siege' — that a
  // generator can roll into a concrete WaveDef
  units: z.array(z.object({
    unitId: z.string().min(1),
    weight: z.number().positive(),
  })).min(1),
  edgeBias: z.array(spawnEdgeSchema).min(1),
  // optional cry override; generator falls back to the wave default
  cry: z.string().optional(),
});

export const waveGeneratorConfigSchema = z.object({
  id: z.string().min(1),
  // soft caps fed to the generator: how many waves to emit, base
  // budget per wave, growth curve
  waveCount: z.number().int().positive(),
  baseBudget: z.number().nonnegative(),
  budgetGrowth: z.number().nonnegative(),  // additive per wave
  patterns: z.array(z.string().min(1)).min(1),  // refs to wavePattern.id
  rewardPerWave: z.object({
    gold: z.number().nonnegative(),
  }),
});
```

These are forward-looking — we don't ship any fixtures for them in this
PR, so dataRegistry stays unchanged for `patterns`/`generators`
(matching the issue's "no new data files" rule).

### index.ts barrel

Already does `export * from './*.schema'`. New exports flow through the
existing star-exports automatically. No edit needed unless we add a new
file (we don't). `dataRegistry` stays as-is.

## Files

- `src/data/schemas/unit.schema.ts` — add `unitKindSchema`,
  `unitRoleSchema`; extend `unitDefSchema` with optional `kind`/`role`.
- `src/data/schemas/building.schema.ts` — add three new arms, expand
  the discriminated union.
- `src/data/schemas/wave.schema.ts` — add `wavePatternSchema`,
  `waveGeneratorConfigSchema`.
- `src/data/schemas/index.ts` — no edit (star exports cover new
  schemas; registry untouched per "no new data files").
- `tests/data/schema-validation.test.ts` — extend with positive cases
  (kind/role on a unit, each new building arm, pattern+generator) and
  negative cases (invalid kind, invalid role, unknown gate
  passableByTeam, missing watchtower sightRadius, empty pattern units,
  pattern with non-positive weight, generator with zero waveCount).

## Test strategy

Positive:
- A unit fixture with `kind: 'peon'` and `role: 'gatherer'` parses.
- A unit fixture omitting both fields still parses (regression).
- `wall-stone` building parses; `gate` parses with each
  `passableByTeam` value; `watchtower` parses with combat +
  sightRadius.
- Existing `wall-wood.json` + an inline ballista fixture still parse
  through `buildingDefSchema`.
- A wave-pattern parses; a wave-generator-config parses.

Negative:
- Unit with `kind: 'demon'` rejected.
- Unit with `role: 'tank'` rejected.
- Building with `category: 'gate'` missing `passableByTeam` rejected.
- Building with `category: 'watchtower'` missing `sightRadius`
  rejected.
- Wave pattern with empty units array rejected.
- Wave pattern with `weight: 0` rejected.
- Wave generator with `waveCount: 0` rejected.

All existing tests in the file continue to pass unchanged.

## Verification

- `pnpm typecheck` — clean
- `pnpm lint` — clean
- `pnpm test --run` — green (existing + new cases)
- `pnpm validate:data` — green (every existing JSON in `src/data/`
  still validates against its registry schema)

## Decisions

1. **`kind` and `role` are both optional.** The M1 fixtures don't carry
   them, and the issue's "All existing JSON files still validate" AC
   forbids breaking that. New M2 fixtures will populate them; the data
   layer will gain a runtime helper later if we need a non-optional
   contract.
2. **Stone wall = same shape as wood wall** for now, just a different
   `category` discriminator. We don't introduce a `stone` cost line —
   `buildCost.gold` is the M2 currency unit (Bludgelt) and any future
   resource type can land additively. This avoids forcing a Resource
   schema change in a schema-only PR.
3. **Gate `passableByTeam` enum** uses `'orc' | 'human' | 'both' |
   'none'` rather than a free-form string. M2 only has two factions;
   `'both'` and `'none'` cover the open-gate / sealed-gate states the
   gameplay design implies.
4. **Watchtower combines tower combat + a `sightRadius`** rather than
   inheriting from the existing `towerDefSchema`. Inheriting via
   `.extend()` would also work; we duplicate the shape inline to keep
   the discriminated union flat (Zod's `discriminatedUnion` doesn't
   compose extension cleanly, and one repeated block is cheaper than a
   wrapper schema).
5. **Wave pattern + generator stay schema-only.** No fixtures, no
   `dataRegistry` entry, no validate:data discovery. The point of this
   PR is to unblock M2; the first generator config will land with the
   first wave-spawn issue that uses it.
6. **No barrel edit needed.** The existing `export * from
   './wave.schema'` flows the new exports through automatically. Any
   future explicit named export from index.ts would be additive only,
   per the worker rule.
