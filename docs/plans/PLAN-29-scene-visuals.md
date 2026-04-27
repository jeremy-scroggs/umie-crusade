# PLAN-29 — visualize the M1 slice (sprite binding + ability wiring + skull counter)

## Context

Issue #29. The M1 vertical slice is logically complete (#1–#28) but
the live `GameScene` doesn't render any entity, doesn't credit skulls
on human kill, and the HUD's `AbilityButton.onActivate` is a stubbed
no-op. Three gaps to close:

1. **Visuals** — every entity (hero, orcs, humans, walls, ballistas,
   projectiles) needs a placeholder coloured rectangle bound to a
   Phaser scene that follows the entity's tile/world position and gets
   destroyed on death/teardown. Walls cycle pristine→cracked→crumbling
   tints.
2. **Skull counter** — `gameStore.skulls` increments on each human
   `'died'`; the HUD already reads `skulls` and the RunSummary already
   commits to `metaStore.hedknahPile` on mount, so the only missing
   piece is the wave-system → store hookup.
3. **Ability** — the HUD `AbilityButton.onActivate` callback should
   trigger `Hero.tryUseAbility` against currently-alive humans, then
   write the cooldown back into `gameStore.heroAbility`.

## Branch

`feat/29-scene-visuals` off `main` @ 97bcac2.

## Approach

### Sprite binder (`src/game/scenes/sprite-binder.ts`, new file)

A pure factory that takes the live Phaser `Scene`, the system bus
(`EventEmitterLike`), the `SceneBootstrap`, and a `tileSize` and:

- Creates a single `add.rectangle` per entity at construction (hero +
  pre-placed orcs) and per `wave.onSpawn` for humans, wall placement
  for walls, and per ballista (stub: M1 has no ballista yet — the
  binder still hooks into `BuildingSystem.buildingAt` for any tower
  placed).
- Subscribes to per-entity `'died'` events to destroy the rectangle.
- Subscribes to `wall:built` and `wall:destroyed` (per the docstring
  in `tests/integration/m1-smoke.test.ts`) to add/destroy wall
  rectangles and forwards the per-Building `'damage-state-changed'`
  event into a tint update (pristine = solid brown, cracked = darker
  brown with reduced alpha, crumbling = even darker / thinner).
- Exposes a `tick()` (called from `GameScene.update`) that copies each
  tracked entity's tile-cell position into its rectangle. Humans /
  orcs use `AISystem.humanBehavior(entity).cell` and
  `orcBehavior(entity).cell` for tile coords; the hero stays parked at
  the rally cell (M1 has no hero movement system yet — issue #16
  established the entity but no movement controller).

A separate small adapter for `Phaser.GameObjects.Rectangle` so the
binder unit-tests can swap a fake. We type the scene as a minimal
`SceneLike` subset so jsdom tests run without Phaser canvas init.

### Skull counter (in `scene-bootstrap` or new `state-bridge` glue)

Easiest path: have the sprite-binder ALSO subscribe to the per-human
`'died'` event (we already iterate on `wave.onSpawn`). When a human
dies, call `getGameStore().addSkull()`. RunSummary already wires the
Hedk'nah Pile commit on mount.

To avoid coupling the sprite-binder to the store, the cleaner approach
is: the GameScene `wave.onSpawn` was previously inside
`scene-bootstrap.ts`'s `WaveSystem` ctor. We add a
`onHumanSpawned(human)` callback option to `createSceneBootstrap` so
GameScene can subscribe to `human.emitter.on('died', ...)` and call
`store.addSkull()` from there.

Implementation choice: pass an `onHumanSpawned` option to
`createSceneBootstrap`. The default no-op preserves the existing
`scene-bootstrap.test.ts` behaviour.

### Ability dispatch chain

GameScene needs to make the HUD button able to call
`Hero.tryUseAbility(...)`. The pattern from `gameBridge` (publish a
`SceneBootstrap`) lets us add a sibling helper:

`gameBridge.tryHeroAbility(nowMs)` — looks up the active systems and:
1. Builds a `targets` array from every currently-registered, non-dead
   human (use `ai.humanBehavior` to read each tracked human's cell
   for position). Hero entity stays at `M1_RALLY_CELL` for M1.
2. Calls `hero.tryUseAbility({nowMs, position, targets})`.
3. On `{used: true}`, writes
   `store.setHeroAbilityCooldown(cooldownMs, nowMs + cooldownMs)`.

The HUD's `onActivate` then becomes
`tryHeroAbility(Date.now())` — keeping the React layer agnostic of
Phaser entities.

### Decisions & guardrails

- No new files outside the 3 plumbing files: `sprite-binder.ts`,
  `gameBridge.ts` (additive helpers only), and the existing
  `scene-bootstrap.ts` (additive option).
- Sprite tints / sizes come from `TILE_SIZE` (config) and a small
  module-local palette. The palette colours are visual placeholders
  (NOT balance), comparable to the existing
  `Projectile.DEFAULT_HIT_RADIUS` constant.
- The sprite-binder's per-frame tick is O(entities). Acceptable for
  M1 (peak ~50 humans + 6 orcs + 1 hero + handful of walls).
- Manual mobile playtest (375px) deferred to human (CLAUDE.md rule).

## Files

### New

- `src/game/scenes/sprite-binder.ts` — factory + `SpriteBinder`
  class with `tick()` + `destroy()`.
- `tests/game/scenes/sprite-binder.test.ts` — pure-function tests
  for the binder using a fake scene + bus.

### Modified

- `src/game/scenes/scene-bootstrap.ts` — add
  `onHumanSpawned(human)` callback option (additive).
- `src/game/scenes/GameScene.ts` — wire the sprite-binder, attach
  `addSkull` on each human spawn, hand the sprite-binder the hero +
  pre-placed orcs.
- `src/game/scenes/gameBridge.ts` — add `tryHeroAbility(nowMs)`
  helper.
- `src/ui/organisms/HUD.tsx` — wire `onActivate` to
  `gameBridge.tryHeroAbility(Date.now())`.
- `tests/state/gameStore.test.ts` — no change (existing tests cover
  the slice actions).

## Test strategy

Pure-function tests for sprite-binder via a fake scene exposing a
mock `add.rectangle` + a `SimpleEventEmitter`. We assert:

- A rectangle is created per entity registered + per wave spawn.
- Position updates flow on `tick()`.
- Death events destroy the rectangle.
- Wall `damage-state-changed` updates the tint.

Existing `scene-bootstrap.test.ts` extended with an
`onHumanSpawned` invocation count assertion.

A new `gameBridge.test.ts` covers `tryHeroAbility` returning a
cooldown write into a fake store.

The HUD test gets a smoke check that clicking the button calls
through to the bridge (mocked).

The 307 prior tests must stay green.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm validate:data`.
- Manual playtest at 375px viewport — DEFERRED TO HUMAN.

## Decisions

1. **Skull-counter wiring lives in `scene-bootstrap`** via a callback
   option, NOT inside the sprite-binder. Keeps the binder
   single-responsibility (visuals) and the gameStore coupling
   centralised.
2. **`tryHeroAbility(nowMs)` lives on `gameBridge`** — same pattern as
   the existing `setActiveSystems`/`getActiveSystems` accessors, lets
   the HUD stay React-only.
3. **No movement for hero in M1.** Hero stays at the rally cell
   (parity with smoke test). The sprite still renders.
4. **Placeholder rectangle palette** is a structural visual constant,
   not balance — documented inline.
5. **Wall tint listens on `'damaged'` not `'damage-state-changed'`.**
   The `damage-state-changed` event in `Breakable` only fires when
   `computeSprite()`'s sprite key changes — that ladder uses
   `>=`-threshold semantics that can settle on the lowest sprite
   while `currentDamageState()`'s 3-band ladder still reads
   `'cracked'`. Listening on every damage tick keeps the rectangle
   tint perfectly aligned with the visual band the player sees.

## Status

Landed across three commits on `feat/29-scene-visuals`:
1. Sprite-binder skeleton + entity placeholders + bootstrap callbacks.
2. Hero ability dispatch (`gameBridge.tryHeroAbility`) + skull-credit
   wiring + AISystem `allHumanBehaviors`/`allOrcBehaviors` accessors.
3. Plan doc completion marker.

Manual playtest at 375px viewport — DEFERRED TO HUMAN per CLAUDE.md.
