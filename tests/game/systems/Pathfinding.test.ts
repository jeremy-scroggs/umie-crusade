import { describe, it, expect, vi } from 'vitest';
import { Pathfinding, GameEvents } from '@/game/systems';
import type { TiledMapLike } from '@/game/systems';
import { SimpleEventEmitter } from '@/game/components';
import m1 from '@/data/maps/m1-slice.json';

/**
 * Build a minimal Tiled-like map for tests. `terrain` is a 2D array
 * where each cell is a non-zero gid for the named `ground` layer.
 * Optional extra layers can carry `passable: false` to simulate water.
 */
function makeMap(opts: {
  width: number;
  height: number;
  ground: number[][];
  water?: number[][];
}): TiledMapLike {
  const { width, height, ground, water } = opts;
  const flat = (g: number[][]): number[] => {
    const out: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        out.push(g[y]![x]!);
      }
    }
    return out;
  };
  const layers: TiledMapLike['layers'] = [
    {
      type: 'tilelayer',
      name: 'ground',
      width,
      height,
      data: flat(ground),
      // properties omitted -> treated as walkable
    },
  ];
  if (water) {
    layers.push({
      type: 'tilelayer',
      name: 'water',
      width,
      height,
      data: flat(water),
      properties: [
        { name: 'blocksSight', value: false },
        { name: 'passable', value: false },
      ],
    });
  }
  return {
    width,
    height,
    tilewidth: 32,
    tileheight: 32,
    layers,
  };
}

/** All-walkable ground of given size. */
function fullGround(width: number, height: number): number[][] {
  return Array.from({ length: height }, () => Array<number>(width).fill(1));
}

/** Empty (zero-gid) layer of given size. */
function emptyLayer(width: number, height: number): number[][] {
  return Array.from({ length: height }, () => Array<number>(width).fill(0));
}

describe('Pathfinding', () => {
  it('constructs from a map and exposes dimensions + tile size from the data', () => {
    const map = makeMap({ width: 5, height: 3, ground: fullGround(5, 3) });
    const pf = new Pathfinding(map, new SimpleEventEmitter());
    expect(pf.width).toBe(5);
    expect(pf.height).toBe(3);
    expect(pf.tileWidth).toBe(32);
    expect(pf.tileHeight).toBe(32);
  });

  it('finds a straight path on an empty grid', async () => {
    const map = makeMap({ width: 5, height: 1, ground: fullGround(5, 1) });
    const pf = new Pathfinding(map, new SimpleEventEmitter());
    const path = await pf.findPath(0, 0, 4, 0);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 0, y: 0 });
    expect(path![path!.length - 1]).toEqual({ x: 4, y: 0 });
    // 5 cells including endpoints
    expect(path!.length).toBe(5);
  });

  it('treats tiles in a layer marked passable:false as impassable', async () => {
    // 3x1 with water in the middle cell -> no path from 0,0 to 2,0
    const ground = fullGround(3, 1);
    const water = emptyLayer(3, 1);
    water[0]![1] = 1; // water gid at (1,0)
    const map = makeMap({ width: 3, height: 1, ground, water });
    const pf = new Pathfinding(map, new SimpleEventEmitter());
    const path = await pf.findPath(0, 0, 2, 0);
    expect(path).toBeNull();
  });

  it("wall:built blocks a known route; wall:destroyed restores it", async () => {
    // 1D corridor 5x1, all walkable. Block (2,0) and expect no path.
    const map = makeMap({ width: 5, height: 1, ground: fullGround(5, 1) });
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);

    const open = await pf.findPath(0, 0, 4, 0);
    expect(open).not.toBeNull();
    expect(open!.length).toBe(5);

    emitter.emit(GameEvents.WallBuilt, { x: 2, y: 0 });
    expect(pf.isWalkable(2, 0)).toBe(false);
    const blocked = await pf.findPath(0, 0, 4, 0);
    expect(blocked).toBeNull();

    emitter.emit(GameEvents.WallDestroyed, { x: 2, y: 0 });
    expect(pf.isWalkable(2, 0)).toBe(true);
    const restored = await pf.findPath(0, 0, 4, 0);
    expect(restored).not.toBeNull();
    expect(restored!.length).toBe(5);
  });

  it('emits path:invalidated and path:recompute after a wall change', () => {
    const map = makeMap({ width: 3, height: 1, ground: fullGround(3, 1) });
    const emitter = new SimpleEventEmitter();
    const onInvalidated = vi.fn();
    const onRecompute = vi.fn();
    emitter.on(GameEvents.PathInvalidated, onInvalidated);
    emitter.on(GameEvents.PathRecompute, onRecompute);

    new Pathfinding(map, emitter);
    emitter.emit(GameEvents.WallBuilt, { x: 1, y: 0 });

    expect(onInvalidated).toHaveBeenCalledTimes(1);
    expect(onRecompute).toHaveBeenCalledTimes(1);
  });

  it('invalidates its result cache after a wall change', async () => {
    // 2-row corridor so there is a detour when middle is blocked.
    // row 0: W W W W W
    // row 1: W W W W W
    const map = makeMap({ width: 5, height: 2, ground: fullGround(5, 2) });
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);

    const first = await pf.findPath(0, 0, 4, 0);
    expect(first).not.toBeNull();
    const firstLen = first!.length;

    // Block the direct row; path must now detour via row 1.
    emitter.emit(GameEvents.WallBuilt, { x: 2, y: 0 });
    const second = await pf.findPath(0, 0, 4, 0);
    expect(second).not.toBeNull();
    // Not the same cached array
    expect(second).not.toBe(first);
    // Should be at least as long as the direct path (likely longer).
    expect(second!.length).toBeGreaterThanOrEqual(firstLen);
    // And it must not traverse the blocked cell.
    expect(second!.some((c) => c.x === 2 && c.y === 0)).toBe(false);
  });

  it('returns null for out-of-bounds or impassable endpoints', async () => {
    const map = makeMap({ width: 3, height: 3, ground: fullGround(3, 3) });
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);

    expect(await pf.findPath(-1, 0, 2, 2)).toBeNull();
    expect(await pf.findPath(0, 0, 99, 99)).toBeNull();

    emitter.emit(GameEvents.WallBuilt, { x: 2, y: 2 });
    expect(await pf.findPath(0, 0, 2, 2)).toBeNull();
  });

  it('destroy() unsubscribes from wall events', () => {
    const map = makeMap({ width: 3, height: 1, ground: fullGround(3, 1) });
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    pf.destroy();

    // After destroy, a wall event should not mutate the system.
    emitter.emit(GameEvents.WallBuilt, { x: 1, y: 0 });
    expect(pf.isWalkable(1, 0)).toBe(true);
  });

  it('works with the real m1-slice map (water is impassable, grass is walkable)', async () => {
    const pf = new Pathfinding(m1 as unknown as TiledMapLike, new SimpleEventEmitter());
    // East edge is water per the map (last two columns).
    expect(pf.isWalkable(m1.width - 1, 0)).toBe(false);
    expect(pf.isWalkable(m1.width - 2, 0)).toBe(false);
    // Walk from the western spawn (col 0, row 11) to one column west of the
    // fort footprint (col 27, row 11) along the dirt path.
    const path = await pf.findPath(0, 11, 27, 11);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 0, y: 11 });
    expect(path![path!.length - 1]).toEqual({ x: 27, y: 11 });
  });

  it('finds a path on an 80x45 grid reasonably quickly (perf sanity)', async () => {
    const W = 80;
    const H = 45;
    const map = makeMap({ width: W, height: H, ground: fullGround(W, H) });
    const pf = new Pathfinding(map, new SimpleEventEmitter());
    const start = performance.now();
    const path = await pf.findPath(0, 0, W - 1, H - 1);
    const elapsed = performance.now() - start;
    expect(path).not.toBeNull();
    // Target per AC is < 20ms; soft ceiling guards against egregious
    // regressions without being flaky on slow CI hardware.
    expect(elapsed).toBeLessThan(200);
  });
});
