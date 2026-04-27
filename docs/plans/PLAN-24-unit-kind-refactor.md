# PLAN-24 — drop bloodline taxonomy, rename to unit-kind model

## Context

The War-Tome canon (`docs/war-tome.md`) replaces the seven-bloodline class
model (Mougg'r, Thu'gub'r, Ggrultuk'r, Geeptiis'r, Mojoka, Gukka,
Sneek-R) with the eleven-unit roster of the hai (Snotling, Peon, Gukka,
Grunt, Skowt, Brute, Howl'r, Kaptain, Klerggoth, Wierdling, Mojoka).
LORE.md and PROJECT_PLAN.md were updated in PR #25; this issue brings
the code into line.

The shipped Mougg'r hero becomes a **Brute** hero (Clomp'uk slam fits
Brute lore — Brutes carry "iron-shod mougg" and the Bone Wall is the
elite tier). The shipped mougg-grunt becomes a generic **Grunt** line
unit.

## Branch

`feat/24-unit-kind-refactor`

## Approach

### Decisions

1. **Drop the `bloodline` field entirely** from `unitDefSchema` and the
   `Hero` type rather than renaming to `kind`. Reasons:
   - The data layer already keys units by `id` (`grunt`, `brute-hero`,
     `peasant-levy`); a separate `kind` would duplicate that channel.
   - Nothing in the live code branches on `bloodline` (grep confirms
     only display + fixture use). The HeroCard previously displayed
     `heroDef.bloodline` as a sub-label — we drop that line.
   - Future "unit-kind enum" work can land independently if we ever
     need a coarser bucket above `id`.
2. **Defer the internal `gold` → `bludgelt` rename**, per the issue
   body's recommendation. UI gets the "Bludgelt" label via i18n; the
   internal currency identifier stays `gold` (Economy, gameStore,
   Cost type, BuildingSystem, all wave rewards). Renaming the
   internal name has heavy blast radius (40+ files) for cosmetic gain
   and isn't required by the AC.
3. **Mougg'r hero → Brute hero** (id `mougg-r-hero` → `brute-hero`,
   filename `heroes/mougg-r.json` → `heroes/brute.json`, sprite path
   `orcs/mougg-r-hero.png` → `orcs/brute-hero.png`, name field stays
   `Brute` so default copy in tests is sensible).
4. **mougg-grunt → grunt** (id `mougg-grunt` → `grunt`, filename
   `orcs/mougg-grunt.json` → `orcs/grunt.json`, sprite
   `orcs/mougg-grunt.png` → `orcs/grunt.png`, name `Scrag` retained as
   a sensible default flavour name, flavor cleaned of mougg klerg).
5. **Strings** rename three keys (Gold → Bludgelt) plus the Bloodline
   label, but keep the `gold` part of identifiers like `cost.gold`.
6. **BloodlineCard.tsx → HeroOptionCard.tsx** (rename file +
   component; drop the bloodline sub-label entirely since the field is
   gone).
7. **HeroCreateForm.tsx** prop rename `bloodlines` → `units`, t() key
   to `hero.create.unitLabel`.
8. **HeroCreate.tsx** import path + `BLOODLINES` → `UNITS` rename;
   drop `bloodline:` from Hero construction.

### Ordered file groups (commits)

**Commit 1** — schema + type shape + strings schema + en.json + types/index.ts.
This needs to land together because the schema is loaded at module
import by both the data files and React, and Zod parses validate at
tests' module-load time. We collapse the issue's "Commit 1" into a
single change that takes data + schema in lockstep so the gate stays
green.

  - `src/data/schemas/unit.schema.ts` — drop `bloodline`
  - `src/data/schemas/strings.schema.ts` — rename three keys + add
    `hero.create.unitLabel`
  - `src/data/strings/en.json` — keys/values relabel
  - `src/types/index.ts` — `Hero.bloodline` removed; comment touch-up
  - `src/data/orcs/grunt.json` (new — replaces `orcs/mougg-grunt.json`)
  - `src/data/heroes/brute.json` (new — replaces `heroes/mougg-r.json`)
  - `src/data/humans/peasant-levy.json` — drop `bloodline`
  - delete `src/data/orcs/mougg-grunt.json`
  - delete `src/data/heroes/mougg-r.json`
  - `src/game/scenes/scene-bootstrap.ts` — rename imports
  - `src/ui/pages/HeroCreate.tsx` — rename import + drop `bloodline:`
    field (otherwise TS strict will catch the dangling property
    against the new `Hero` type).
  - `src/ui/templates/GameLayout.tsx` — relabel `goldPrefix: t('hud.gold')`
    → `t('hud.bludgelt')`, `insufficientGold: t('build.insufficientGold')`
    → `t('build.insufficientBludgelt')`.
  - `src/ui/organisms/HUD.tsx` — `t('hud.gold')` → `t('hud.bludgelt')`.
  - `src/ui/pages/GameOver.tsx`, `src/ui/pages/RunSummary.tsx` —
    `t('runEnd.statsGold')` → `t('runEnd.statsBludgelt')`.
  - `tests/data/schema-validation.test.ts` — fixture rename (mouggGrunt
    → grunt), drop `bloodline` from inline fixtures, swap `'hud.gold'`
    string-key references to `'hud.bludgelt'`.
  - All other test imports (Orc, Hero, Ability, AI, Damage, Economy,
    sprite-binder, m1-smoke, gameStore, metaStore, HeroCreateForm,
    HUD) updated to import from new filenames + drop bloodline.
  - `tests/ui/organisms/HUD.test.tsx` — `expect(screen.getByText('Gold'))`
    → `expect(screen.getByText('Bludgelt'))`.

**Commit 2** — React molecule rename: `BloodlineCard.tsx` →
`HeroOptionCard.tsx`. New component, delete the old. Update consumer
(`HeroCreateForm`).

**Commit 3** — closing commit: any stragglers + closes-#24 footer.

The plan uses 2-3 commits rather than the suggested 4 because:
- The schema/data/test changes are interlocked: changing the schema
  alone breaks every test that imports the data files (schema parse
  fails on `bloodline: 'mougg-r'` if we keep the field). Splitting
  forces the gate red.
- The molecule rename is genuinely standalone (it touches a brand-new
  file + `HeroCreateForm.tsx` only).

This still respects the retry-guard intent: each commit independently
passes the gate.

## Files

See approach above.

## Test strategy

- All existing tests must still pass. Tests that referenced
  `mougg-grunt`/`mougg-r`/`bloodline` get their imports + fixture
  references swapped; any explicit assertions on `heroDef.bloodline`
  or `hero.bloodline` are dropped.
- Add no new tests.
- `tests/state/metaStore.test.ts` `makeHero` fixture drops `bloodline`.
- `tests/ui/organisms/HUD.test.tsx` swaps the literal `'Gold'`
  expectation to `'Bludgelt'`.
- Hero create form test — `bloodline` assertion on `call.heroDef`
  removed; id assertion changes to `'brute-hero'`; rename
  `bloodlines` → `units` prop; rendered name asserts `'Brute'`.
- BuildSlot/BuildPanel tests use a literal `'Gold'` label as the
  `goldPrefix` prop value — that prop name is internal to the
  component (it's still `goldLabel`/`goldPrefix` in the React
  contract). The literal value can stay `'Gold'` since the test
  injects it directly. Acceptable: the AC says HUD shows Bludgelt,
  not that every UI test rewrites its props.

## Verification

- `pnpm typecheck` — clean
- `pnpm lint` — clean
- `pnpm test --run` — all 321+ pass
- `pnpm validate:data` — clean
- `git grep -E "bloodline|mougg-grunt|mougg-r|Mougg'r" src/ tests/` →
  zero matches

## Decisions (recap)

1. Drop `bloodline` (don't rename to `kind`).
2. Defer `gold` → `bludgelt` internal rename; only relabel UI strings.
3. Hero `mougg-r` becomes `brute`; orc `mougg-grunt` becomes `grunt`.
