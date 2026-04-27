# PLAN-62 — Wave patterns + generator config

## Context

Issue #62 swaps the M1 hand-authored waves for a generator-driven model.
Schemas were added in #65: `wavePatternSchema` (id, weighted units,
edgeBias, optional cry) and `waveGeneratorConfigSchema` (id, waveCount,
baseBudget, budgetGrowth, patterns[], rewardPerWave). The generator
runtime that consumes these is S7 (#72) — out of scope here.

This issue is JSON-only: 4 patterns + 1 generator config, all validated
by `pnpm validate:data`. M1 hand-authored fixtures remain untouched as
fallback / boss-stub references.

## Branch

`feat/62-wave-patterns`

## Approach

1. Author 4 wave patterns under `src/data/waves/patterns/`:
   - `siege_push.json` — heavy, slow column. Knights of Valor as the
     "siege escort" (no ram unit exists; ram is a future M3 unit per
     issue note). Patterns reference units by id only — Order of Honor
     anchor the line.
   - `skirmish_harass.json` — fast, light: peasant levy + rangers,
     leaning to flanks (W) and a bit of N.
   - `priest_column.json` — paladins-led healer column with knight
     guard — slow, attritional.
   - `paladin_advance.json` — knights of valor armoured advance with
     paladin support; the "valor" theme.
2. Author `src/data/waves/generator.json` — `waveCount = 20` to cover
   M2's expected wave run; `baseBudget` + `budgetGrowth` form a linear
   intensity curve; `patterns` lists the 4 ids the generator may roll.
3. Extend the data registry + validator so the new files actually get
   parsed:
   - `dataRegistry` only iterates direct subdirs of `src/data/`. We add
     `waves/patterns: wavePatternSchema` so files in that subdir parse
     against the pattern schema.
   - `tools/validate-data.ts` reads top-level `waves/*.json` against
     `waveDefSchema` — `generator.json` would fail that. We special-
     case the generator file (or schema-route by filename) so
     `waves/generator.json` parses against `waveGeneratorConfigSchema`
     and `m1-wave-*.json` keep using `waveDefSchema`.
4. Run gate: `pnpm validate:data`, `pnpm typecheck`, `pnpm lint`,
   `pnpm test --run`, `pnpm build`.

## Files

New:
- `src/data/waves/patterns/siege_push.json`
- `src/data/waves/patterns/skirmish_harass.json`
- `src/data/waves/patterns/priest_column.json`
- `src/data/waves/patterns/paladin_advance.json`
- `src/data/waves/generator.json`
- `docs/plans/PLAN-62-wave-patterns.md`

Modified (registry + validator only — schemas/config unchanged):
- `src/data/schemas/index.ts` — register `waves/patterns` subdir.
- `tools/validate-data.ts` — recurse one level into `waves/patterns`,
  and route `waves/generator.json` to `waveGeneratorConfigSchema`.

Untouched:
- `src/data/waves/m1-wave-{1..5}.json` — kept as fallback / boss-stub
  references.

## Test strategy

- `pnpm validate:data` is the primary gate; it now must visit
  `waves/patterns/*.json` (4 files) and `waves/generator.json`
  alongside the legacy `m1-wave-*.json`, and all must parse green.
- `tests/data/schema-validation.test.ts` already covers
  `wavePatternSchema` and `waveGeneratorConfigSchema` shapes —
  no test changes needed.

## Verification

- `pnpm validate:data` — green, lists all 4 patterns + generator.json.
- `pnpm typecheck` — green.
- `pnpm lint` — green.
- `pnpm test --run` — green.
- `pnpm build` — green.

## Decisions

1. **Ram unit (siege_push):** the issue mentions "rams + escort
   knights" but there is no `siege-ram` unit on main. Conservative
   choice: omit ram entirely; siege_push is heavy infantry — Knights
   of Valor + Order of Honor anchoring with a small Paladin escort.
   The pattern's *theme* (slow heavy push) survives. A future M3
   unit can be added via `units` weights without schema change.
2. **Intensity curve:** `baseBudget = 40`, `budgetGrowth = 12` per
   wave, `waveCount = 20`. M1 ran 5 waves, M2 will run more —
   20 covers the intended run plus the every-10 boss slot. The
   generator's curve is *additive linear* (the schema names the
   field `budgetGrowth`, not multiplier); generator runtime (S7)
   may overlay a multiplier on top of that.
3. **Boss waves:** the M1 hand-authored `m1-wave-*.json` files stay
   as boss-stub references / fallback content; no boss JSON authored
   here — Grand Paladin tuning is M3.
4. **Generator id + reward:** `id = "m2-default"`, `rewardPerWave
   = { gold: 25 }` matches the M1 fixture per-wave reward shape.
5. **Pattern weights:** chosen to reflect the pattern theme
   (e.g. paladin_advance leans Knights of Valor + paladins; the
   peasant levy is dropped from valor/priest patterns to keep
   weight semantics meaningful).
6. **edgeBias:** uses the existing N/S/W edges (no E in the
   schema). Patterns vary their bias to give the generator a
   natural directional mix.
7. **Validator change:** add-only — keeps existing wave-file
   parsing intact; new files in `waves/patterns/` are routed to
   `wavePatternSchema`, and `waves/generator.json` is routed to
   `waveGeneratorConfigSchema`. No PROTECTED files touched.
