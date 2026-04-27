# PLAN-54 — timeScale slice + pause/1x/2x/4x

## Context

Issue #54 introduces a `timeScale` slice on `gameStore` so the player can
pause / 1x / 2x / 4x the simulation. This issue covers the *state slice
plus system plumbing*; the HUD widget that exposes the buttons is a
separate U4 issue (#76) that consumes whatever this PR ships.

The simulation today runs through four scene-owned `update(dt)` loops
in `GameScene.update`:

1. `AISystem.update(dt)` — tile-grid FSMs (humans + orcs).
2. `DamageSystem.update(dt)` — projectile motion, tower cooldowns,
   pending death linger.
3. `WaveSystem.update(dt)` — spawn timers + wave-complete detection.
4. `EconomySystem.update(dt)` — respawn timers.

Phaser-built-in timers (none used today, but `this.time.delayedCall`
is a future seam) are governed by `scene.time.timeScale`. Phaser
arcade physics is NOT enabled in this project (no
`scene.physics` imports outside type comments — no work needed there).

The `SpriteBinder.tick()` is a pure render-side reader (no `dt`
accumulator) so it stays untouched.

## Branch

`feat/54-time-scale`

## Approach

1. **Single source of truth — gameStore slice.**
   - Add `timeScale: TimeScale` (literal `0 | 1 | 2 | 4`) plus
     `setTimeScale(n)` action. Reset returns to `1`.
   - Define a `TIME_SCALES` const tuple `[0, 1, 2, 4] as const` exported
     from `gameStore.ts`. Both the type and the validator (`isTimeScale`)
     derive from this single tuple — no magic numbers anywhere else.
   - `setTimeScale` rejects (no-op, dev warning) any value not in
     the tuple, preserving previous state.

2. **Scene reads gameStore + applies to Phaser.**
   - In `GameScene.create`, read the current `timeScale` and assign it
     to `this.time.timeScale`.
   - Subscribe to the store (via `useGameStore.subscribe`) for
     subsequent changes; on each change, mirror into `this.time.timeScale`.
   - `physics.world.timeScale` is NOT touched — physics is unused.
   - The subscription is unsubscribed in `teardown()` so a scene shutdown
     leaves no dangling listener.

3. **Systems multiply `dt` once at the top of `update`.**
   - `GameScene.update(_, delta)` is the SINGLE point that applies the
     `timeScale` multiplier. Every system reads the same `dt` (already
     scaled). This keeps each system pure (no store coupling) and
     guarantees no system can drift if a future call site uses raw
     `dt`. Document the invariant in `GameScene.update`.
   - When `timeScale === 0`, scaled `dt === 0`, which all four systems
     already handle correctly: `AI.tickHuman` decrements cooldowns by
     `0`; `Damage.tickProjectiles` advances projectiles by `0`; `Wave`
     advances `elapsed` by `0`; `Economy` advances respawn timers by
     `0`. Pause ≡ frozen sim.
   - The `getGameStore()` read happens once per frame — a cheap `getState()`
     call against Zustand.

4. **Tests.**
   - Extend `tests/state/gameStore.test.ts` with a `timeScale slice`
     describe block: starts at 1, `setTimeScale(0|1|2|4)` accepted,
     invalid values rejected, reset returns to 1.
   - Add `tests/state/timeScale.test.ts` (new file) that exercises the
     scaling math: builds a small fake "system" with a `dt` accumulator,
     drives it through `GameScene`-style scaled ticks, and asserts the
     accumulator advances by `dt * timeScale`. This is unit-level — no
     Phaser scene needed; it directly multiplies `dt` the way
     `GameScene.update` does.

## Files

Order of edits:

1. `src/state/gameStore.ts` — add `TIME_SCALES`, `TimeScale`,
   `isTimeScale`, `timeScale` field, `setTimeScale`, default `1`,
   reset includes `timeScale: 1`. Export the tuple/type.
2. `src/state/index.ts` — does not exist (no barrel). Skip.
3. `src/game/scenes/GameScene.ts` — read + subscribe to `timeScale`,
   apply `this.time.timeScale`, scale `dt` in `update`, unsubscribe
   in `teardown`.
4. `tests/state/gameStore.test.ts` — extend with `timeScale slice`
   describe; verify reset.
5. `tests/state/timeScale.test.ts` — new file, scaling math.

No system files (`AI.ts`, `Damage.ts`, `Wave.ts`, `Economy.ts`) need
changes — they receive scaled `dt` from the scene. This was the key
design call (see Decisions).

## Test strategy

- Vitest: `tests/state/gameStore.test.ts` — slice CRUD + reset.
- Vitest: `tests/state/timeScale.test.ts` — multiplier math at
  `0 / 1 / 2 / 4` and a "pause then resume" sequence.
- Manual verification of Phaser wiring is out of scope (no harness for
  `scene.time.timeScale`); we rely on TS types + the smoke test in
  GameScene staying compilable.

## Verification

Run from repo root after implementation:

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test -- --run
pnpm validate:data
```

All four must be green.

## Decisions

1. **Single multiply site.** Rather than thread `timeScale` into every
   `*.update(dt)` signature (or have each system read the store), the
   scene multiplies once at the top of `GameScene.update`. Pros:
   - Zero coupling between systems and the gameStore (systems remain
     unit-testable in jsdom with no bridge).
   - One place to audit if scaling behavior changes.
   - Mirrors how `scene.time.timeScale` works for Phaser timers — the
     scene is the policy holder.
   Cons: a future system that schedules its own off-tick callbacks
   (e.g. a `setTimeout`-style timer) would need to know about
   `timeScale` itself. None today; revisit if/when one appears.

2. **Valid set: `0 | 1 | 2 | 4`.** Defined ONCE as `TIME_SCALES`
   in `gameStore.ts`. The literal type is derived from the tuple.
   Both `setTimeScale` runtime checks and TypeScript's static checks
   reference the same source. No JSON file is used: this is gameplay
   policy (UI options), not balance numbers — see the CLAUDE.md
   guidance the worker brief calls out explicitly.

3. **Reset semantics.** `reset()` returns `timeScale` to `1`. A run
   restart should not preserve a paused-state from the previous run.

4. **Phaser physics.** Not enabled in this project — no
   `physics.world.timeScale` wiring needed. AC reads "if used"; we
   document its absence in a code comment so a future enable-physics
   PR remembers to mirror.

5. **Subscription idempotency.** `useGameStore.subscribe(fn)` returns
   an unsubscribe handle; we store it on the scene and call it from
   `teardown` so SHUTDOWN/DESTROY both fire cleanly across replays.
