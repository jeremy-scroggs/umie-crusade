# PLAN-63 — data(strings): en.json keys for M2 units / buildings / HUD

## Context

Issue #63 — M2 data wave D8. Add user-facing strings for all new M2 surfaces:
4 humans (Order of Honor, Rangers of Justice, Knights of Valor, Paladins of
Compassion), 2 hero kinds (Skowt, Mojoka), 2 worker orcs (Peon, Gukka, plus
Skowt and Mojoka grunt variants), 3 buildings (stone wall, gate, watchtower),
and any pause/speed HUD or run-summary additions M2 needs.

`ui.speedControl.*` keys mentioned in the issue are referenced as already
landed via U4 (#76); the existing key shape on main is `hud.speed.*` (pause,
pauseAria, 1x, 2x, 4x, groupAria). They cover the full set of speed states
already, so no additive HUD speed work is required here.

## Branch

`feat/63-strings-m2`

## Approach

Strings-only, additive. For each new content surface:

- Add display name + flavor under `ui.unit.<id>.{name,flavor}` for every M2
  orc, human, and hero (faction-original Bloodrock orcish for orcs/heroes;
  game-original lawful-order flavor for humans).
- Add display name + flavor under `ui.building.<id>.{name,flavor}` for every
  M2 building **currently on main**.
- Mirror every new key in `strings.schema.ts` so the strict `z.object` parse
  and the no-key-missing test stay green.

D6 (#60 Knights of Valor / Paladins of Compassion) and D7 (#61 stone-wall /
gate / watchtower) are inflight in parallel waves and **not on main at
dispatch**. Per the issue's guidance, this PR adds strings only for what is
present on main and documents the deferred keys in `## Decisions` so a
follow-up data-only commit can land them once the fixtures merge.

### Key naming convention

- `ui.unit.<unitId>.name` — display name shown in HUD / build panel /
  spawn callouts.
- `ui.unit.<unitId>.flavor` — short tagline. Mirrors the `flavor` field on
  the JSON fixture but lives in the i18n bundle so it can be localized
  without editing data.
- `ui.building.<buildingId>.name` / `ui.building.<buildingId>.flavor` —
  same pattern for buildings.
- `ui.hero.<heroId>.{name,flavor}` — hero defs have their own ids
  (`skowt-hero`, `mojoka-hero`, `brute`) and their own card surfaces, so
  they get their own namespace.

This convention follows the existing dotted-namespace style already used
across `hud.*`, `menu.*`, `hero.create.*`, `build.*`, `battle.*`,
`runEnd.*`, etc.

## Files

- `src/data/strings/en.json` — add new keys with English values.
- `src/data/schemas/strings.schema.ts` — add matching `z.string().min(1)`
  entries so the schema stays in lockstep with the bundle.
- `docs/plans/PLAN-63-strings-m2.md` — this plan.

No system code, no UI wiring (out of scope; consumers will wire `t('...')`
calls in their own M2 issues).

## Test strategy

- `tests/data/schema-validation.test.ts` `strings schema` block already
  asserts `stringsDefSchema.safeParse(enStrings).success === true`. New
  keys must appear in both files for this to remain green; drift in either
  direction (missing-in-json or missing-in-schema) will fail the parse.
- `tests/lib/i18n.test.ts` — `t()` lookups still resolve; no key removed.
- `pnpm validate:data` — must remain green.

No new tests needed (the existing parse-equivalence test is sufficient
coverage for additive key changes).

## Verification

Gate:

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test --run`
4. `pnpm validate:data`

All four must pass before commit.

## Decisions

- **Naming convention** — `ui.<surface>.<id>.{name,flavor}` for all
  fixture-backed strings; matches existing dotted style.
- **Scope: orc workers** — both `peon` and `gukka` get name + flavor.
- **Scope: M2 grunt variants** — `skowt` and `mojoka` (the non-hero orcs
  in `src/data/orcs/`) also get strings. They are distinct ids from the
  heroes (`skowt-hero`, `mojoka-hero`).
- **Scope: heroes** — `skowt-hero` and `mojoka-hero` get hero-namespaced
  strings; the existing M1 `brute` hero is left alone (M1 surface,
  out of scope).
- **Scope: humans** — `order-of-honor` and `rangers-of-justice` are on
  main and get strings. `knights-of-valor` and `paladins-of-compassion`
  are part of D6 (#60) which is **inflight in a parallel worker** and
  **not present on main at dispatch**. Their strings are intentionally
  deferred to a follow-up data commit so #63 does not block on a sibling
  wave; if both fixtures land before #63 merges, a one-line patch adds
  them.
- **Scope: buildings** — only `wall-wood` and `ballista` are on main;
  the M2 trio `wall-stone` / `gate-wood` / `watchtower` (D7, #61) is
  **inflight in a parallel worker** and **not present on main at
  dispatch**. Strings for those three are deferred under the same
  follow-up.
- **Scope: HUD speed/pause** — already complete on main from U4 (#76);
  no additive changes.
- **Scope: run-summary** — the M1 `runEnd.*` keys (statsWave,
  statsSkulls, statsBludgelt, replay, mainMenu) cover the M2 run-summary
  surface. No additive changes required.
- **Bloodrock voice** — orc/hero flavor in pidgin orcish per existing
  fixtures. Human Order flavor is game-original and lawful-zealot in
  voice; **no UO IP** (no Britannian virtue names, no Shadowlord names,
  no UO place names).
- **Localization keys** — only `en.json` updated; no other locale
  bundles exist yet.
