# PLAN-18 — Hero-creation page (pick Mougg'r, name orc, begin run)

## Context
Issue #18 is the M1 hero-creation scaffold per PROJECT_PLAN §4.3. For this
milestone there is a single bloodline (Mougg'r) — the player names the orc,
the hero is persisted to a roster in `metaStore` (localStorage), and a
"begin run" signal transitions to the Phaser Game scene.

Upstream pieces already merged on main:
- `src/data/heroes/mougg-r.json` (#12) — name, bloodline `"mougg-r"`, stats,
  flavor `"KWAT DA TRA!"`, Clomp'uk ability block.
- `src/data/strings/en.json` + `src/data/schemas/strings.schema.ts` (#4) —
  `hero.create.{title,bloodlineLabel,nameLabel,namePlaceholder,beginButton}`
  keys exist, resolved via `t(key)` in `src/lib/i18n.ts`.
- `src/state/gameStore.ts` — established Zustand pattern (no persist yet).
- Atomic-design dirs under `src/ui/`: `atoms/` (ResourcePill), `organisms/`
  (HUD), `templates/` (GameLayout). No `molecules/` or `pages/` exist yet.

The hero JSON currently ships a `flavor` string (`"KWAT DA TRA!"`) but no
long-form description; the AC calls for a "portrait + description". There
is no real art pipeline yet — portrait is the sprite path from the JSON,
description is sourced from `flavor`. No new data fields are added in this
issue — keeps #18 a pure UI/state scaffold.

## Branch
`feat/18-hero-create`

## Approach

### 1. Types — `Hero` (roster entry)
Add `Hero` to `src/types/index.ts`: a minimal roster record (not a re-export
of `HeroDef`, which describes the data definition — a *roster* entry is the
player's instance):

```ts
export interface Hero {
  id: string;          // uuid (crypto.randomUUID)
  name: string;        // player-entered, validated
  bloodline: string;   // e.g. "mougg-r"
  heroDefId: string;   // foreign key into hero JSON (e.g. "mougg-r-hero")
  createdAt: number;   // Date.now()
}
```

### 2. metaStore — roster slice + persist (add-only)
New file `src/state/metaStore.ts`, Zustand v5 with `persist` middleware
(already in the dep tree — no new deps).

```
interface MetaState {
  roster: Hero[];
  activeHeroId: string | null;
  addHero(hero: Hero): void;          // append; sets activeHeroId if unset
  setActiveHero(id: string | null): void;
  reset(): void;                       // clears roster + activeHeroId
}
```

- `persist` options: `name: 'umie-crusade-meta'`, default storage
  (localStorage via `createJSONStorage`).
- `reset()` exists for tests (mirrors `gameStore.reset`).
- No magic numbers here; `MAX_HERO_NAME_LENGTH` lives in a single constants
  module so both the store validator and the form use the same value (see §4).

### 3. "Begin run" signal (cross-system)
Scope note in the task says: "emit/dispatch a signal that Phaser can
subscribe to". We ship a minimal signal module in
`src/state/runSignal.ts` built on the existing `SimpleEventEmitter` in
`src/game/components/EventEmitter.ts` — matches the codebase's existing
event pattern and is already jsdom-safe.

```
// runSignal.ts
export const RUN_EVENTS = { BEGIN: 'run:begin' } as const;
export const runSignal = new SimpleEventEmitter();
export interface BeginRunPayload { heroId: string; }
```

The page calls `runSignal.emit(RUN_EVENTS.BEGIN, { heroId })` after adding
the hero and setting it active. Phaser-side subscription wiring (actual
scene change) is explicitly **out of scope** for #18 — handled when the
Game scene is stood up.

### 4. Atomic decomposition — only what #18 needs
`src/ui/` currently has no atoms for form inputs. Add just the two we need:

- `src/ui/atoms/Button.tsx` — primary/ghost variants, `type` prop,
  `disabled` prop. Tap target ≥44px via `min-h-[44px]`.
- `src/ui/atoms/TextInput.tsx` — controlled, with `label`, `error`,
  `maxLength`, `placeholder`. `min-h-[44px]` for touch.

Then one molecule and one organism:

- `src/ui/molecules/BloodlineCard.tsx` — portrait (sprite path) + name +
  description (from `HeroDef.flavor`) + selected state. Single-option in
  M1, but card shape scales to the full picker later.
- `src/ui/organisms/HeroCreateForm.tsx` — composes `BloodlineCard` +
  `TextInput` + `Button`. Owns form state (name, selected bloodline),
  runs validation, calls the `onSubmit({ name, heroDef })` prop.

Page:
- `src/ui/pages/HeroCreate.tsx` — page-level layout; loads
  `mougg-r.json`, wires the form's `onSubmit` to (a) generate id, (b)
  `addHero` + `setActiveHero`, (c) `runSignal.emit(...)`.

Shared constants:
- `src/ui/pages/heroCreate.constants.ts` (co-located with the page) —
  `MAX_HERO_NAME_LENGTH = 20`, `NAME_PATTERN = /^[A-Za-z']+$/`. These are
  **UI validation constants**, not balance numbers, so JSON isn't the
  right home. Keeping them in one module satisfies the "never a magic
  number" spirit (single source of truth, reused by store + form + tests).

### 5. Form validation rules
- Non-empty after `.trim()`.
- ≤ `MAX_HERO_NAME_LENGTH` (20) chars.
- Matches `NAME_PATTERN` (`/^[A-Za-z']+$/`) — letters + apostrophe,
  orcish-friendly ("Mougg'r", "Krog'nak").
- Begin button disabled unless valid; error text shown inline on blur
  or submit attempt.

### 6. Wiring into `App.tsx` (minimal)
Keep the change additive. `App.tsx` currently renders `<GameLayout />`
unconditionally. We add a tiny `useMetaStore`-driven switch:
- If no `activeHeroId`, render `<HeroCreate />`.
- Else render `<GameLayout />`.

This is the smallest possible "transitions to Phaser Game scene" shim
that actually works end-to-end — it satisfies the AC without touching
Phaser's scene graph.

## Files

New:
- `src/state/metaStore.ts`
- `src/state/runSignal.ts`
- `src/ui/atoms/Button.tsx`
- `src/ui/atoms/TextInput.tsx`
- `src/ui/molecules/BloodlineCard.tsx`
- `src/ui/organisms/HeroCreateForm.tsx`
- `src/ui/pages/HeroCreate.tsx`
- `src/ui/pages/heroCreate.constants.ts`
- `tests/state/metaStore.test.ts`
- `tests/state/runSignal.test.ts`
- `tests/ui/organisms/HeroCreateForm.test.tsx`
- `docs/plans/PLAN-18-hero-create.md` (this file)

Touched (add-only):
- `src/types/index.ts` — append `Hero` interface.
- `src/App.tsx` — switch on `activeHeroId`.

## Test strategy

All Vitest + Testing Library under jsdom (already configured in
`vitest.config.ts`).

### `tests/state/metaStore.test.ts`
- Isolate localStorage per test via `beforeEach(() => localStorage.clear())`
  and `useMetaStore.getState().reset()`.
- `addHero` appends and sets `activeHeroId` first time only.
- `setActiveHero(null)` clears active.
- `reset` wipes roster + active.
- Persistence: after `addHero`, a new store instance re-hydrates with the
  hero (verify by reading `localStorage.getItem('umie-crusade-meta')`).

### `tests/state/runSignal.test.ts`
- Subscribe to `RUN_EVENTS.BEGIN`, emit, assert payload delivered.
- Unsubscribe, emit, assert no call.

### `tests/ui/organisms/HeroCreateForm.test.tsx`
- Renders title + bloodline card + name input + Begin button from `t(...)`
  keys (asserts the correct English strings land in the DOM, which is the
  practical check that i18n is wired).
- Begin disabled when name empty.
- Begin disabled with whitespace-only name.
- Begin disabled when name > 20 chars.
- Begin disabled when name has invalid chars (digits, spaces).
- Valid name ("Mougg'r") enables Begin; submitting calls `onSubmit` with
  `{ name: "Mougg'r", heroDef }`.
- Error text visible after submit attempt with invalid name.

## Verification
- `pnpm typecheck` — clean
- `pnpm lint` — clean (new files follow style)
- `pnpm test -- --run` — new + existing tests green
- `pnpm validate:data` — unchanged behaviour (no JSON edits)

## Decisions

- **Signal mechanism: `SimpleEventEmitter` in a module singleton.** Rationale:
  the codebase already ships `SimpleEventEmitter` (used by components) and
  it is jsdom-safe — no need to pull in Phaser or invent a new bus. A
  zustand action felt coupled (begin-run isn't really meta *state*), and
  "scene messaging" can't be wired without a running scene. A plain emitter
  matches the orchestrator note "emit/dispatch a signal that Phaser can
  subscribe to".

- **"Hero" type is a new roster record, not `HeroDef`.** `HeroDef` describes
  the static JSON definition (stats, sprite, ability). A *roster* entry is
  the player's instance — it needs an id, the player's chosen name, and a
  foreign key to the def. Separating them now avoids baking the full def
  into localStorage (and will make the future picker trivial: many defs,
  many roster entries).

- **Description source: `flavor` field on the hero JSON.** The JSON has no
  `description` field. Adding one would expand #12's schema surface for a
  single line of copy that already exists in `flavor`. If a longer bio is
  wanted later, a schema+data update can add `description` — explicitly
  out of scope here.

- **Portrait source: `sprite` path as `<img src>`.** No real asset ships
  yet; the JSON references `orcs/mougg-r-hero.png`. The card renders the
  path; missing-asset behaviour (broken image icon) is acceptable for the
  scaffold and gets fixed when art lands.

- **UI validation constants live in `src/ui/pages/heroCreate.constants.ts`,
  not in `src/data/`.** The "data-driven" rule targets balance / unit /
  wave numbers; form validation rules (max name length, allowed chars)
  are UI policy. Keeping them in a single module satisfies the
  single-source-of-truth intent without shoving UX rules into the game
  data tree.

- **String keys used:** `hero.create.title`, `hero.create.bloodlineLabel`,
  `hero.create.nameLabel`, `hero.create.namePlaceholder`,
  `hero.create.beginButton` — all present from #4. No new strings are
  added in this issue; validation error messages use a single inline
  fallback (not localized) rather than expanding the string bundle for a
  scaffold milestone. A follow-up issue can localize errors.

- **Mobile verification: deferred.** Per orchestrator note, I cannot run
  a browser. All components use Tailwind mobile-first defaults
  (single-column layout, full-width controls, `min-h-[44px]` tap targets).
  Flagging "375px visual verification" as a deferred human-review item
  rather than bailing on the issue.

- **`App.tsx` switch on `activeHeroId`.** Simplest possible wiring that
  makes "Begin transitions to the Phaser Game scene" observable end-to-end.
  When a proper router or Phaser-side scene manager arrives, this two-line
  switch is trivial to replace.

- **No new npm deps.** Zustand v5 already supports `persist` from its
  `zustand/middleware` entry — no additions to `package.json`.
