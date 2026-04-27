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

describe('BuildingSystem — tryRepairWall', () => {
  function placeOne(): {
    sys: BuildingSystem;
    pf: Pathfinding;
    store: ReturnType<typeof makeStore>;
    emitter: SimpleEventEmitter;
    cell: { x: number; y: number };
  } {
    const map = corridor(5);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const store = makeStore(def.buildCost.gold * 50);
    const sys = new BuildingSystem({ def, pathfinding: pf, emitter, store });
    const cell = { x: 1, y: 0 };
    const r = sys.tryPlaceWall(cell);
    if (!r.ok) throw new Error(`fixture: placement failed: ${r.reason}`);
    return { sys, pf, store, emitter, cell };
  }

  it('repairs a damaged wall, debits per-HP gold, restores HP', () => {
    const { sys, store, cell } = placeOne();
    const building = sys.buildingAt(cell);
    if (!building) throw new Error('expected building');

    building.breakable.applyDamage(30);
    expect(building.breakable.hp).toBe(def.hp - 30);

    const goldBefore = store.gold;
    const result = sys.tryRepairWall(cell, 10);

    expect(result).toEqual({
      ok: true,
      cell,
      hpRestored: 10,
      cost: 10 * def.repairCost.goldPerHp,
    });
    expect(building.breakable.hp).toBe(def.hp - 20);
    expect(store.gold).toBe(goldBefore - 10 * def.repairCost.goldPerHp);
  });

  it('caps hpRestored at the missing HP and only debits for what was applied', () => {
    const { sys, store, cell } = placeOne();
    const building = sys.buildingAt(cell)!;
    building.breakable.applyDamage(5); // missing 5 HP
    const goldBefore = store.gold;

    const result = sys.tryRepairWall(cell, 100);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hpRestored).toBe(5);
    expect(result.cost).toBe(5 * def.repairCost.goldPerHp);
    expect(building.breakable.hp).toBe(def.hp);
    expect(store.gold).toBe(goldBefore - 5 * def.repairCost.goldPerHp);
  });

  it('rejects at-max-hp without spending gold', () => {
    const { sys, store, cell } = placeOne();
    const goldBefore = store.gold;

    const result = sys.tryRepairWall(cell, 10);

    expect(result).toEqual({ ok: false, reason: 'at-max-hp' });
    expect(store.gold).toBe(goldBefore);
  });

  it('rejects insufficient-gold without applying any heal', () => {
    const { sys, store, cell } = placeOne();
    const building = sys.buildingAt(cell)!;
    building.breakable.applyDamage(50);
    const hpBefore = building.breakable.hp;
    store.setGold(1);

    const result = sys.tryRepairWall(cell, 50);

    expect(result).toEqual({
      ok: false,
      reason: 'insufficient-gold',
      needed: 50 * def.repairCost.goldPerHp,
      have: 1,
    });
    expect(store.gold).toBe(1);
    expect(building.breakable.hp).toBe(hpBefore);
  });

  it('rejects bad-amount for zero, negative, or non-integer requests', () => {
    const { sys, cell } = placeOne();
    const building = sys.buildingAt(cell)!;
    building.breakable.applyDamage(20);

    expect(sys.tryRepairWall(cell, 0)).toEqual({ ok: false, reason: 'bad-amount' });
    expect(sys.tryRepairWall(cell, -5)).toEqual({ ok: false, reason: 'bad-amount' });
    expect(sys.tryRepairWall(cell, 1.5)).toEqual({ ok: false, reason: 'bad-amount' });
  });

  it('rejects not-a-wall on cells with no placed wall', () => {
    const { sys } = placeOne();
    expect(sys.tryRepairWall({ x: 4, y: 0 }, 5)).toEqual({
      ok: false,
      reason: 'not-a-wall',
    });
  });

  it('cleans up + emits wall:destroyed end-to-end (Pathfinding restored)', () => {
    const { sys, pf, emitter, cell } = placeOne();
    const onDestroyed = vi.fn();
    emitter.on(GameEvents.WallDestroyed, onDestroyed);

    const building = sys.buildingAt(cell)!;
    expect(pf.isWalkable(cell.x, cell.y)).toBe(false);

    building.breakable.applyDamage(def.hp + 50);

    expect(onDestroyed).toHaveBeenCalledTimes(1);
    expect(onDestroyed).toHaveBeenCalledWith(cell);
    expect(pf.isWalkable(cell.x, cell.y)).toBe(true);
    expect(sys.hasWallAt(cell)).toBe(false);
    expect(sys.tryRepairWall(cell, 10)).toEqual({ ok: false, reason: 'not-a-wall' });
  });

  it('reads repair cost from def (data-driven, no hardcoded magic)', () => {
    const customDef: WallDef = {
      ...def,
      id: 'wall-test',
      repairCost: { goldPerHp: 7 },
    };
    const map = corridor(5);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const store = makeStore(1000);
    const sys = new BuildingSystem({ def: customDef, pathfinding: pf, emitter, store });
    const cell = { x: 1, y: 0 };
    expect(sys.tryPlaceWall(cell).ok).toBe(true);

    sys.buildingAt(cell)!.breakable.applyDamage(20);

    const result = sys.tryRepairWall(cell, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hpRestored).toBe(4);
    expect(result.cost).toBe(28);
  });
});

describe('BuildingSystem — wall:damaged forwarder (#30)', () => {
  it('forwards a placed wall\'s `damaged` event to the shared bus with grid coords', () => {
    const map = corridor(5);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const store = makeStore(def.buildCost.gold * 5);
    const sys = new BuildingSystem({ def, pathfinding: pf, emitter, store });
    const cell = { x: 1, y: 0 };
    expect(sys.tryPlaceWall(cell).ok).toBe(true);

    const onDamaged = vi.fn();
    emitter.on(GameEvents.WallDamaged, onDamaged);

    const wall = sys.buildingAt(cell)!;
    wall.breakable.applyDamage(15);

    expect(onDamaged).toHaveBeenCalledTimes(1);
    expect(onDamaged).toHaveBeenCalledWith({
      x: 1,
      y: 0,
      hp: def.hp - 15,
      maxHp: def.hp,
    });
  });

  it('does NOT emit `wall:damaged` for the killing blow (only `wall:destroyed`)', () => {
    const map = corridor(3);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const store = makeStore(def.buildCost.gold * 5);
    const sys = new BuildingSystem({ def, pathfinding: pf, emitter, store });
    const cell = { x: 1, y: 0 };
    sys.tryPlaceWall(cell);

    const onDamaged = vi.fn();
    const onDestroyed = vi.fn();
    emitter.on(GameEvents.WallDamaged, onDamaged);
    emitter.on(GameEvents.WallDestroyed, onDestroyed);

    sys.buildingAt(cell)!.breakable.applyDamage(def.hp + 50);

    expect(onDestroyed).toHaveBeenCalledTimes(1);
    expect(onDamaged).not.toHaveBeenCalled();
  });
});

describe('BuildingSystem — tryAutoRepairWall (#30)', () => {
  function placeOne(): {
    sys: BuildingSystem;
    pf: Pathfinding;
    store: ReturnType<typeof makeStore>;
    emitter: SimpleEventEmitter;
    cell: { x: number; y: number };
  } {
    const map = corridor(5);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const store = makeStore(def.buildCost.gold * 50);
    const sys = new BuildingSystem({ def, pathfinding: pf, emitter, store });
    const cell = { x: 1, y: 0 };
    const r = sys.tryPlaceWall(cell);
    if (!r.ok) throw new Error(`fixture: placement failed: ${r.reason}`);
    return { sys, pf, store, emitter, cell };
  }

  it('debits the unit-supplied flat cost (not per-HP) and heals up to hpAmount', () => {
    const { sys, store, cell } = placeOne();
    const building = sys.buildingAt(cell)!;
    building.breakable.applyDamage(30);

    const goldBefore = store.gold;
    const result = sys.tryAutoRepairWall(cell, 8, 1);

    expect(result).toEqual({
      ok: true,
      cell,
      hpRestored: 8,
      cost: 1,
    });
    expect(building.breakable.hp).toBe(def.hp - 22);
    // Flat cost — independent of hp restored.
    expect(store.gold).toBe(goldBefore - 1);
  });

  it('caps hpRestored at the missing HP', () => {
    const { sys, store, cell } = placeOne();
    const building = sys.buildingAt(cell)!;
    building.breakable.applyDamage(3);
    const goldBefore = store.gold;

    const result = sys.tryAutoRepairWall(cell, 50, 2);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hpRestored).toBe(3);
    expect(result.cost).toBe(2);
    expect(building.breakable.hp).toBe(def.hp);
    // Flat cost is debited even though we restored < hpAmount HP.
    expect(store.gold).toBe(goldBefore - 2);
  });

  it('rejects insufficient-gold without applying any heal', () => {
    const { sys, store, cell } = placeOne();
    const building = sys.buildingAt(cell)!;
    building.breakable.applyDamage(20);
    const hpBefore = building.breakable.hp;
    store.setGold(0);

    const result = sys.tryAutoRepairWall(cell, 8, 5);

    expect(result).toEqual({
      ok: false,
      reason: 'insufficient-gold',
      needed: 5,
      have: 0,
    });
    expect(store.gold).toBe(0);
    expect(building.breakable.hp).toBe(hpBefore);
  });

  it('rejects bad-amount / bad-cost / at-max-hp / not-a-wall', () => {
    const { sys, cell } = placeOne();
    expect(sys.tryAutoRepairWall(cell, 8, 1)).toEqual({ ok: false, reason: 'at-max-hp' });

    sys.buildingAt(cell)!.breakable.applyDamage(10);
    expect(sys.tryAutoRepairWall(cell, 0, 1)).toEqual({ ok: false, reason: 'bad-amount' });
    expect(sys.tryAutoRepairWall(cell, -1, 1)).toEqual({ ok: false, reason: 'bad-amount' });
    expect(sys.tryAutoRepairWall(cell, 1.5, 1)).toEqual({ ok: false, reason: 'bad-amount' });
    expect(sys.tryAutoRepairWall(cell, 1, -1)).toEqual({ ok: false, reason: 'bad-cost' });
    expect(sys.tryAutoRepairWall(cell, 1, 1.5)).toEqual({ ok: false, reason: 'bad-cost' });

    expect(sys.tryAutoRepairWall({ x: 4, y: 0 }, 5, 1)).toEqual({
      ok: false,
      reason: 'not-a-wall',
    });
  });

  it('accepts costGold === 0 as a no-cost auto-repair', () => {
    const { sys, store, cell } = placeOne();
    sys.buildingAt(cell)!.breakable.applyDamage(10);
    const goldBefore = store.gold;

    const result = sys.tryAutoRepairWall(cell, 5, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cost).toBe(0);
    expect(store.gold).toBe(goldBefore);
  });
});
