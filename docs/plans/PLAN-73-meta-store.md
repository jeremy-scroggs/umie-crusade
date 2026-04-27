# PLAN-73 — expand metaStore (lifetime stats + roster + saveVersion)

## Context

Issue #73 expands the existing `metaStore` (Zustand `persist`) with three
lifetime/meta accumulators and a forward-compatibility version field:

- `lifetimeBludgelt: number` — total gold/bludgelt earned across all runs.
- `highestWaveReached: number` — best `wave` index ever cleared/reached.
- `hedknahPile: number` — already present (lifetime skull tally). We keep
  the slice and its existing actions intact; the issue notes it explicitly
  as the LIFETIME accumulator, with the per-run skull counter staying in
  `gameStore`.
- `heroRoster: Hero[]` — the issue's name for the current `roster` field.
  Per AC the field is *new* (`heroRoster`), so we add it as the canonical
  name and keep `roster` as a *deprecated alias getter* would be over-scope;
  instead, since two callsites already read `roster`/`addHero`, we **rename**
  `roster` -> `heroRoster` and migrate the existing in-app callers (small,
  internal). The `addHero` / `setActiveHero` actions stay; they now read &
  write `heroRoster`.

  *Decision recorded below.*

- `saveVersion: number` — starts at `1`. Defined ONCE as a typed module
  constant (`SAVE_VERSION`). `persist`'s `version` option is also wired to
  the same constant so future migrations have a single source of truth.

The persisted localStorage key (`umie-crusade-meta`) and middleware shape
stay unchanged — additive expansion. No new npm deps. The `hedknahPile`
issue note in the brief is honored: this PR does NOT touch the per-run
skull counter in `gameStore`.

## Branch

`feat/73-meta-store`

## Approach

1. **Constants.** Add `SAVE_VERSION = 1` (typed `as const`) at the top of
   `metaStore.ts`. Used both as the persisted `state.saveVersion` initial
   value and the `persist({ version })` option.

2. **State shape (additive).**
   - Add `lifetimeBludgelt: number` (default `0`) + action
     `addLifetimeBludgelt(amount: number)` — accumulator that ignores
     `<= 0` (matches the existing `addToHedknahPile` guard pattern).
   - Add `highestWaveReached: number` (default `0`) + action
     `updateHighestWave(wave: number)` — max-update (only writes when
     `wave > current`).
   - Add `saveVersion: number` (default `SAVE_VERSION`).
   - Rename `roster` -> `heroRoster` and add a removal action
     `removeHero(id: string)` (AC mentions "add/remove actions"). When the
     removed hero is the active one, `activeHeroId` is cleared to `null`.

3. **Persistence.**
   - All four new fields live alongside existing ones inside the persist
     payload (no `partialize` is currently used; we keep it that way —
     the persisted state object simply gains the new keys).
   - `version: SAVE_VERSION` passed to `persist` so future schema bumps
     can supply a `migrate` fn.
   - `INITIAL_STATE` extended with the new run-meta defaults that
     `reset()` should clear: `heroRoster`, `activeHeroId`. Lifetime
     accumulators (`lifetimeBludgelt`, `highestWaveReached`,
     `hedknahPile`) are deliberately EXCLUDED from `reset()` — they are
     meta-progression, like `hedknahPile` already is. `saveVersion` is
     also excluded from `reset()` (a roster wipe is not a save format
     downgrade).

4. **Caller migration.** Three callsites read `roster`/`addHero` today:
   - `src/ui/pages/HeroCreate.tsx` — only uses `addHero` and
     `setActiveHero`. No change needed (action names unchanged).
   - `src/App.tsx` — reads `activeHeroId`. No change needed.
   - `tests/state/metaStore.test.ts` — reads `state.roster` directly.
     Update to `state.heroRoster`. Also extends with new slice tests.
   Verified via grep: no other source/test reads `state.roster`.

5. **Tests.** Extend `tests/state/metaStore.test.ts` with describe blocks:
   - `lifetimeBludgelt slice` — starts 0, accumulates, ignores
     non-positive, persists to localStorage, rehydrates, survives
     `reset()`.
   - `highestWaveReached slice` — starts 0, max-update only writes when
     greater, equal/lower no-op, persists, rehydrates, survives
     `reset()`.
   - `heroRoster (rename + remove)` — existing roster tests updated to
     `heroRoster`; new test for `removeHero(id)` + active-hero clearing.
   - `saveVersion` — starts at `1`, persisted under the same key,
     persist-middleware `version` matches.

## Files

Order of edits:

1. `src/state/metaStore.ts` — extend store (additive + rename).
2. `tests/state/metaStore.test.ts` — extend tests + rename `roster` ->
   `heroRoster` references.
3. `src/ui/pages/HeroCreate.tsx` — no change (uses actions only).
4. `src/App.tsx` — no change (uses `activeHeroId`).
5. `src/ui/pages/RunSummary.tsx` — no change (uses `addToHedknahPile`).

## Test strategy

- Vitest: `tests/state/metaStore.test.ts` covers all four AC fields and
  their persistence/rehydration behavior.
- Existing tests for `roster` rename to `heroRoster`; behavioral tests
  unchanged.
- No new test files — keeping all metaStore behavior in one file (matches
  the existing project convention).

## Verification

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test -- --run
pnpm validate:data
```

All four must pass.

## Decisions

1. **Field rename `roster` -> `heroRoster`.** AC explicitly names the
   field `heroRoster`. Two in-app callers don't read `state.roster`
   directly (only the actions), so the rename is internal-only and a
   one-line edit in tests. We do NOT keep a deprecated alias — Zustand
   doesn't offer a clean alias mechanism without `partialize`/getter
   tricks, and the brief permits a conservative, documented choice.

2. **`removeHero(id)` semantics.** When the removed hero is currently
   active, `activeHeroId` is cleared to `null` rather than rolled to the
   next entry. The hero-picker (#74) is the right place for "auto-pick
   next" UX; the store stays minimal.

3. **`SAVE_VERSION = 1`.** A single typed constant feeds both the field
   default and the `persist({ version })` option. No JSON file (this is
   not balance — it's the save-format version, mirroring the
   `gameStore` `TIME_SCALES` "single source of truth" precedent in the
   #54 plan).

4. **Lifetime accumulators excluded from `reset()`.** Mirrors the
   existing `hedknahPile` policy: meta-progression survives a roster
   wipe. `resetHedknahPile` already exists as the test escape hatch;
   we do NOT add per-field `reset*` helpers for the new lifetime fields
   — the persist middleware + `localStorage.clear()` is enough for
   tests, and adding three more public actions for "test-only" use is
   API noise. (`beforeEach` in the test file calls `localStorage.clear()`
   already.)

5. **No `partialize`.** Persisting the full state (minus actions, which
   Zustand auto-skips) keeps the rehydration path simple. `saveVersion`
   is a regular field; if a future migration needs to drop it from the
   persisted payload it can add a `partialize` then.

6. **No new files.** All work is additive to two existing files
   (`metaStore.ts`, `metaStore.test.ts`).
