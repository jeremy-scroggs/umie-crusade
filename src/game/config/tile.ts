/**
 * Tile size — locked structural config.
 *
 * Decision (M1): every tile is 32 × 32 px. See `docs/ARCHITECTURE.md`
 * for the rationale (fidelity / perf / artist pipeline) and revisit
 * conditions.
 *
 * Game systems remain tile-size-agnostic — they read `tilewidth` /
 * `tileheight` off the parsed Tiled map at runtime. This constant is
 * the canonical source for code paths that genuinely need a tile
 * dimension (e.g. pointer→cell math in scene glue) and for documenting
 * the locked decision.
 */
export const TILE_SIZE = 32 as const;

/**
 * Half a tile, in pixels. The "centre of cell" offset used when
 * positioning sprites that anchor at their geometric centre on a
 * grid cell.
 */
export const TILE_HALF = TILE_SIZE / 2;
