# Umie Crusade — Architecture Notes

Companion to [PROJECT_PLAN.md](PROJECT_PLAN.md). Captures locked-in
engineering decisions and the rationale behind them, kept out of the
plan to avoid bloating the milestone tracker.

---

## Tile size lock

### Decision

Every map tile is **32 × 32 px**, locked at the end of M1. The
canonical constant lives in `src/game/config/tile.ts`:

```ts
export const TILE_SIZE = 32 as const;
export const TILE_HALF = TILE_SIZE / 2;
```

Code that needs a tile dimension imports from `@/game/config/tile`.
Game systems (`src/game/systems/`) remain tile-size-agnostic — they
read `tilewidth` / `tileheight` from the parsed Tiled map at runtime
rather than depending on the constant. Tiled JSON files
(`src/data/maps/*.json`) carry their own literal `tilewidth: 32` and
`tileheight: 32` because the Tiled format requires concrete numeric
fields.

### Rationale

- **Fidelity.** 32 × 32 is the dominant indie pixel-art density for
  orcish / medieval tilesets. Hand-painted detail (orc tusks, banner
  trim, wall masonry) reads cleanly at this size on phone screens
  with `pixelArt: true` + `roundPixels: true` already configured in
  `src/game/config.ts`.
- **Performance.** At a 1280 × 720 virtual canvas (Phaser
  `Scale.FIT`) the visible grid is 40 × 22.5 tiles — comfortably
  inside mobile GPU budgets even with overlay sprites, projectiles,
  and particle effects. Halving to 16 × 16 would quadruple draw
  count for marginal density gain.
- **Artist pipeline.** Tiled is the source-of-truth map format; the
  current `src/data/maps/m1-slice.json` and `placeholder.json` are
  authored at 32 × 32. Locking matches what the artist is already
  delivering and avoids a re-export.

### Revisit conditions

Re-open the decision only if one of:

1. The artist pipeline delivers a complete asset set at a different
   size (full re-tile + re-spritesheet, not piecemeal).
2. Mobile playtest reveals readability problems on small screens
   that sub-pixel scaling cannot fix.
3. A tooling change (e.g. a different map editor) makes 16 × 16 or
   24 × 24 substantially cheaper to author.

In every revisit case the systems code does not move — only the
constant, the asset pipeline, and the Tiled exports.

### Notes

- Canvas virtual resolution (1280 × 720) is unrelated to the tile
  lock. It is its own configuration in `src/lib/constants.ts`. Yes,
  720 ÷ 32 = 22.5 tiles vertically, and that's fine: `Scale.FIT`
  handles the half-tile gracefully and the rendered frame stays
  pixel-perfect.
- The `grep guard` integration test
  (`tests/integration/grep-guard.test.ts`) protects against
  stray balance literals in `src/game/systems/`. It does not scan
  config files — `TILE_SIZE = 32` in `src/game/config/tile.ts` is
  by design and out of scope for the guard.
