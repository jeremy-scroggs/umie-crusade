# PLAN-04 — en.json strings + i18n helper

## Context
Issue #4 asks us to author the `en.json` UI string bundle and a tiny
`t(key)` lookup helper so all UI copy is i18n-ready from day one per §0 of
the project plan. The file already exists from M0 with 12 keys
(`game.title`, `hud.gold`, `hud.wave`, `hud.lives`, `menu.start`,
`menu.settings`, `menu.credits`, `battle.waveStart`, `battle.victory`,
`battle.defeat`, `battle.killConfirm`, `battle.bossWave`). We're
**extending** it — existing keys stay — and adding the new keys required
by the acceptance criteria (HUD skulls / hero HP, hero-create page, build
panel, win/lose screens with Bloodrock creed, and the two battle cries).

The schema (`src/data/schemas/strings.schema.ts`) is currently a loose
`z.record(z.string(), z.string())` with a `TODO(#4)` to tighten once M1
strings are in. We will tighten it to a `z.object({...})` pinning the
canonical key set so typos / drops fail `pnpm validate:data`.

`src/lib/` contains only `constants.ts`; no i18n helper exists yet.

## Branch
`feat/4-strings`

## Approach
1. Extend `src/data/strings/en.json` with the new AC-required keys while
   preserving the 12 existing keys verbatim. Group by namespace:
   - HUD: `hud.skulls`, `hud.heroHp` (on top of the existing gold / wave /
     lives)
   - Hero-create page: `hero.create.title`, `hero.create.bloodlineLabel`,
     `hero.create.nameLabel`, `hero.create.namePlaceholder`,
     `hero.create.beginButton`
   - Build panel: `build.wall`, `build.ballista`, `build.repair`,
     `build.insufficientGold`
   - Battle / win-lose: the two cries already exist
     (`battle.waveStart` = "ISE HAI!" and `battle.bossWave` =
     "KWAT DA TRA!"). We add `battle.heroAbility` as an alias for the
     hero-ability cry to make call-site intent clear at the use-site
     (both resolve to the same Bloodrock shout). `battle.victory` already
     carries the "Bludchok-hai gug!" cry. Add `battle.defeatCreed` with
     the Bloodrock creed line on defeat (existing `battle.defeat` stays
     for the short screen title).
2. Tighten the schema: replace the record with a `z.object({...})` listing
   every canonical key as `z.string().min(1)`, and export a
   `StringKey` TypeScript union inferred from the schema keys.
   `.strict()` would reject future keys added before the schema is
   updated; we'll leave it non-strict (default) so adding a key to
   `en.json` without a schema bump doesn't fail validation — the
   contract we want is "all canonical keys present", not "only canonical
   keys present".
3. Create `src/lib/i18n.ts`. Import `en.json` directly (Vite/TS both
   support JSON imports via `resolveJsonModule` which is enabled in the
   bundler preset). Export:
   - `type StringKey` — re-export from the schema module
   - `t(key: StringKey): string` — returns the value, or throws if the
     key is missing. Throwing is safer than silently returning the key
     because (a) the schema guarantees all keys exist at build time, so
     a missing lookup is always a programmer error, and (b) a thrown
     error surfaces immediately in dev instead of leaking raw key names
     into the UI.
4. Add a small test in `tests/lib/i18n.test.ts` covering the happy path
   and the missing-key throw. Extend `tests/data/schema-validation.test.ts`
   with a negative case proving the tightened schema rejects a bundle
   missing a required key.
5. Run the gate: `pnpm typecheck && pnpm lint && pnpm test -- --run &&
   pnpm validate:data`.

## Files
- `src/data/strings/en.json` (modified — extend)
- `src/data/schemas/strings.schema.ts` (modified — tighten)
- `src/lib/i18n.ts` (new)
- `tests/lib/i18n.test.ts` (new)
- `tests/data/schema-validation.test.ts` (modified — add negative case)
- `docs/plans/PLAN-04-strings.md` (this file, new)

## Test strategy
- `tests/lib/i18n.test.ts` — unit-tests `t()` resolves a known key and
  throws on an unknown key (cast through `as StringKey` to simulate a
  runtime drift).
- `tests/data/schema-validation.test.ts` — existing positive case stays;
  add a negative case asserting a bundle missing `hud.gold` fails.
- `pnpm validate:data` — must remain green after the schema tightening.

## Verification
- `pnpm typecheck` — clean
- `pnpm lint` — clean
- `pnpm test -- --run` — all tests pass including the new i18n suite
- `pnpm validate:data` — `src/data/strings/en.json` passes the tightened
  schema

## Decisions
- **Tighten the schema.** The issue's acceptance criteria pin a canonical
  key set; encoding it in `z.object({...})` turns "missed a key" into a
  validation failure at CI time rather than a runtime 404. It's a ~15
  line change — worth doing now per the orchestrator's guidance.
- **`t()` throws on missing key.** `en.json` is the source of truth, the
  schema guarantees keys exist at build time, and TypeScript's
  `StringKey` union prevents typos at the call site. A throw surfaces
  drift loudly; a silent key-as-fallback would mask bugs.
- **`battle.heroAbility` alias.** The hero-ability cry and the boss-wave
  cry happen to share the same Bloodrock shout ("KWAT DA TRA!") in
  current lore. Rather than reuse `battle.bossWave` at hero-ability
  call-sites (which would couple unrelated UI intents), we add a
  dedicated key. If the lore ever diverges, we change one string, not
  grep the codebase.
- **`battle.defeatCreed` separate from `battle.defeat`.** The existing
  `battle.defeat` is the short banner text ("The fort has fallen…").
  The AC asks for a creed line on defeat; adding a separate
  `battle.defeatCreed` key keeps the short title and the longer creed
  decoupled so UI can use either or both.
- **Non-strict schema.** We pin required keys but don't forbid extras.
  Adding a key to `en.json` without a schema bump should be fine in
  practice; forbidding extras would force a schema edit for every new
  UI label, which is churn without benefit.
- **`src/lib/i18n.ts` lives alongside `constants.ts`.** Pure utility, no
  Phaser / React dependency — matches the `src/lib/` contract.
