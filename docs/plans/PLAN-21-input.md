# PLAN-21 — Input: mobile touch + mouse gesture system

## Context

Issue #21 introduces touch-first input per PROJECT_PLAN §5.4: tap selects,
long-press inspects, drag pans the camera, pinch zooms it. Mouse and
keyboard equivalents are mapped onto the same primitives so desktop
behavior comes for free.

Upstream already merged:
- `Pathfinding` (#7), `DamageSystem` (#8), `AI` (#9), `Building` (#14):
  established the "Phaser-agnostic translator + EventEmitterLike" pattern.
  Phaser's top-level import crashes jsdom (canvas feature detection), so
  we never `import 'phaser'` from a file under test.
- `EventEmitterLike` + `SimpleEventEmitter` (`src/game/components/EventEmitter.ts`)
  — same bus we'll use to emit semantic input events.
- `GameEvents` table (`src/game/systems/events.ts`) — additive enum of
  named string constants. We append new names; never re-order.
- Test pattern: `tests/game/systems/AI.test.ts`, `Pathfinding.test.ts`,
  `Building.test.ts` — vitest + jsdom + `SimpleEventEmitter`, with
  `vi.useFakeTimers()` for time-based behavior. We follow that pattern.

Note from orchestrator: `BuildingSystem.tryPlaceWall(cell)` (#14) expects
**tile coordinates**. The Input system therefore exposes a `tileFromPx`
adapter callback so the scene-level glue can translate world pixels →
tile coords (wired later); the Input system itself stays coordinate-
agnostic and just forwards what it's told.

## Branch

`feat/21-input`

## Approach

### 1. New system: `src/game/systems/Input.ts`

A pure-TS class — jsdom-safe, no Phaser top-level import. It accepts
*raw pointer events* (Phaser-agnostic shape, see `PointerLike` below)
through three public methods (`onPointerDown`, `onPointerMove`,
`onPointerUp`), plus `onWheel` for desktop zoom. Recognition runs inside
those methods; semantic events are emitted on the supplied
`EventEmitterLike`.

Recognition state is a small per-pointer record stored in a
`Map<pointerId, PointerState>`. We don't depend on global timers — we
use `Date.now()` for timestamps so `vi.useFakeTimers()` in tests can
deterministically advance them with `vi.setSystemTime(...)` /
`vi.advanceTimersByTime(...)`.

#### `PointerLike` shape (Phaser-agnostic)

```ts
export interface PointerLike {
  /** Stable id per active pointer (Phaser: pointer.id; mouse: 0). */
  pointerId: number;
  /** Screen-space pixel x. */
  x: number;
  /** Screen-space pixel y. */
  y: number;
  /** Optional: which mouse button (0 left, 2 right). Touch: undefined. */
  button?: number;
  /** Optional kind hint; used to pick mouse fallback paths. */
  type?: 'mouse' | 'touch' | 'pen';
}
```

A scene-level glue file (out of scope here, lands when we wire Phaser to
React) will adapt `Phaser.Input.Pointer` → `PointerLike` and call into
the Input system's three methods.

#### `CameraLike` adapter

Camera control is encapsulated behind:

```ts
export interface CameraLike {
  /** Pan by a screen-space delta (px). System clamps already if it can. */
  pan(dx: number, dy: number): void;
  /** Zoom by a multiplicative factor relative to current zoom. */
  zoom(factor: number): void;
}
```

Optional. If supplied, the system calls it on drag / pinch / wheel.
Either way, `camera:pan` / `camera:zoom` events are emitted so other
listeners (e.g. minimap) can respond. The Phaser scene supplies a real
adapter that maps to `this.cameras.main.scrollX -= dx` etc.; tests
inject a mock to assert calls.

#### Gesture recognition

Thresholds come from a single optional `config` argument with sensible
defaults sourced from `src/data/input/gestures.json` (see "Data" below).
That keeps the AC's "tweakable" nature alive without scattering numbers.

State per pointer:

```ts
interface PointerState {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
  /** Set when we cross dragThresholdPx — locks the gesture to drag. */
  isDragging: boolean;
  /** Long-press timer handle (setTimeout id-or-similar). */
  longPressHandle: ReturnType<typeof setTimeout> | null;
  /** True if a long-press already fired so the up event doesn't also fire `tap`. */
  longPressFired: boolean;
  button?: number;
}
```

**Tap** — `pointerup` within `tapMaxDurationMs` (default 250) and total
movement `< dragThresholdPx` (default 10) and `longPressFired === false`.
Emits `select:tile` *or* `select:entity` depending on `hitTest` callback
result (see Hit testing below).

**Long-press** — a `setTimeout(longPressDurationMs)` (default 500)
scheduled on pointerdown. If the pointer hasn't moved past the threshold
nor been released by then, fires `inspect:show`. Subsequent `pointerup`
treats it as consumed.

**Drag (pan)** — once total movement crosses `dragThresholdPx` while the
pointer is held *and* there is exactly one active pointer *and* the
hit-test at start was not on an entity (i.e. "empty terrain"), the
gesture promotes to drag. Each subsequent move emits `camera:pan` with
`{dx, dy}` deltas (since last move) and calls `camera.pan(dx, dy)`.

**Pinch (zoom)** — when there are exactly two active pointers, we track
their distance. On move, compute `factor = currentDist / lastDist`; if
`Math.abs(factor - 1) > pinchMinDelta` (default 0.01) emit `camera:zoom`
with `{factor}` and call `camera.zoom(factor)`. Cancels any tap /
long-press / single-pointer drag in flight on both pointers (sets
`isDragging` so the up doesn't fire a tap).

#### Mouse fallback

Mapped on entry, *not* by branching deep in recognition:
- Left-button `pointerdown` → standard tap/long-press/drag stream.
- Right-button (`button === 2`) `pointerdown` → fires `inspect:show`
  immediately on `pointerup` (acts as "long-press") — no setTimeout
  needed, since right-click is the desktop semantic equivalent.
- `wheel` event → `onWheel(deltaY)` → emits `camera:zoom` with
  `{factor}` derived from `wheelZoomStep` (default 0.0015 per pixel, so
  `factor = 1 - deltaY * step`), and calls `camera.zoom(factor)`.

#### Hit testing

The Input system does *not* know the world. Callers inject an optional
`hitTest(point: {x:number, y:number}): HitResult` callback returning
`{kind:'entity', id:string}` or `{kind:'tile', x:number, y:number}` or
`null`. On tap / long-press resolution we call it once at the start
position and emit accordingly. If no `hitTest` is supplied, we emit
`select:tile` / `inspect:show` with raw screen coords and let the
listener resolve.

#### API

```ts
export class InputSystem {
  constructor(opts: InputSystemOptions);
  onPointerDown(p: PointerLike): void;
  onPointerMove(p: PointerLike): void;
  onPointerUp(p: PointerLike): void;
  onWheel(deltaY: number, point?: {x:number; y:number}): void;
  /** Cancel any in-flight gestures. Called on scene shutdown. */
  cancel(): void;
  /** Read-only count for tests/diagnostics. */
  get activePointerCount(): number;
}
```

### 2. Events — additive append to `events.ts`

Append (never reorder):

- `SelectTile = 'select:tile'` — payload `{x:number; y:number}` (tile
  coords if `hitTest` resolved one, else screen coords with `kind:'screen'`
  on the payload — keep the union narrow by exporting a discriminated
  type).
- `SelectEntity = 'select:entity'` — payload `{id:string}`.
- `InspectShow = 'inspect:show'` — payload mirrors `select:*` shape; the
  caller decides which target to inspect.
- `CameraPan = 'camera:pan'` — payload `{dx:number; dy:number}`.
- `CameraZoom = 'camera:zoom'` — payload `{factor:number}` (>1 zoom in,
  <1 zoom out).

Re-export the new payload types via `index.ts` (additive only).

### 3. Data: gesture thresholds in JSON

`src/data/input/gestures.json` — single object with the four numbers:

```json
{
  "tapMaxDurationMs": 250,
  "longPressDurationMs": 500,
  "dragThresholdPx": 10,
  "pinchMinDelta": 0.01,
  "wheelZoomStep": 0.0015
}
```

Validated by a new tiny zod schema `src/data/schemas/input.schema.ts`,
registered in `dataRegistry` so `pnpm validate:data` covers it. The
Input system imports the JSON at module load (same as other systems
import `mougg-grunt.json`) and uses it as defaults; callers can still
override per-instance via `opts.config`.

This satisfies the CLAUDE.md "no magic numbers" rule. The numbers above
are heuristics, not balance per se, but the rule applies uniformly.

### 4. Systems barrel — additive

`src/game/systems/index.ts`: append
`export { InputSystem } from './Input';` plus its types. Never re-order
existing exports.

### 5. No Phaser import; no scene wiring

Per orchestrator note, the Phaser glue (calling `scene.input.on
('pointerdown', ...)` and adapting to `PointerLike`) is *not* in this
issue. We document the intended one-pager in Decisions; the system itself
is unit-tested in isolation.

## Files

- `docs/plans/PLAN-21-input.md` (this plan)
- `src/game/systems/Input.ts` (new)
- `src/game/systems/events.ts` — additive
- `src/game/systems/index.ts` — additive exports
- `src/data/input/gestures.json` (new)
- `src/data/schemas/input.schema.ts` (new)
- `src/data/schemas/index.ts` — additive registry entry
- `tests/game/systems/Input.test.ts` (new)

## Test strategy

All vitest + jsdom + `SimpleEventEmitter`. No Phaser. `vi.useFakeTimers()`
for time-dependent tests (long-press, tap-vs-drag).

1. **Tap on empty terrain emits `select:tile`** — pointerdown then
   pointerup within 100 ms with zero movement → emits `select:tile` once
   with screen coords; no `inspect:show`, no `camera:pan`.

2. **Tap on entity emits `select:entity`** — `hitTest` stub returns
   `{kind:'entity', id:'orc-1'}`; tap → `select:entity` payload `{id:'orc-1'}`.

3. **Long-press fires `inspect:show` after threshold** — pointerdown,
   advance fake timers by 500 ms (no move) → `inspect:show` emitted; on
   subsequent pointerup, no tap fires.

4. **Movement before long-press cancels it** — pointerdown, move past
   `dragThresholdPx` at 100 ms, advance 500 ms more → no `inspect:show`.

5. **Drag emits `camera:pan` deltas + calls `CameraLike.pan`** — single
   pointer, sequence of moves crossing the drag threshold then more
   moves; expect a series of `camera:pan` emits whose `dx/dy` deltas sum
   to total movement; `camera.pan` mock called same number of times.

6. **Drag-on-empty only — drag does not fire `select:tile`** — once
   gesture promotes to drag, the eventual pointerup must not fire a tap.

7. **Pinch emits `camera:zoom` and calls `CameraLike.zoom`** — two
   pointerdowns, then pointermove changing the distance by ratio 1.5 →
   exactly one `camera:zoom` with `factor ≈ 1.5`; mock `camera.zoom`
   called with the same factor. Distances increase = factor > 1.

8. **Pinch suppresses tap on each pointer** — after pinch ends, pointer-
   ups on both pointers fire neither `select:*` nor `inspect:show`.

9. **Pinch threshold ignores tiny jitter** — distance change ratio of
   1.005 (below `pinchMinDelta`) → no `camera:zoom` emitted.

10. **Mouse right-click maps to `inspect:show`** — `pointerdown` with
    `button:2` then `pointerup` → `inspect:show` emitted; no tap.

11. **Mouse left-click maps to tap** — `pointerdown` with `button:0` then
    `pointerup` within tap window → `select:tile`.

12. **Wheel maps to `camera:zoom`** — `onWheel(-100)` → `camera:zoom`
    with `factor = 1 + 100*wheelZoomStep` (i.e. > 1 for zoom in /
    negative deltaY); `camera.zoom` mock called.

13. **`cancel()` clears in-flight long-press timer** — pointerdown,
    cancel, advance 500 ms → no `inspect:show`.

14. **Reads thresholds from JSON** — instantiate without `opts.config`,
    assert long-press fires at exactly 500 ms (the JSON value); also
    instantiate with custom `{longPressDurationMs:300}` and assert it
    fires at 300 ms — confirms data + override.

15. **`activePointerCount` reflects active pointers** — 0 → down → 1 →
    second down → 2 → up → 1 → up → 0.

16. **No `camera:pan` if no `CameraLike` provided** — drag still emits
    `camera:pan` events on the bus (the bus is the source of truth);
    just no error from missing camera. Confirms optional adapter.

## Verification

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test -- --run`
4. `pnpm validate:data` — covers the new `input/gestures.json`.
5. Grep `Input.ts` for numeric literals — only structural constants
   (e.g. `0`, `1`, `2` for button codes / pointer counts). All
   thresholds come from the JSON or `opts.config`.
6. Confirm no `import 'phaser'` anywhere in `Input.ts` or the test.
7. **Deferred** (per orchestrator note): cannot run iOS Safari emulator
   or Android Chrome at 375px from this environment. Manual verification
   on real devices lands when the Phaser scene wires the system in. The
   Input system itself is fully unit-tested against the documented
   gesture contract.

## Decisions

- **Phaser-agnostic translator + adapter pattern.** Same shape as #6
  through #14. Lets Vitest run jsdom-only without loading Phaser's
  canvas-feature detection.
- **Gesture thresholds in `src/data/input/gestures.json`** (validated
  by a new zod schema). They're heuristics, not balance per se, but
  the CLAUDE.md "no magic numbers" rule is uniform — and putting them
  in data means a designer can tweak feel without a code change. The
  Input system reads the JSON at module load and uses it as defaults;
  callers can still inject `opts.config` to override per-instance
  (e.g. accessibility profiles).
- **`CameraLike` is optional.** The system always emits `camera:pan` /
  `camera:zoom` on the event bus — that's the source of truth. The
  optional adapter is convenience for the common case where one camera
  is the only consumer.
- **Hit testing via injected callback, not built into the system.** The
  Input system is decoupled from the world; the scene supplies a
  `hitTest` that knows about entities + the tilemap. If omitted, taps
  emit `select:tile` with raw screen coords and a `kind:'screen'` flag.
- **Right-click = long-press equivalent**, fired immediately on
  `pointerup` rather than via a timer. This matches user expectations
  (right-click is instantaneous on desktop) while still mapping to the
  same `inspect:show` semantic event.
- **Fake-timer pinch testing**: pinch is *not* time-dependent — it
  reacts to position changes — so we just call `onPointerMove` directly
  without timer advances. Long-press, in contrast, *does* need
  `vi.useFakeTimers()` + `vi.advanceTimersByTime`. We use both
  patterns where appropriate.
- **Mobile 375px verification deferred** per orchestrator note. Cannot
  spin up an iOS Safari emulator in this environment. The unit tests
  cover the gesture contract; real-device QA happens when scene wiring
  lands.
- **No new deps.** Pure TS, uses existing `EventEmitterLike` and zod.
- **Shared files (`events.ts`, `systems/index.ts`) are add-only** per
  orchestrator note (#15 / #20 in flight on the same files).
