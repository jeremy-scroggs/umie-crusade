# PLAN-26 — Wire M1 systems into GameScene for browser playtest

## Context

M1 is feature-complete (8 systems + entities + UI organisms + 305 unit/integration
tests). The smoke test in `tests/integration/m1-smoke.test.ts` exercises the
whole compose-graph against `m1-slice.json`, but **no live Phaser scene mounts
those systems**. `GameScene.ts` is still the M0 placeholder ("click adds 10
gold"). This issue (#26) is the assembly job: load the real map, instantiate
the systems against a shared bus, mount the React HUD/BuildPanel overlay, and
route hero-create → game → win/lose pages.

Manual playtest at 375px is **human-deferred** (we can't open a browser
here); the goal is to ship a code-correct wiring that the human can drive in a
browser to validate.

## Branch

`feat/26-scene-wiring`

## Approach

### 1. Scene-bootstrap factory

Move the wiring graph out of `GameScene.create()` and into a pure factory
`src/game/scenes/scene-bootstrap.ts`. Mirrors the smoke test's `buildHarness`
shape so the scene is "wire systems, then drive update()" with no business
logic in the scene class itself. Keeping it as a stand-alone module makes it
trivially unit-testable in jsdom (no Phaser canvas) and avoids regressing the
already-vetted compose-graph.

Factory signature:

```ts
createSceneBootstrap({ emitter, store, ...overrides }): SceneBootstrap
```

* `store`: an `EconomyStoreLike & BuildingStoreLike` (the live Zustand store
  via `getGameStore()` satisfies both shapes — `gold`, `addGold`,
  `spendGold`).
* `emitter`: a shared `SimpleEventEmitter`.
* All balance numbers come from validated JSON defs already imported by
  the smoke test — no new magic numbers.
* `aggroRadius`, `secondsPerMeleeAttack`: same values as the smoke test
  (`8 * pathfinding.tileWidth`, `0.5`). These are structural-defaults, not
  balance, until the unit-def schema gains aggro / cadence (#9 note).

### 2. GameScene rewrite

* Load `'m1-slice'` (already preloaded in `PreloadScene`).
* Construct the scene-bootstrap, hold it on `this.systems`.
* `update(_, delta)`: call `ai.update`, `damage.update`, `wave.update`,
  `economy.update` with `dt = delta / 1000`. Same drive order as the smoke
  test.
* `wave.start()` is called once in `create()` after the systems are wired.
* Hook Phaser pointer events to the `InputSystem`. Translate
  `Phaser.Input.Pointer` → `PointerLike { pointerId, x, y, button, type }`.
  `hitTest` uses `pointer.worldX/worldY → cell` math via
  `pathfinding.tileWidth/tileHeight` and emits `{ kind: 'tile', x, y }`
  when in-bounds, else `null`.
* The InputSystem already emits `select:tile`/etc. on the bus; the scene
  also subscribes to `select:tile` and writes `gameStore.setSelectedTile`
  so the BuildPanel reacts.
* The scene listens for `wave:start` and calls
  `gameStore.triggerWaveStart(Date.now())` so the HUD's "ISE HAI!" banner
  fires.
* The scene listens for `wave:complete` for future hud bookkeeping.
* Remove the M0 "click adds 10 gold" handler.

### 3. App.tsx + GameLayout extension

* HeroCreate flow: keep existing — when `activeHeroId` is null, render
  `<HeroCreate />`. The existing `runSignal.emit(BEGIN, { heroId })` is the
  contract; `App.tsx` already routes by `runStatus` after the hero is
  saved.
* Win/lose: existing `runStatus` routing already mounts RunSummary /
  GameOver — no change needed in `App.tsx`.
* Replay flow: existing — RunSummary/GameOver already call `gameStore.reset()`
  which flips `runStatus` back to `'running'`. The scene relies on
  PhaserGame mount/unmount for a clean restart (see "Scene reset" below).
* `GameLayout` mounts the `BuildPanel` alongside the `HUD`. The panel's
  `onConfirmBuild` calls `BuildingSystem.tryPlaceWall` and
  `onConfirmRepair` calls `tryRepairWall` via a tiny `gameBridge` module
  (mirrors `state/bridge.ts`'s pattern).

### 4. runSignal → Phaser scene start

* PreloadScene currently auto-starts Game. We keep that — the React
  HeroCreate page only renders when `activeHeroId` is null, and once the
  hero is created `App.tsx` swaps to `<GameLayout />` which mounts
  `<PhaserGame />` for the first time. So Phaser boots fresh AFTER the
  hero is created. This means we don't need a runSignal listener inside
  Phaser — the React-level mount IS the trigger.
* For Replay: `gameStore.reset()` flips `runStatus` to `'running'` AND
  clears selection. App.tsx swaps from RunSummary back to `<GameLayout />`,
  which unmounts and remounts `<PhaserGame />` (the existing PhaserGame
  cleanup destroys the game on unmount and creates a new one on mount).
  This naturally restarts the scene — no extra wiring needed for replay.

### 5. Scene reset on replay (no extra work)

The existing `<PhaserGame />` component creates a new `Phaser.Game` on
mount and destroys it on unmount. Because the `<GameLayout />` is
unmounted when `runStatus` is `'won'` or `'lost'` (App.tsx routes to
RunSummary/GameOver), the Phaser game is destroyed. When the player
clicks Replay, `reset()` flips runStatus back to `'running'`, App.tsx
re-renders `<GameLayout />`, and `<PhaserGame />` mounts a fresh game.
So replay is "free" — no reset() call needed inside the scene.

## Files

### New

* `src/game/scenes/scene-bootstrap.ts` — factory + types.
* `src/game/scenes/gameBridge.ts` — module-level holder for the active
  SceneBootstrap (set by scene, read by GameLayout's BuildPanel callbacks).
  Tiny — single ref get/set, mirrors `state/bridge.ts`.
* `tests/game/scenes/scene-bootstrap.test.ts` — one smoke test: factory
  composes against m1-slice without throwing, exposes all 8 systems +
  fortCore + edges, `wave.start()` then a few `update()` ticks emits
  `wave:start`. No scene-level Phaser test (manual playtest covers that).

### Modified

* `src/game/scenes/GameScene.ts` — full rewrite (drop M0 placeholder).
* `src/ui/templates/GameLayout.tsx` — mount `<BuildPanel />` next to HUD.
* (No `App.tsx` change — existing routing already handles
  hero-create / win / lose.)

### Untouched

* `src/state/gameStore.ts` — already has every slice we need.
* `src/state/runSignal.ts` — contract already there.
* `src/game/PhaserGame.tsx` — natural mount/unmount handles replay.
* `src/game/scenes/PreloadScene.ts` — `m1-slice` already loaded; we drop
  the Boot → Preload → Game chain unchanged.
* All 8 system files, all entities, all UI organisms.

## Test strategy

Per agent rules: minimal. Existing 305 tests must pass. Add ONE
scene-bootstrap factory test that:

* Imports the factory + an emitter, constructs against `m1-slice.json`
  with a fake store (same `FakeStore` shape as the smoke test).
* Asserts every system is non-null + `fortCore.cell` matches the m1
  fort-core cell.
* Calls `wave.start()`, advances `update(0.05)`, asserts a single
  `wave:start` event was emitted with `waveNumber === 1`.

We do NOT comprehensively test live Phaser scene behaviour; manual
playtest covers that.

## Verification

* `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm validate:data`
  — must be green.
* **Manual playtest at 375px is human-deferred.** A human will:
  * Open `pnpm dev`, see HeroCreate.
  * Submit hero name → game canvas appears with HUD on top.
  * Tap an empty plain tile → BuildPanel slides up with Wall + Ballista.
  * Tap a wall placement → gold debits.
  * Wait through 5 waves → RunSummary appears with skulls / gold.
  * Tap Replay → fresh run.
* Document this deferral in the validate step (issue #26 will close on
  code review + green gate, with a follow-up "playtest m1" task tracked
  separately if needed).

## Decisions

1. **No runSignal listener in Phaser.** Mount/unmount of `<PhaserGame />`
   driven by React routing is the trigger; replay is free. Keeps the scene
   single-responsibility.
2. **scene-bootstrap as a factory, not a class.** The smoke test already
   pioneered this shape. A factory keeps the scene file thin and makes
   the wiring trivially testable in jsdom.
3. **gameBridge for SceneBootstrap ref.** Mirrors `state/bridge.ts`'s
   pattern: a tiny module-scoped getter/setter avoids passing system
   refs through React props, keeps GameLayout dumb, and matches existing
   "bridge" idiom. Alternative (events on runSignal for build commands)
   would invert control needlessly — BuildPanel reads/writes selection
   slices already; calling tryPlaceWall directly is the cleanest.
4. **Fort-core HP placeholder.** No fort-core def exists yet (#11/#13/#14
   used wall-wood as stand-in for the smoke). The bootstrap factory takes
   `fortHp` as a ctor option (default 5000 — same as the smoke test) so a
   future fort-core def (M2) drops in cleanly. This is "config, not
   balance" pattern — same as `aggroRadius` / `secondsPerMeleeAttack`.

## Manual-playtest deferral

Per issue #26 acceptance: "Manual playtest at 375px is HUMAN-deferred."
This plan ships a code-correct wiring that the human will validate in a
browser. The 305 tests + the new bootstrap test give us a strong
green-gate signal that the wiring graph is sound; the playtest closes
out the actual feel of the slice.
