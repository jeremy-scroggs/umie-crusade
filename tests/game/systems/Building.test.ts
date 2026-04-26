import { describe, it, expect, vi } from 'vitest';
import {
  BuildingSystem,
  Pathfinding,
  GameEvents,
} from '@/game/systems';
import type {
  BuildingStoreLike,
  TiledMapLike,
} from '@/game/systems';
import { SimpleEventEmitter } from '@/game/components';
import wallWood from '@/data/buildings/wall-wood.json';
import type { BuildingDef, WallDef } from '@/types';

/**
 * Tests for BuildingSystem (#14).
 *
 * Patterns mirror Pathfinding.test.ts and Economy.test.ts: jsdom + a
 * SimpleEventEmitter + a stub store; no Phaser. Real Pathfinding so we
 * exercise the actual `wall:built` round-trip.
 */

const wallDef = wallWood as BuildingDef;
if (wallDef.category !== 'wall') {
  throw new Error('fixture: wall-wood must be category=wall');
}
const def: WallDef = wallDef;

/** 1D corridor: width cells wide, 1 tall, all walkable. */
function corridor(width: number): TiledMapLike {
  return {
    width,
    height: 1,
    tilewidth: 32,
    tileheight: 32,
    layers: [
      {
        type: 'tilelayer',
        name: 'ground',
        width,
        height: 1,
        data: Array<number>(width).fill(1),
      },
    ],
  };
}

/** All-walkable WxH field. */
function field(w: number, h: number): TiledMapLike {
  return {
    width: w,
    height: h,
    tilewidth: 32,
    tileheight: 32,
    layers: [
      {
        type: 'tilelayer',
        name: 'ground',
        width: w,
        height: h,
        data: Array<number>(w * h).fill(1),
      },
    ],
  };
}

/** Corridor with one impassable cell (water layer with passable: false). */
function corridorWithWater(width: number, waterX: number): TiledMapLike {
  const ground: number[] = Array<number>(width).fill(1);
  const water: number[] = Array<number>(width).fill(0);
  water[waterX] = 1;
  return {
    width,
    height: 1,
    tilewidth: 32,
    tileheight: 32,
    layers: [
      {
        type: 'tilelayer',
        name: 'ground',
        width,
        height: 1,
        data: ground,
      },
      {
        type: 'tilelayer',
        name: 'water',
        width,
        height: 1,
        data: water,
        properties: [{ name: 'passable', value: false }],
      },
    ],
  };
}

/** Stub store matching `BuildingStoreLike`. */
function makeStore(initial: number): BuildingStoreLike & { setGold(n: number): void } {
  let gold = initial;
  return {
    get gold() {
      return gold;
    },
    spendGold(n: number) {
      if (gold < n) return false;
      gold -= n;
      return true;
    },
    setGold(n: number) {
      gold = n;
    },
  };
}

describe('BuildingSystem — placement validity', () => {
  it('places a wall on an empty walkable cell, debits gold, emits wall:built', () => {
    const map = corridor(5);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const store = makeStore(def.buildCost.gold * 2);
    const sys = new BuildingSystem({ def, pathfinding: pf, emitter, store });
    const onBuilt = vi.fn();
    emitter.on(GameEvents.WallBuilt, onBuilt);

    expect(pf.isWalkable(1, 0)).toBe(true);
    const result = sys.tryPlaceWall({ x: 1, y: 0 });

    expect(result).toEqual({
      ok: true,
      cell: { x: 1, y: 0 },
      cost: def.buildCost.gold,
    });
    expect(store.gold).toBe(def.buildCost.gold);
    expect(onBuilt).toHaveBeenCalledTimes(1);
    expect(onBuilt).toHaveBeenCalledWith({ x: 1, y: 0 });
    // Pathfinding's listener flipped the cell.
    expect(pf.isWalkable(1, 0)).toBe(false);
    expect(sys.hasWallAt({ x: 1, y: 0 })).toBe(true);
  });

  it('rejects out-of-bounds cells without spending gold', () => {
    const map = corridor(3);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const store = makeStore(1000);
    const sys = new BuildingSystem({ def, pathfinding: pf, emitter, store });
    const onBuilt = vi.fn();
    emitter.on(GameEvents.WallBuilt, onBuilt);

    expect(sys.tryPlaceWall({ x: -1, y: 0 })).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    });
    expect(sys.tryPlaceWall({ x: 99, y: 0 })).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    });
    expect(store.gold).toBe(1000);
    expect(onBuilt).not.toHaveBeenCalled();
  });

  it('rejects already-occupied cells (double-place) without re-spending', () => {
    const map = corridor(5);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const store = makeStore(def.buildCost.gold * 5);
    const sys = new BuildingSystem({ def, pathfinding: pf, emitter, store });
    const onBuilt = vi.fn();
    emitter.on(GameEvents.WallBuilt, onBuilt);

    const first = sys.tryPlaceWall({ x: 1, y: 0 });
    expect(first.ok).toBe(true);
    const goldAfterFirst = store.gold;

    const second = sys.tryPlaceWall({ x: 1, y: 0 });
    expect(second).toEqual({ ok: false, reason: 'occupied' });
    expect(store.gold).toBe(goldAfterFirst);
    expect(onBuilt).toHaveBeenCalledTimes(1);
  });

  it('rejects impassable base terrain (water) without spending gold', () => {
    const map = corridorWithWater(3, 1);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const store = makeStore(1000);
    const sys = new BuildingSystem({ def, pathfinding: pf, emitter, store });
    const onBuilt = vi.fn();
    emitter.on(GameEvents.WallBuilt, onBuilt);

    expect(pf.isWalkable(1, 0)).toBe(false);
    const result = sys.tryPlaceWall({ x: 1, y: 0 });

    expect(result).toEqual({ ok: false, reason: 'impassable' });
    expect(store.gold).toBe(1000);
    expect(onBuilt).not.toHaveBeenCalled();
  });

  it('rejects placement on the fort-core cell when configured', () => {
    const map = field(3, 1);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const store = makeStore(1000);
    const sys = new BuildingSystem({
      def,
      pathfinding: pf,
      emitter,
      store,
      fortCore: { x: 2, y: 0 },
    });

    expect(sys.tryPlaceWall({ x: 2, y: 0 })).toEqual({
      ok: false,
      reason: 'fort-core',
    });
    expect(store.gold).toBe(1000);
  });
});

describe('BuildingSystem — economy', () => {
  it('rejects with insufficient-gold (needed/have) and leaves the store untouched', () => {
    const map = corridor(3);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const have = def.buildCost.gold - 1;
    const store = makeStore(have);
    const sys = new BuildingSystem({ def, pathfinding: pf, emitter, store });
    const onBuilt = vi.fn();
    emitter.on(GameEvents.WallBuilt, onBuilt);

    const result = sys.tryPlaceWall({ x: 1, y: 0 });

    expect(result).toEqual({
      ok: false,
      reason: 'insufficient-gold',
      needed: def.buildCost.gold,
      have,
    });
    expect(store.gold).toBe(have);
    expect(pf.isWalkable(1, 0)).toBe(true);
    expect(onBuilt).not.toHaveBeenCalled();
  });

  it('reads buildCost from the def (data-driven, no hardcoded magic)', () => {
    const customDef: WallDef = {
      ...def,
      id: 'wall-test',
      buildCost: { gold: 99 },
    };
    const map = corridor(3);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const store = makeStore(150);
    const sys = new BuildingSystem({ def: customDef, pathfinding: pf, emitter, store });

    const result = sys.tryPlaceWall({ x: 1, y: 0 });

    expect(result).toEqual({ ok: true, cell: { x: 1, y: 0 }, cost: 99 });
    expect(store.gold).toBe(150 - 99);
  });
});

describe('BuildingSystem — path-critical (would-trap) check', () => {
  it('rejects placement that would trap the fort (single corridor)', () => {
    // 5-cell corridor: spawn at (0,0), fort at (4,0). Walling (2,0) blocks
    // the only route → would-trap-fort.
    const map = corridor(5);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const store = makeStore(1000);
    const sys = new BuildingSystem({
      def,
      pathfinding: pf,
      emitter,
      store,
      fortCore: { x: 4, y: 0 },
      spawns: [{ x: 0, y: 0 }],
    });
    const onBuilt = vi.fn();
    emitter.on(GameEvents.WallBuilt, onBuilt);

    const result = sys.tryPlaceWall({ x: 2, y: 0 });

    expect(result).toEqual({ ok: false, reason: 'would-trap-fort' });
    // Revert worked — cell remains walkable.
    expect(pf.isWalkable(2, 0)).toBe(true);
    expect(store.gold).toBe(1000);
    expect(onBuilt).not.toHaveBeenCalled();
  });

  it('allows placement when a detour is available', () => {
    // 5x2 field: blocking (2,0) still leaves row 1 as a detour.
    const map = field(5, 2);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const store = makeStore(1000);
    const sys = new BuildingSystem({
      def,
      pathfinding: pf,
      emitter,
      store,
      fortCore: { x: 4, y: 0 },
      spawns: [{ x: 0, y: 0 }],
    });

    const result = sys.tryPlaceWall({ x: 2, y: 0 });

    expect(result.ok).toBe(true);
    expect(pf.isWalkable(2, 0)).toBe(false);
  });

  it('skips the trap check when fortCore or spawns are not provided', () => {
    // Same single-corridor case — without fortCore/spawns the trap
    // pre-check is deferred and placement succeeds.
    const map = corridor(5);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const store = makeStore(1000);
    const sys = new BuildingSystem({ def, pathfinding: pf, emitter, store });

    const result = sys.tryPlaceWall({ x: 2, y: 0 });

    expect(result.ok).toBe(true);
    expect(pf.isWalkable(2, 0)).toBe(false);
  });

  it('rejects when ANY spawn cannot reach the fort (multi-spawn semantics)', () => {
    // 5x1 corridor; two spawns on the same side; blocking (2,0) traps both.
    const map = corridor(5);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const store = makeStore(1000);
    const sys = new BuildingSystem({
      def,
      pathfinding: pf,
      emitter,
      store,
      fortCore: { x: 4, y: 0 },
      spawns: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    });

    expect(sys.tryPlaceWall({ x: 2, y: 0 })).toEqual({
      ok: false,
      reason: 'would-trap-fort',
    });
    expect(pf.isWalkable(2, 0)).toBe(true);
  });
});

describe('BuildingSystem — hasWallAt', () => {
  it('reports false before placement, true after', () => {
    const map = corridor(3);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const store = makeStore(def.buildCost.gold);
    const sys = new BuildingSystem({ def, pathfinding: pf, emitter, store });

    expect(sys.hasWallAt({ x: 1, y: 0 })).toBe(false);
    sys.tryPlaceWall({ x: 1, y: 0 });
    expect(sys.hasWallAt({ x: 1, y: 0 })).toBe(true);
    expect(sys.hasWallAt({ x: 2, y: 0 })).toBe(false);
  });
});
