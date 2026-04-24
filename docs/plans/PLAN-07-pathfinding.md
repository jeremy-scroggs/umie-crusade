# PLAN-07 — Pathfinding: easystarjs A* grid with wall-change recompute

## Context

Issue #7 wires `easystarjs` to the map grid so humans can A*-path to the
fort. Walls (from #14, not yet landed) must block paths; destroying a wall
must reopen the route. The system is decoupled from Phaser by consuming
(a) a parsed Tiled-style map, and (b) an `EventEmitterLike` bus for wall
events — matching the pattern established in #6
(`src/game/components/EventEmitter.ts`).

Upstream landed:
- #5 map: `src/data/maps/m1-slice.json` (40x23, 32px tiles, layers
  `ground` / `forest` / `water`, plus `spawns` object group with a
  `fort-core`).
- #6 entities/components: `EventEmitterLike` interface + `SimpleEventEmitter`
  default implementation — reused here.

Data from the map:
- `tilewidth` / `tileheight` = 32
- `width` x `height` = 40 x 23
- layer `ground` (gids 1/2/3 for grass/dirt/stone; fort tiles are stone) —
  all treated as walkable terrain for humans.
- layer `forest` — properties `{ blocksSight: true, passable: true }` →
  walkable.
- layer `water` — properties `{ passable: false }` → impassable.

No balance numbers are introduced here: grid dims, tile size, and the
per-layer `passable` flag all come from the parsed map.

## Branch

`feat/7-pathfinding`

## Approach

**System shape.** A `Pathfinding` class constructed with
`(map, emitter, options?)` where:
- `map` is the parsed Tiled JSON (or minimal structural subset: `width`,
  `height`, `layers[]` each with `data` + optional `properties`).
- `emitter` is any `EventEmitterLike` (SimpleEventEmitter in tests;
  Phaser's EventEmitter in production).
- `options.acceptablePassableTiles` defaults to the single walkable token
  derived from the grid build (see below).

**Grid construction.** We don't feed tile gids directly to easystar —
doing so would require hardcoding that "gid 1 = walkable, gid 3 = water".
Instead we walk the layers and reduce each cell to a **passability token**:

```
WALKABLE   = 0   // default
IMPASSABLE = 1   // water OR a dynamic wall
```

For each cell `(x, y)`:
- start at WALKABLE
- for every tile layer with a non-zero gid at `(x, y)` AND whose
  `properties.passable === false`, mark cell IMPASSABLE
- dynamic walls (see below) force IMPASSABLE regardless

We feed this derived 2D grid to easystar with
`setAcceptableTiles([WALKABLE])`. This keeps the pathfinding logic free of
gid-specific constants — the only semantic input is the layer's declared
`passable` property.

The two passability tokens (0, 1) are the **only** numbers in the
pathfinding code that look like magic. They're structural encoding flags
for easystar, not balance — documented in Decisions.

**Wall tracking.** Walls are a game-layer concept (coming in #14). This
system keeps an internal `Set<string>` of `"x,y"` wall keys. When a
`wall:built` event fires, the cell is flipped IMPASSABLE; on `wall:destroyed`
the cell reverts to its map-derived baseline.

**Cache + invalidation.** `findPath(from, to)` returns `Promise<Cell[] | null>`.
We keep a Map keyed by `"fx,fy->tx,ty"` of in-flight / resolved paths.
On any wall change we:
1. Update the easystar grid (`setGrid(newGrid)`).
2. Clear the cached results and emit `path:invalidated` + `path:recompute`.

Wall-change recompute is lazy: we don't preemptively refind paths, we just
drop the cache so the next `findPath` call computes fresh. The
`path:recompute` event is a public signal for game systems (unit movement)
to re-query paths at their leisure.

**Promise wrapper.** easystarjs' `findPath(sx,sy,ex,ey, cb)` returns an
instance id; you must call `calculate()` to drive the search. We enable
sync mode (`enableSync()`) — the callback fires inline on `calculate()`
— and wrap it in `new Promise`. Sync mode matches our use-case (unit
ticks want a resolved path) and gives deterministic perf for the < 20ms
target. Async/iteration-throttled mode stays possible later by toggling
an option.

**Bounds + early-out.** If `from` or `to` is out of grid bounds, or the
target cell is impassable, `findPath` resolves with `null` without
calling easystar.

## Files

- `src/game/systems/events.ts` (new) — event-name string constants +
  `WallEventPayload` / `PathEventPayload` types.
- `src/game/systems/Pathfinding.ts` (new) — `Pathfinding` class.
- `src/game/systems/index.ts` (new) — barrel exports.
- `tests/game/systems/Pathfinding.test.ts` (new) — AC coverage:
  - basic findPath on a clean grid returns a sensible path.
  - water is impassable (map-derived).
  - forest is passable.
  - wall event blocks a known route; removing the wall restores it.
  - out-of-bounds / impassable target resolves null.
  - perf sanity: 80x45 grid path under 20ms (best-effort, not a hard
    assertion — see Test strategy).
- `docs/plans/PLAN-07-pathfinding.md` (this doc).

## Test strategy

- Vitest + jsdom (already configured).
- Use a tiny hand-built fixture map (e.g. 6x3) for most tests so wall-block
  scenarios are self-evident.
- For the wall-block test: build a fixture with a single-row corridor;
  emit `wall:built` on the middle cell and expect `findPath` to return
  `null` (or a detour if a detour exists); then emit `wall:destroyed` and
  expect the original route to return.
- For the perf test: construct an 80x45 grid (all walkable), time a
  corner-to-corner findPath. Log the ms; use a soft assertion
  (`expect(elapsed).toBeLessThan(50)`) that catches egregious regressions
  without being flaky on CI. The 20ms target is a best-effort design
  goal per the orchestrator notes.
- Use real `SimpleEventEmitter` (not a mock) — it's the production-ish
  path and it's already covered by component tests.

## Verification

1. `pnpm typecheck` passes (strict mode, noUncheckedIndexedAccess).
2. `pnpm lint` passes.
3. `pnpm test -- --run` passes including new Pathfinding tests.
4. `pnpm validate:data` unchanged (no data files touched).
5. No hardcoded tile constants: grep the new code for gid literals
   (1/2/3 tied to terrain) — only structural 0/1 passability tokens
   allowed. All dimensions / tile size come from the map argument.

## Decisions

- **Parsed-map input, not a Phaser Tilemap.** Same reasoning as #6 — keep
  the system testable in Node/jsdom without Phaser's canvas side effects.
  A production adapter can pass the already-parsed JSON (imported via
  Vite's JSON loader) directly.
- **Per-layer `passable` property drives impassability.** Avoids encoding
  "water = gid 3" anywhere. If a future map adds a new impassable layer
  (swamp?), the system handles it for free as long as the layer sets
  `passable: false`.
- **Two passability tokens only (`WALKABLE=0`, `IMPASSABLE=1`).** These
  are structural flags for easystar's `setAcceptableTiles`, not gameplay
  numbers. Documented in-file.
- **`forest` is walkable.** Its layer property says `passable: true`;
  `blocksSight` is a future vision-system concern (#30+), not
  pathfinding.
- **Walls are cells, not entities (at this layer).** Wall placement #14
  will emit `wall:built` / `wall:destroyed` with a `{x, y}` cell payload
  (or compatible). Pathfinding doesn't care about the wall's HP or
  sprite — only its grid coordinate.
- **Sync mode for easystar.** Chosen for deterministic perf and easier
  Promise wrapping. Async/iteration-throttled mode is a future knob if
  pathfinding ever blocks the frame.
- **Cache key format `"fx,fy->tx,ty"`.** Simple string keys, invalidated
  wholesale on any wall change (cheap vs. per-path dependency tracking).
- **`path:recompute` event.** Emitted after wall changes so movement
  systems can re-query paths opportunistically. No auto-recompute done
  by this system — it's lazy by design (per AC).
- **No direct Phaser import.** Production code is free to pass a Phaser
  EventEmitter (via `EventEmitterLike`) but this module never imports
  `phaser`.
