import { describe, it, expect, beforeEach } from 'vitest';
import {
  SpriteBinder,
  SpriteColors,
  type RectangleLike,
  type RectangleFactoryLike,
} from '@/game/scenes/sprite-binder';
import {
  AISystem,
  BuildingSystem,
  DamageSystem,
  GameEvents,
  Pathfinding,
  type TiledMapLike,
} from '@/game/systems';
import {
  Damageable,
  SimpleEventEmitter,
  type EventEmitterLike,
} from '@/game/components';
import { Hero } from '@/game/entities/Hero';
import { Orc } from '@/game/entities/Orc';
import { Human } from '@/game/entities/Human';
import { Building } from '@/game/entities/Building';
import { TILE_SIZE } from '@/game/config/tile';

import m1Slice from '@/data/maps/m1-slice.json';
import peasantLevy from '@/data/humans/peasant-levy.json';
import grunt from '@/data/orcs/grunt.json';
import wallWood from '@/data/buildings/wall-wood.json';
import bruteJson from '@/data/heroes/brute.json';
import type {
  HeroDef,
  UnitDef,
  WallDef,
} from '@/types';

/**
 * Sprite binder unit tests — the binder owns the visual placeholder
 * layer for the M1 vertical slice. Tests run in jsdom with a fake
 * `RectangleLike` so Phaser's canvas init is never touched.
 */

class FakeRectangle implements RectangleLike {
  static all: FakeRectangle[] = [];
  static reset(): void {
    FakeRectangle.all = [];
  }
  destroyed = false;
  fillColor: number;
  fillAlpha = 1;
  depth = 0;

  constructor(
    public x: number,
    public y: number,
    public width: number,
    public height: number,
    fillColor: number,
  ) {
    this.fillColor = fillColor;
    FakeRectangle.all.push(this);
  }

  setPosition(x: number, y: number): RectangleLike {
    this.x = x;
    this.y = y;
    return this;
  }

  setFillStyle(color?: number, alpha?: number): RectangleLike {
    if (color !== undefined) this.fillColor = color;
    if (alpha !== undefined) this.fillAlpha = alpha;
    return this;
  }

  setDepth(depth: number): RectangleLike {
    this.depth = depth;
    return this;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

const factory: RectangleFactoryLike = (x, y, w, h, color) =>
  new FakeRectangle(x, y, w, h, color ?? 0);

interface Harness {
  bus: EventEmitterLike;
  binder: SpriteBinder;
  ai: AISystem;
  building: BuildingSystem;
  pathfinding: Pathfinding;
}

class FakeStore {
  gold = 100;
  spendGold(n: number): boolean {
    if (this.gold < n) return false;
    this.gold -= n;
    return true;
  }
  addGold(n: number): void {
    this.gold += n;
  }
}

function buildHarness(): Harness {
  const bus = new SimpleEventEmitter();
  const map = m1Slice as TiledMapLike;
  const pathfinding = new Pathfinding(map, bus);
  const damage = new DamageSystem({ emitter: bus });
  const store = new FakeStore();

  const fortDamageable = new Damageable({ hp: 5000, armor: 0, emitter: bus });
  const fortCore = { x: 30, y: 11 };

  const building = new BuildingSystem({
    def: wallWood as WallDef,
    pathfinding,
    emitter: bus,
    store,
    fortCore,
    spawns: [
      { x: 19, y: 0 },
      { x: 19, y: 22 },
      { x: 0, y: 11 },
    ],
  });

  const wallAt = (x: number, y: number) => building.buildingAt({ x, y }) ?? null;

  const ai = new AISystem({
    pathfinding,
    damage,
    rally: { x: 27, y: 11 },
    fortGoal: fortCore,
    pathEmitter: bus,
    aggroRadius: 8 * pathfinding.tileWidth,
    secondsPerMeleeAttack: 0.5,
    wallAt,
  });

  const binder = new SpriteBinder({
    rectangleFactory: factory,
    emitter: bus,
    ai,
    building,
  });

  // Suppress unused-var on fortDamageable (smoke fixture parity).
  void fortDamageable;

  return { bus, binder, ai, building, pathfinding };
}

beforeEach(() => {
  FakeRectangle.reset();
});

describe('SpriteBinder — entity rectangles', () => {
  it('binds a hero rectangle at the rally cell', () => {
    const h = buildHarness();
    const hero = Hero.fromDef(bruteJson as HeroDef);
    h.binder.bindHero(hero, { x: 27, y: 11 });
    expect(h.binder.counts.hero).toBe(1);
    expect(FakeRectangle.all.length).toBe(1);
    expect(FakeRectangle.all[0]?.fillColor).toBe(SpriteColors.hero);
    // Centre-of-cell mapping for cell (27, 11) at TILE_SIZE 32 → (27*32+16, 11*32+16) = (880, 368)
    expect(FakeRectangle.all[0]?.x).toBe(27 * TILE_SIZE + TILE_SIZE / 2);
    expect(FakeRectangle.all[0]?.y).toBe(11 * TILE_SIZE + TILE_SIZE / 2);
  });

  it('binds an orc rectangle and updates position on tick', () => {
    const h = buildHarness();
    const orc = Orc.fromDef(grunt as UnitDef);
    h.ai.registerOrc({ entity: orc, cell: { x: 5, y: 5 } });
    h.binder.bindOrc(orc);
    expect(h.binder.counts.orcs).toBe(1);

    const rect = FakeRectangle.all[0]!;
    expect(rect.fillColor).toBe(SpriteColors.orc);

    // Mutate the AI behaviour cell directly — this is what AI.tickOrc does.
    const behavior = h.ai.orcBehavior(orc)!;
    behavior.cell = { x: 6, y: 7 };
    h.binder.tick();
    expect(rect.x).toBe(6 * TILE_SIZE + TILE_SIZE / 2);
    expect(rect.y).toBe(7 * TILE_SIZE + TILE_SIZE / 2);
  });

  it('binds a human and destroys the rectangle on death', () => {
    const h = buildHarness();
    const human = Human.fromDef(peasantLevy as UnitDef);
    h.ai.registerHuman({ entity: human, cell: { x: 0, y: 11 } });
    h.binder.bindHuman(human);
    expect(h.binder.counts.humans).toBe(1);

    const rect = FakeRectangle.all[0]!;
    expect(rect.fillColor).toBe(SpriteColors.human);

    // Kill the human via its emitter (Damageable.applyDamage is the
    // production path; emitting directly is equivalent for the rectangle
    // teardown contract).
    human.damageable.applyDamage(human.damageable.maxHp);
    expect(rect.destroyed).toBe(true);
    expect(h.binder.counts.humans).toBe(0);
  });

  it('binds a wall rectangle on wall:built and tears down on wall:destroyed', () => {
    const h = buildHarness();
    // Place a wall via the BuildingSystem so the bus events fire.
    const result = h.building.tryPlaceWall({ x: 25, y: 11 });
    expect(result.ok).toBe(true);
    expect(h.binder.counts.walls).toBe(1);

    const rect = FakeRectangle.all[0]!;
    expect(rect.fillColor).toBe(SpriteColors.wallPristine);

    // Destroy the wall — Building's emitter fires WallDestroyed which
    // BuildingSystem also fans onto the shared bus.
    const wall = h.building.buildingAt({ x: 25, y: 11 })!;
    wall.breakable.applyDamage(wall.breakable.maxHp);
    expect(rect.destroyed).toBe(true);
    expect(h.binder.counts.walls).toBe(0);
  });

  it('cycles wall tint through pristine → cracked → crumbling', () => {
    const h = buildHarness();
    // Use a Building entity directly so we can drive HP precisely
    // without going through BuildingSystem's spend/place flow.
    const wall = Building.fromDef(wallWood as WallDef, undefined, {
      x: 10,
      y: 10,
    });
    h.binder.bindWall(wall);
    const rect = FakeRectangle.all[0]!;
    expect(rect.fillColor).toBe(SpriteColors.wallPristine);
    expect(wall.breakable.currentDamageState()).toBe('pristine');

    // Damage to ~50% — between thresholds → 'cracked' band.
    const half = Math.ceil(wall.breakable.maxHp / 2);
    wall.breakable.applyDamage(half);
    expect(wall.breakable.currentDamageState()).toBe('cracked');
    expect(rect.fillColor).toBe(SpriteColors.wallCracked);

    // Damage further so fraction drops below 0.33 → 'crumbling' band.
    // Stop short of death (HP 17 of 100 = 0.17 < 0.33).
    wall.breakable.applyDamage(33);
    expect(wall.breakable.dead).toBe(false);
    expect(wall.breakable.currentDamageState()).toBe('crumbling');
    expect(rect.fillColor).toBe(SpriteColors.wallCrumbling);
  });

  it('destroy() tears down every tracked rectangle and listener', () => {
    const h = buildHarness();
    const hero = Hero.fromDef(bruteJson as HeroDef);
    const orc = Orc.fromDef(grunt as UnitDef);
    const human = Human.fromDef(peasantLevy as UnitDef);
    h.ai.registerOrc({ entity: orc, cell: { x: 5, y: 5 } });
    h.ai.registerHuman({ entity: human, cell: { x: 0, y: 11 } });
    h.binder.bindHero(hero, { x: 27, y: 11 });
    h.binder.bindOrc(orc);
    h.binder.bindHuman(human);
    h.building.tryPlaceWall({ x: 26, y: 11 });

    expect(h.binder.counts).toEqual({
      hero: 1,
      orcs: 1,
      humans: 1,
      walls: 1,
      projectiles: 0,
    });

    h.binder.destroy();

    expect(h.binder.counts).toEqual({
      hero: 0,
      orcs: 0,
      humans: 0,
      walls: 0,
      projectiles: 0,
    });
    for (const r of FakeRectangle.all) {
      expect(r.destroyed).toBe(true);
    }
  });

  it('binds a projectile dot and destroys it when isDone reports true', () => {
    const h = buildHarness();
    let pos = { x: 100, y: 100 };
    let done = false;
    const rect = h.binder.bindProjectile({
      getPosition: () => pos,
      isDone: () => done,
    }) as FakeRectangle;
    expect(rect.fillColor).toBe(SpriteColors.projectile);
    expect(h.binder.counts.projectiles).toBe(1);

    pos = { x: 150, y: 110 };
    h.binder.tick();
    expect(rect.x).toBe(150);
    expect(rect.y).toBe(110);

    done = true;
    h.binder.tick();
    expect(rect.destroyed).toBe(true);
    expect(h.binder.counts.projectiles).toBe(0);
  });

  it('does not double-bind a wall placed twice via the bus', () => {
    const h = buildHarness();
    h.building.tryPlaceWall({ x: 25, y: 11 });
    // Re-fire wall:built manually — binder must dedupe per cell.
    h.bus.emit(GameEvents.WallBuilt, { x: 25, y: 11 });
    expect(h.binder.counts.walls).toBe(1);
  });
});
