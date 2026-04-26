# PLAN-20 — Win / Lose screens (RunSummary + GameOver)

## Context

Issue #20 is the M1 run-end UX. When the wave system declares the run won
(wave 5 cleared) or lost (fort destroyed) — events `run:won` / `run:lost`
defined in #10 — the React overlay must show a full-screen result page
with run stats and replay / main-menu actions.

Upstream pieces already on main:
- `src/state/gameStore.ts` (#13/#17) — owns run-scoped state: `gold`,
  `wave`, `lives`, `skulls`, `heroHp`, plus a `reset()` that returns the
  store to the initial run state. There is **no** `runStatus` slice yet.
- `src/state/metaStore.ts` (#18) — Zustand `persist` + roster. Persists
  to localStorage under `umie-crusade-meta`. We need to extend it with a
  cross-run "Hedk'nah Pile" skull accumulator (also persisted).
- `src/state/runSignal.ts` (#18) — `SimpleEventEmitter` singleton with a
  `RUN_EVENTS.BEGIN` constant. We add `MAIN_MENU` to the same module so
  both navigation signals live next to each other.
- `src/data/strings/en.json` + `src/data/schemas/strings.schema.ts` (#4)
  already ship `battle.victory = "Bludchok-hai gug!"` and `battle.defeat`
  / `battle.defeatCreed`. The defeat creed in #4 is "Bloodrock nub kneel.
  Bludchok rise again." — issue #20 specifies the screen copy as the
  shorter creed line **"Nub goth. Nub pulga. Hedk'nah."** (a different
  line from the same lore set). We add new keys for the win/lose screens
  rather than overwriting the existing battle banner keys (additive only;
  shared file).
- `src/ui/atoms/Button.tsx` (#18) — primary/ghost variants; ≥44px tap
  target. Reused for Replay + Main Menu.
- `src/ui/pages/HeroCreate.tsx` (#18) — page pattern: page = full-screen
  scaffold, an organism owns the content. Same pattern here.
- `src/ui/organisms/HUD.tsx` (#17) — pattern for subscribing to gameStore
  via cheap selectors and using `useGameStore.getState().reset()` in
  tests.

Wave-system emitter wiring (#10) writes `runStatus` directly via the new
store actions — the actual `run:won` / `run:lost` event listener is a
follow-up integration concern, called out in the orchestrator notes.

## Branch
`feat/20-win-lose`

## Approach

### 1. gameStore — `runStatus` slice (additive)

Add to `gameStore.ts`:

```ts
type RunStatus = 'running' | 'won' | 'lost';
// state: runStatus: RunStatus  (initial 'running')
// actions: setRunStatus(s), winRun(), loseRun()
```

`reset()` already exists and returns the store to `INITIAL_STATE`; we
extend `INITIAL_STATE` with `runStatus: 'running'` so a single `reset()`
call also returns the run to the running state (this is what "Replay"
calls — see §4).

`winRun()` / `loseRun()` are convenience setters used by the wave system
(when #10 wires `run:won` / `run:lost` listeners) and by tests. They also
trigger the metaStore Hedk'nah Pile commit — but to keep gameStore free
of cross-store coupling, the **page** (RunSummary) commits skulls into
the meta pile in a `useEffect` on mount when `runStatus === 'won'`.

### 2. metaStore — Hedk'nah Pile slice (additive, persisted)

Extend `MetaState` with:

```ts
hedknahPile: number;            // total skulls across all runs
addToHedknahPile(count: number): void;   // sums; ignores ≤0
resetHedknahPile(): void;       // for tests
```

`addToHedknahPile` clamps negatives to 0 to avoid caller bugs. The
existing `reset()` action wipes roster + active hero **but not** the
pile — that matches the "persist across runs" intent (orchestrator note
"Hedk'nah Pile slice (skulls accumulator persisted to localStorage)").
We add a separate `resetHedknahPile()` purely for test isolation.

Persist middleware already wraps the store under `umie-crusade-meta` —
new field is automatically persisted. No new deps; backwards-compatible
hydrate (zustand fills missing keys from initial state).

### 3. Pages — `RunSummary` (win) + `GameOver` (lose)

New files:
- `src/ui/pages/RunSummary.tsx` — win screen.
- `src/ui/pages/GameOver.tsx` — lose screen.

Both share the same skeleton:
- Title (large, centered, themed)
- Stats list (Wave reached, Skulls taken, Gold earned)
- Two buttons stacked vertically: Replay (primary) + Main Menu (ghost)
- Mobile-first: full-screen container, single-column, max-w-md, padding,
  44px tap targets via the existing `Button` atom.

Stats are read from `useGameStore` selectors (`wave`, `skulls`, `gold`)
**at mount** (not live) — once the page is up, the run is over, but the
selectors keep the page reactive to a future architectural change.

`RunSummary` additionally calls `useMetaStore.getState().addToHedknahPile(skulls)`
in a `useEffect` that runs **once on mount** — guard with a ref to avoid
double-commit under React StrictMode (which double-invokes effects in
dev). Pattern:

```ts
const committedRef = useRef(false);
useEffect(() => {
  if (committedRef.current) return;
  committedRef.current = true;
  if (skulls > 0) addToHedknahPile(skulls);
}, [skulls, addToHedknahPile]);
```

### 4. Replay + Main Menu signals

- **Replay** → calls `useGameStore.getState().reset()`. With the new
  `runStatus: 'running'` initial value, the reset alone flips the page
  back to the in-game state. The actual Phaser scene reset is a
  follow-up (orchestrator note: "details of resetting Phaser scene are
  deferred. Just emit a 'reset' signal or call store reset.").
- **Main Menu** → emits `runSignal.emit(RUN_EVENTS.MAIN_MENU)`. Same
  contract as `RUN_EVENTS.BEGIN` from #18: signal only, the Phaser-side
  subscriber is wired separately. We also call gameStore `reset()` so
  the next run starts clean.

Add to `runSignal.ts` (additive — same module):

```ts
export const RUN_EVENTS = {
  BEGIN: 'run:begin',
  MAIN_MENU: 'run:mainMenu',
} as const;
```

### 5. App.tsx — page routing on `runStatus`

`App.tsx` currently:
1. No active hero → `<HeroCreate />`
2. Else → `<GameLayout />`

Extend to:
1. No active hero → `<HeroCreate />`
2. `runStatus === 'won'` → `<RunSummary />`
3. `runStatus === 'lost'` → `<GameOver />`
4. Else → `<GameLayout />`

This is the smallest possible "transitions to win/lose screens" wiring
that satisfies the AC end-to-end. Mirrors the pattern from #18.

### 6. Strings — additive, schema-typed

New keys (added to both `en.json` and `strings.schema.ts` in the same
order — schema-first style is enforced by `pnpm validate:data`):

```
runEnd.statsWave        "Wave reached"
runEnd.statsSkulls      "Skulls taken"
runEnd.statsGold        "Gold earned"
runEnd.replay           "Klerg agen!"          (Replay — orcish)
runEnd.mainMenu         "Back to Bludchok"     (Main Menu — orcish)
winScreen.title         "Bludchok-hai gug!"    (per AC)
loseScreen.title        "Nub goth. Nub pulga. Hedk'nah." (per AC creed line)
```

We do NOT touch the existing `battle.victory` / `battle.defeat` /
`battle.defeatCreed` keys — those serve the in-battle banner from #4
and changing them would be cross-issue churn.

## Files

New:
- `src/ui/pages/RunSummary.tsx`
- `src/ui/pages/GameOver.tsx`
- `tests/ui/pages/RunSummary.test.tsx`
- `tests/ui/pages/GameOver.test.tsx`
- `docs/plans/PLAN-20-win-lose.md` (this file)

Touched (add-only):
- `src/state/gameStore.ts` — `runStatus` slice + setters; extend
  `INITIAL_STATE` so `reset()` returns to `running`.
- `src/state/metaStore.ts` — `hedknahPile` field + `addToHedknahPile` +
  `resetHedknahPile`.
- `src/state/runSignal.ts` — add `MAIN_MENU` event constant.
- `src/data/strings/en.json` — 7 new keys.
- `src/data/schemas/strings.schema.ts` — same 7 keys.
- `src/App.tsx` — branch on `runStatus`.
- `tests/state/gameStore.test.ts` — runStatus tests.
- `tests/state/metaStore.test.ts` — Hedk'nah Pile tests.

## Test strategy

Vitest + Testing Library + jsdom (existing config).

### `tests/state/gameStore.test.ts` (extend)
- `runStatus` starts as `'running'`.
- `winRun()` sets `'won'`; `loseRun()` sets `'lost'`; `setRunStatus(s)`
  sets to a given value.
- `reset()` returns `runStatus` to `'running'`.

### `tests/state/metaStore.test.ts` (extend)
- `hedknahPile` starts at 0.
- `addToHedknahPile(n)` sums; ignores 0 / negatives.
- `addToHedknahPile` value persists to localStorage under the existing
  key (verified by reading the JSON blob).
- `reset()` does NOT clear `hedknahPile` (it survives across runs).
- `resetHedknahPile()` clears it.

### `tests/ui/pages/RunSummary.test.tsx`
- Renders the AC win title "Bludchok-hai gug!".
- Shows wave / skulls / gold from `useGameStore` (seed via
  `setWave/setSkulls/addGold`).
- Renders Replay + Main Menu buttons (localised labels).
- Replay click calls gameStore `reset()` (assert `runStatus` is back to
  `'running'` and gold/skulls cleared).
- Main Menu click emits `RUN_EVENTS.MAIN_MENU` on `runSignal` (subscribe
  in test, assert call count).
- On mount, commits the run's skulls into `metaStore.hedknahPile`.
- Idempotent: a second mount of the same page doesn't double-commit
  (React StrictMode double-invocation guard).

### `tests/ui/pages/GameOver.test.tsx`
- Renders the AC lose creed title "Nub goth. Nub pulga. Hedk'nah.".
- Shows wave / skulls / gold from `useGameStore`.
- Renders Replay + Main Menu buttons.
- Replay click resets gameStore.
- Main Menu click emits `RUN_EVENTS.MAIN_MENU`.
- Does NOT commit to the Hedk'nah Pile (loss → no skull tribute).

## Verification

- `pnpm typecheck` — clean
- `pnpm lint` — clean
- `pnpm test -- --run` — all green (new + existing)
- `pnpm validate:data` — strings.schema validates en.json after the
  additive keys

## Decisions

- **`runStatus` slice lives in `gameStore`, not a new store.** It is
  per-run state — same lifecycle as `gold`, `wave`, `skulls`. Adding it
  to gameStore means a single `reset()` flips everything back to a
  fresh-run state.
- **Hedk'nah Pile lives in `metaStore`, persisted.** The orchestrator
  note explicitly calls this out — meta-progression survives across
  runs, so it belongs next to the roster which already has the persist
  middleware.
- **Page routing via `App.tsx` switch statement.** Same pattern as #18's
  `activeHeroId` switch. A real router can replace this later without
  touching the pages themselves.
- **Win-screen commits skulls; lose-screen does not.** "Persist skulls
  to metaStore Hedk'nah Pile" is in the AC under the win path. A loss
  is a defeat — no tribute. Tests cover both directions.
- **StrictMode double-mount guard via ref.** React 18 StrictMode invokes
  effects twice in dev to flush bugs. Without a ref guard, RunSummary
  would double-credit the pile on every mount in dev. The ref is local
  state, doesn't pollute the store.
- **Replay just calls `gameStore.reset()`.** Per orchestrator note:
  Phaser scene reset is deferred. Resetting the store flips
  `runStatus` back to `'running'` which routes App.tsx to
  `<GameLayout />` — observable end-to-end.
- **Main Menu emits a signal; doesn't navigate.** Mirrors #18's
  `RUN_EVENTS.BEGIN` contract. Adding `MAIN_MENU` to the same constant
  block keeps the run-lifecycle vocabulary in one place.
- **String keys for win/lose are NEW, not shared with `battle.victory`
  /  `battle.defeat`.** Those serve the in-battle banner — different
  lifetime (transient) and different visual context. Issue #20 also
  specifies a different copy for lose ("Nub goth. Nub pulga. Hedk'nah.")
  than #4's `battle.defeatCreed` ("Bloodrock nub kneel. Bludchok rise
  again."), so reuse isn't possible without overwriting.
- **No new deps. No new atoms.** Only the existing `Button` atom is
  needed; stats list is a tiny inline structure. Adding a `StatList`
  molecule for two pages would be premature; if a third caller appears
  we extract.
- **Mobile verification: deferred to human review.** Per CLAUDE.md, all
  pages use mobile-first Tailwind defaults: full-width single-column,
  44px tap targets, max-w-md container, padded layout.
