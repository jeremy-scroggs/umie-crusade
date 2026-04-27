/**
 * Tile size is locked at 32 × 32 px (M1). The canonical declaration
 * lives in `src/game/config/tile.ts` — re-exported here so existing
 * `@/lib/constants` importers keep working. New call sites should
 * import from `@/game/config/tile` directly.
 */
export { TILE_SIZE } from '@/game/config/tile';
export const VIRTUAL_WIDTH = 1280;
export const VIRTUAL_HEIGHT = 720;
export const MAP_COLS = 20;
export const MAP_ROWS = 15;

/**
 * How long (ms) the HUD shows the "ISE HAI!" banner after `wave:start`.
 * Lives in lib/constants because it is a UI timing constant, not a
 * balance number — keeping it out of `src/data/` per existing pattern
 * (other UI constants like map dims also live here).
 */
export const WAVE_START_BANNER_MS = 2500;
