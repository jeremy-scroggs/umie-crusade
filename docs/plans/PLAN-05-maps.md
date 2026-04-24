# PLAN-05 — M1 slice map: fort-core, terrain, 3 spawn edges

## Context
Issue #5 asks us to author the M1 playable map: a 32x32 tile grid with a
fort-core at center-east backed against a coastline, three spawn edges on the
N/S/W sides, and varied terrain (grass, dirt path, stone, forest, water).

The M0 scaffold already ships `src/data/maps/placeholder.json` (also mirrored
to `public/data/maps/placeholder.json` so Vite serves it) and a Phaser
`PreloadScene` that loads it via `load.tilemapTiledJSON`. The shape of that
file is the canonical Tiled JSON export schema, which I will match for the new
`m1-slice.json` so `Phaser.Tilemaps` accepts it without code changes.

`dataRegistry` in `src/data/schemas/index.ts` intentionally does NOT register
`maps/` — Tiled JSON has its own shape, and `pnpm validate:data` skips it.
That's the expected behaviour; the new map need only parse as Tiled JSON.

## Branch
`feat/5-maps`

## Approach

1. Hand-author `src/data/maps/m1-slice.json` matching the Tiled JSON shape of
   `placeholder.json` (orientation, renderorder, width, height, tilewidth,
   tileheight, layers[], tilesets[], plus version/tiledversion keys Phaser
   ignores but Tiled round-trips).
   - **Dimensions:** 40 cols x 23 rows at 32x32 px = 1280x736 px, approximately
     the 1280x720 virtual viewport. 23 rows is the closest whole-tile fit.
   - **Tileset:** extend the existing placeholder tileset with terrain tile
     IDs so we don't need new art before M4. The placeholder tileset is a 3x1
     96x32 image — too narrow to host more terrain tile variants without new
     art. Solution: keep the existing `placeholder-tileset.png` reference and
     declare a second synthetic tileset `m1-terrain` with `firstgid` after
     placeholder's 3 tiles. The tileset's `image` path points at a
     placeholder-terrain file that will land with M4 art; Phaser will log a
     404 for the image but the tilemap JSON still parses and `addTilesetImage`
     in GameScene only needs to wire whichever tileset GameScene chooses to
     render. For M1, GameScene continues to render the placeholder tileset
     layer, and the richer terrain gid palette is ready for M4.
   - **Better alternative** (chosen): use ONLY the existing placeholder
     tileset gids (1=grass, 2=dirt, 3=stone) to encode the base terrain map,
     and represent forest/water as additional tile layers that reference the
     same placeholder tileset with semantic layer names (`forest`, `water`).
     That way the map loads end-to-end with existing art; the layers are
     separate so systems (#7 pathfinding, sight) can query them by name.
     Each layer uses the same gid palette; forest = gid 2 (dirt stand-in) on
     a dedicated layer, water = gid 3 (stone stand-in) on a dedicated layer.
     When M4 lands new art, we swap the placeholder-tileset.png to the real
     terrain atlas and the existing gid references stay valid.
   - **Layers:**
     - `ground` (tilelayer) — grass base (gid 1) covering the whole map, with
       a dirt path (gid 2) carved from W, N, S spawn edges converging on the
       fort-core. Stone (gid 3) tiles form a 5x5 fort footprint at center-east
       (col 28-32, row 9-13).
     - `forest` (tilelayer) — scattered forest patches (gid 2 as stand-in) on
       a dedicated layer so pathfinding/sight systems can query it.
     - `water` (tilelayer) — coastline strip of water tiles (gid 3 stand-in)
       along the east edge (cols 38-39) with a couple of inlets, representing
       the ocean behind the fort.
     - `spawns` (objectgroup) — 4 Tiled objects:
       - `spawn-north` at (mapCenterX, row 0)
       - `spawn-south` at (mapCenterX, row 22)
       - `spawn-west` at (col 0, mapCenterY)
       - `fort-core` at (col 30, row 11)
       Each object carries a `type` string ("spawn" or "fort-core") and a
       `name` so systems can look them up by name.

2. Mirror the JSON to `public/data/maps/m1-slice.json` so Vite serves it
   (matching the `placeholder.json` convention — there's an identical pair
   in src/ and public/ today).

3. Load the new map in `PreloadScene` IN ADDITION to the placeholder. The M0
   placeholder still backs the current GameScene; swapping GameScene to the
   new map is out of scope for #5 (GameScene changes belong with #7/#8 where
   pathfinding needs the real map). Loading it in Preload satisfies the AC
   "Loads in Boot/Preload scene without error" without disturbing GameScene
   rendering before pathfinding is ready.

4. Write a vitest unit test in `tests/data/m1-slice.test.ts` asserting the
   JSON parses, has the required dimensions, the expected layers, and the
   4 spawn/fort-core objects. This substitutes for interactive visual
   verification which I can't perform as an autonomous worker.

## Files
- `src/data/maps/m1-slice.json` (new) — canonical Tiled JSON
- `public/data/maps/m1-slice.json` (new) — Vite-served copy
- `src/game/scenes/PreloadScene.ts` (edit, add-only) — load new map key
- `tests/data/m1-slice.test.ts` (new) — shape + content assertions
- `docs/plans/PLAN-05-maps.md` (this file, new)

## Test strategy
- `pnpm typecheck` — passes (only tiny PreloadScene add, no new types)
- `pnpm lint` — passes (no new TS code patterns beyond existing)
- `pnpm test -- --run` — new `m1-slice.test.ts` loads the JSON and asserts:
  - `width === 40`, `height === 23`, `tilewidth === 32`, `tileheight === 32`
  - `layers` includes tile layers named `ground`, `forest`, `water` and an
    objectgroup `spawns`
  - `spawns` contains objects named `spawn-north`, `spawn-south`,
    `spawn-west`, `fort-core`
  - Each spawn object sits on its expected edge
  - The `fort-core` tile at (30,11) resolves to the stone gid (3) in the
    `ground` layer (sanity-check the fort footprint)
- `pnpm validate:data` — unchanged; `maps/` is intentionally not registered.

## Verification
- Local gate: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm validate:data` green.
- Visual in-game verification at 1280x720 is deferred — see Decisions.

## Decisions

- **Tiled GUI deviation.** The issue says "authored in Tiled"; I can't run the
  Tiled GUI in this worktree. I hand-author the JSON to match Tiled's export
  shape (same keys, same nesting, same enums as `placeholder.json`). The file
  is a valid Tiled map and can be round-tripped through Tiled later.
- **No `.tmx` source.** The AC lists `.tmx` as "optional, if kept in repo".
  Without Tiled I can't produce an authoritative `.tmx`; producing a hand-
  authored XML in parallel would just be a second source of truth to drift.
  Skipping `.tmx` for now; when someone opens the JSON in Tiled and saves, a
  `.tmx` can be added.
- **Add, don't replace, in PreloadScene.** The current GameScene renders the
  placeholder map and has click-handler logic tied to its 20x15 size. Swapping
  it to the new 40x23 map mid-M1 would require coordinating with the
  pathfinding/UI work in later issues. Loading the new map ALONGSIDE the
  placeholder satisfies the AC ("Loads in Boot/Preload scene without error")
  and leaves M1's later issues free to flip GameScene to use it.
- **Single placeholder tileset.** Rather than stage a second tileset that
  points at art which doesn't exist yet (M4 deliverable), reuse the existing
  `placeholder-tileset.png` gids (1=grass, 2=dirt, 3=stone) and encode
  forest/water semantically via dedicated tile layers. When M4 ships the real
  terrain atlas, swap the PNG and the existing gid references stay valid.
  This keeps M1 fully decoupled from M4 art.
- **Visual verification.** Full 1280x720 in-browser verification requires a
  human at a browser. The unit test covers shape + key coordinates (fort-core
  gid, spawn positions) which is the programmatic equivalent; a human
  visual-check pass is reserved for the PR review step.
- **Dimensions 40x23 vs "23".** 23 rows (736 px) is the closest whole-tile
  fit to 720 px. Phaser's `Scale.FIT` handles the 16-px overflow; the
  alternative (22 rows = 704 px, 16 px under) leaves a black band. 736 over
  720 is imperceptible after scaling.
