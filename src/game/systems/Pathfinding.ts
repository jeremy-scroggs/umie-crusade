import EasyStar from 'easystarjs';
import type { EventEmitterLike } from '@/game/components';
import {
  GameEvents,
  type WallEventPayload,
} from './events';

/**
 * Pathfinding — A* grid over a parsed Tiled map with lazy recompute on
 * wall changes.
 *
 * Construction takes the parsed map JSON (the same shape as
 * `src/data/maps/m1-slice.json`) plus an `EventEmitterLike` bus. The
 * system reduces the multi-layer map to a single passability grid (see
 * `WALKABLE` / `IMPASSABLE` below), feeds it to easystarjs, and listens
 * for `wall:built` / `wall:destroyed` to update the grid and invalidate
 * its path cache.
 *
 * Design notes:
 * - No Phaser import — the emitter is the only indirection we need to
 *   run in Node/jsdom.
 * - No gid / terrain literals: a cell is impassable iff at least one
 *   tile layer reports `properties.passable === false` at that cell.
 * - Dynamic walls (from issue #14) force impassability regardless of
 *   the base terrain.
 * - Sync mode in easystar — deterministic, tick-friendly, promise-wrap
 *   is a one-liner.
 */

/** Passability tokens for the easystar grid. Structural, not balance. */
const WALKABLE = 0;
const IMPASSABLE = 1;

/** A grid cell. Matches easystarjs' findPath callback shape. */
export interface Cell {
  x: number;
  y: number;
}

/**
 * Minimal Tiled-map subset consumed by Pathfinding. The full parsed
 * JSON (as produced by Tiled and imported via Vite's JSON loader) is
 * assignable to this type.
 */
export interface TiledTileLayer {
  type: 'tilelayer';
  name: string;
  width: number;
  height: number;
  data: number[];
  properties?: { name: string; value: unknown }[];
}

export interface TiledObjectLayer {
  type: 'objectgroup';
  name: string;
}

export type TiledLayer = TiledTileLayer | TiledObjectLayer;

export interface TiledMapLike {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
}

export interface PathfindingOptions {
  /**
   * Whether to allow diagonal movement. Defaults to `false` — the
   * initial human AI walks on cardinal directions.
   */
  diagonals?: boolean;
}

type CacheKey = `${number},${number}->${number},${number}`;

export class Pathfinding {
  readonly width: number;
  readonly height: number;
  readonly tileWidth: number;
  readonly tileHeight: number;

  private readonly emitter: EventEmitterLike;
  private readonly easystar: EasyStar.js;
  /** Base passability grid derived from the map (walls NOT applied). */
  private readonly baseGrid: number[][];
  /** Live grid fed to easystar — base + dynamic walls. */
  private readonly grid: number[][];
  /** Cells currently occupied by walls, keyed "x,y". */
  private readonly walls = new Set<string>();
  /** Resolved path cache keyed by `${fx},${fy}->${tx},${ty}`. */
  private readonly cache = new Map<CacheKey, Cell[] | null>();

  private readonly onWallBuilt = (payload: unknown) => {
    const cell = toCell(payload);
    if (!cell) return;
    this.setWall(cell.x, cell.y, true);
  };

  private readonly onWallDestroyed = (payload: unknown) => {
    const cell = toCell(payload);
    if (!cell) return;
    this.setWall(cell.x, cell.y, false);
  };

  constructor(
    map: TiledMapLike,
    emitter: EventEmitterLike,
    options: PathfindingOptions = {},
  ) {
    this.width = map.width;
    this.height = map.height;
    this.tileWidth = map.tilewidth;
    this.tileHeight = map.tileheight;
    this.emitter = emitter;

    this.baseGrid = buildBaseGrid(map);
    this.grid = this.baseGrid.map((row) => row.slice());

    this.easystar = new EasyStar.js();
    this.easystar.setGrid(this.grid);
    this.easystar.setAcceptableTiles([WALKABLE]);
    this.easystar.enableSync();
    if (options.diagonals) {
      this.easystar.enableDiagonals();
    } else {
      this.easystar.disableDiagonals();
    }

    emitter.on(GameEvents.WallBuilt, this.onWallBuilt);
    emitter.on(GameEvents.WallDestroyed, this.onWallDestroyed);
  }

  /**
   * Detach event subscriptions. Call when the owning scene shuts down.
   */
  destroy(): void {
    this.emitter.off(GameEvents.WallBuilt, this.onWallBuilt);
    this.emitter.off(GameEvents.WallDestroyed, this.onWallDestroyed);
    this.cache.clear();
    this.walls.clear();
  }

  /** Is `(x, y)` inside the grid? */
  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Is `(x, y)` currently walkable (base terrain + walls)? */
  isWalkable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return this.grid[y]![x]! === WALKABLE;
  }

  /** Manually place/remove a wall. Normally driven by events; exposed for direct callers + tests. */
  setWall(x: number, y: number, present: boolean): void {
    if (!this.inBounds(x, y)) return;
    const key = `${x},${y}`;
    const currentlyWall = this.walls.has(key);
    if (present && !currentlyWall) {
      this.walls.add(key);
      this.grid[y]![x] = IMPASSABLE;
    } else if (!present && currentlyWall) {
      this.walls.delete(key);
      // Revert to base terrain — walls may sit on base-walkable or
      // base-impassable terrain; we trust the base grid either way.
      this.grid[y]![x] = this.baseGrid[y]![x]!;
    } else {
      return; // no-op
    }
    this.easystar.setGrid(this.grid);
    this.invalidate();
  }

  /**
   * Find a path from `(fromX, fromY)` to `(toX, toY)`. Resolves with
   * an array of cells (inclusive of both endpoints, as easystar
   * returns) or `null` if no path exists or an endpoint is out of
   * bounds / impassable.
   */
  findPath(fromX: number, fromY: number, toX: number, toY: number): Promise<Cell[] | null> {
    if (
      !this.inBounds(fromX, fromY) ||
      !this.inBounds(toX, toY) ||
      !this.isWalkable(toX, toY) ||
      !this.isWalkable(fromX, fromY)
    ) {
      return Promise.resolve(null);
    }

    const key: CacheKey = `${fromX},${fromY}->${toX},${toY}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return Promise.resolve(cached);

    return new Promise<Cell[] | null>((resolve) => {
      this.easystar.findPath(fromX, fromY, toX, toY, (path) => {
        const result = path ?? null;
        this.cache.set(key, result);
        resolve(result);
      });
      // Sync mode: the callback above fires inline on calculate().
      this.easystar.calculate();
    });
  }

  private invalidate(): void {
    this.cache.clear();
    this.emitter.emit(GameEvents.PathInvalidated, {});
    this.emitter.emit(GameEvents.PathRecompute, {});
  }
}

/**
 * Build the passability grid from the map's tile layers.
 *
 * A cell is IMPASSABLE iff at least one tile layer has a non-zero gid
 * at that cell AND declares `properties.passable === false`. All other
 * cells (including empty / walkable layers) are WALKABLE.
 *
 * This avoids any gid-to-terrain mapping: the map's own per-layer
 * `passable` property is the sole input.
 */
function buildBaseGrid(map: TiledMapLike): number[][] {
  const { width, height } = map;
  const grid: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = new Array(width).fill(WALKABLE);
    grid.push(row);
  }

  for (const layer of map.layers) {
    if (layer.type !== 'tilelayer') continue;
    if (layerPassable(layer) !== false) continue;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const gid = layer.data[y * width + x] ?? 0;
        if (gid === 0) continue;
        grid[y]![x] = IMPASSABLE;
      }
    }
  }

  return grid;
}

function layerPassable(layer: TiledTileLayer): boolean | undefined {
  const props = layer.properties;
  if (!props) return undefined;
  for (const p of props) {
    if (p.name === 'passable' && typeof p.value === 'boolean') return p.value;
  }
  return undefined;
}

function toCell(payload: unknown): WallEventPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as { x?: unknown; y?: unknown };
  if (typeof p.x !== 'number' || typeof p.y !== 'number') return null;
  return { x: p.x, y: p.y };
}
