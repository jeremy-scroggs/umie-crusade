/**
 * sprite-binder — visual placeholder layer for the M1 vertical slice (#29).
 *
 * Binds every M1 entity (hero, orcs, humans, walls, towers, projectiles)
 * to a coloured `Phaser.GameObjects.Rectangle` so the live `GameScene`
 * actually shows the systems doing things in the browser. Placeholder
 * rectangles only — no atlases, no art assets, no VFX.
 *
 * Design notes:
 *   - Pure factory + class: jsdom-safe. The binder accepts a
 *     `RectangleFactoryLike` so tests can pass a fake instead of a real
 *     `Phaser.Scene.add.rectangle` call.
 *   - Position is read from the `AISystem` per-entity behavior records on
 *     `tick()`. Hero/walls don't move — they stay at the cell they were
 *     bound to.
 *   - Death is wired through each entity's own `'died'` event (Damageable
 *     contract). Wall `'damage-state-changed'` drives the wall tint cycle.
 *   - Wall additions/removals come off the shared bus (`wall:built` /
 *     `wall:destroyed`) — same channel BuildingSystem emits on. The
 *     binder reads the actual `Building` via `BuildingSystem.buildingAt`
 *     so it can subscribe to per-wall events.
 *   - Skull counting is NOT a sprite-binder concern. The scene bootstrap
 *     wires that via its `onHumanSpawned` option (additive in #29).
 *
 * Visual constants below are STRUCTURAL placeholders, NOT balance — they
 * tint a rectangle for player visibility. Sizes derive from `TILE_SIZE`.
 */
import type {
  AISystem,
  BuildingSystem,
  HumanBehavior,
  OrcBehavior,
} from '@/game/systems';
import {
  GameEvents,
  type WallEventPayload,
} from '@/game/systems';
import type { EventEmitterLike } from '@/game/components';
import type { Hero } from '@/game/entities/Hero';
import type { Orc } from '@/game/entities/Orc';
import type { Human } from '@/game/entities/Human';
import type { Building } from '@/game/entities/Building';
import { TILE_HALF, TILE_SIZE } from '@/game/config/tile';

/**
 * Colour palette — placeholder visual constants. These are NOT balance;
 * they only tint placeholder rectangles for the M1 vertical slice. When
 * art assets land (M2+) these come out and get replaced with sprite
 * atlases.
 */
export const SpriteColors = {
  hero: 0xffd24a, // bright yellow — easy to spot the player avatar
  orc: 0x3aaa3a, // green — Bloodrock orcs
  human: 0xf0f0f0, // off-white — Umie crusaders
  wallPristine: 0x8b5a2b, // brown — pristine wall
  wallCracked: 0x6e4621, // darker brown — cracked wall
  wallCrumbling: 0x4a2f17, // darkest brown — crumbling wall
  ballista: 0x808080, // grey — towers / ballistas (placeholder)
  projectile: 0xffffff, // small white dot — projectiles
} as const;

/**
 * Visual sizing hints. Entities take a full tile minus a small inset so
 * the grid stays readable. Projectiles are dot-sized (a quarter tile).
 */
const ENTITY_INSET = 4;
const ENTITY_SIZE = TILE_SIZE - ENTITY_INSET;
const PROJECTILE_SIZE = Math.max(2, Math.round(TILE_SIZE / 4));

/**
 * Minimal subset of `Phaser.GameObjects.Rectangle` the binder uses.
 * Tests pass a fake; production passes the live Phaser rectangle.
 */
export interface RectangleLike {
  x: number;
  y: number;
  fillColor: number;
  fillAlpha: number;
  setPosition(x: number, y: number): RectangleLike;
  setFillStyle(color?: number, alpha?: number): RectangleLike;
  setDepth(depth: number): RectangleLike;
  destroy(): void;
}

/**
 * Factory shape — `Phaser.Scene.add.rectangle` matches structurally
 * (Phaser's signature is `(x, y, width, height, fillColor?, alpha?)`).
 */
export type RectangleFactoryLike = (
  x: number,
  y: number,
  width: number,
  height: number,
  fillColor?: number,
  fillAlpha?: number,
) => RectangleLike;

export interface SpriteBinderOptions {
  /** Factory producing rectangles bound to the live scene. */
  rectangleFactory: RectangleFactoryLike;
  /** Shared system bus — same emitter every system fans out on. */
  emitter: EventEmitterLike;
  /** AI system — used to read per-entity tile positions on `tick()`. */
  ai: AISystem;
  /** Building system — used to look up `Building` on `wall:built`. */
  building: BuildingSystem;
  /** Override the tile-pixel size (defaults to `TILE_SIZE`). */
  tileSize?: number;
}

interface UnitTracker<E, B> {
  entity: E;
  behavior: B;
  rect: RectangleLike;
  /** Unsubscribe the per-entity 'died' listener on destroy. */
  offDied: () => void;
}

interface WallTracker {
  building: Building;
  rect: RectangleLike;
  offDamageStateChanged: () => void;
  offDestroyed: () => void;
}

/**
 * Convert a tile-cell to the pixel centre — every rectangle anchors at
 * its centre by Phaser convention.
 */
function cellToCentre(
  cellX: number,
  cellY: number,
  tileSize: number,
): { x: number; y: number } {
  return {
    x: cellX * tileSize + tileSize / 2,
    y: cellY * tileSize + tileSize / 2,
  };
}

/** Pristine = solid; cracked = darker; crumbling = darkest. */
function colorForWall(building: Building): number {
  const state = building.breakable.currentDamageState();
  switch (state) {
    case 'pristine':
      return SpriteColors.wallPristine;
    case 'cracked':
      return SpriteColors.wallCracked;
    case 'crumbling':
      return SpriteColors.wallCrumbling;
  }
}

export class SpriteBinder {
  readonly emitter: EventEmitterLike;
  readonly ai: AISystem;
  readonly building: BuildingSystem;
  readonly tileSize: number;

  private readonly factory: RectangleFactoryLike;
  private readonly offWallBuilt: () => void;
  private readonly offWallDestroyed: () => void;

  private hero: { entity: Hero; rect: RectangleLike; offDied: () => void } | null = null;
  private readonly orcs = new Map<Orc, UnitTracker<Orc, OrcBehavior>>();
  private readonly humans = new Map<Human, UnitTracker<Human, HumanBehavior>>();
  private readonly walls = new Map<string, WallTracker>();

  constructor(opts: SpriteBinderOptions) {
    this.factory = opts.rectangleFactory;
    this.emitter = opts.emitter;
    this.ai = opts.ai;
    this.building = opts.building;
    this.tileSize = opts.tileSize ?? TILE_SIZE;

    const onWallBuilt = (...args: unknown[]) => {
      const payload = args[0] as WallEventPayload | undefined;
      if (!payload) return;
      const b = this.building.buildingAt({ x: payload.x, y: payload.y });
      if (!b) return;
      this.bindWall(b);
    };
    this.emitter.on(GameEvents.WallBuilt, onWallBuilt);
    this.offWallBuilt = () => this.emitter.off(GameEvents.WallBuilt, onWallBuilt);

    const onWallDestroyed = (...args: unknown[]) => {
      const payload = args[0] as WallEventPayload | undefined;
      if (!payload) return;
      this.unbindWall(payload.x, payload.y);
    };
    this.emitter.on(GameEvents.WallDestroyed, onWallDestroyed);
    this.offWallDestroyed = () =>
      this.emitter.off(GameEvents.WallDestroyed, onWallDestroyed);
  }

  /**
   * Bind a hero entity to a rectangle parked at `cell`. Only one hero is
   * tracked at a time — the binder's hero slot is single-tenant for M1.
   */
  bindHero(hero: Hero, cell: { x: number; y: number }): void {
    if (this.hero) return;
    const { x, y } = cellToCentre(cell.x, cell.y, this.tileSize);
    const rect = this.factory(
      x,
      y,
      ENTITY_SIZE,
      ENTITY_SIZE,
      SpriteColors.hero,
    );
    rect.setDepth(2);
    const onDied = () => {
      rect.destroy();
      this.hero = null;
    };
    hero.emitter.on('died', onDied);
    this.hero = {
      entity: hero,
      rect,
      offDied: () => hero.emitter.off('died', onDied),
    };
  }

  /** Bind an orc entity. Position is updated each `tick()` from AI behavior. */
  bindOrc(orc: Orc): void {
    const behavior = this.ai.orcBehavior(orc);
    if (!behavior) return;
    const { x, y } = cellToCentre(behavior.cell.x, behavior.cell.y, this.tileSize);
    const rect = this.factory(
      x,
      y,
      ENTITY_SIZE,
      ENTITY_SIZE,
      SpriteColors.orc,
    );
    rect.setDepth(1);
    const onDied = () => {
      rect.destroy();
      this.orcs.delete(orc);
    };
    orc.emitter.on('died', onDied);
    this.orcs.set(orc, {
      entity: orc,
      behavior,
      rect,
      offDied: () => orc.emitter.off('died', onDied),
    });
  }

  /** Bind a human entity. Position is updated each `tick()` from AI behavior. */
  bindHuman(human: Human): void {
    const behavior = this.ai.humanBehavior(human);
    if (!behavior) return;
    const { x, y } = cellToCentre(behavior.cell.x, behavior.cell.y, this.tileSize);
    const rect = this.factory(
      x,
      y,
      ENTITY_SIZE,
      ENTITY_SIZE,
      SpriteColors.human,
    );
    rect.setDepth(1);
    const onDied = () => {
      rect.destroy();
      this.humans.delete(human);
    };
    human.emitter.on('died', onDied);
    this.humans.set(human, {
      entity: human,
      behavior,
      rect,
      offDied: () => human.emitter.off('died', onDied),
    });
  }

  /**
   * Bind a `Building` (wall or tower). Walls subscribe to
   * `damage-state-changed` so the rectangle tint cycles
   * pristine → cracked → crumbling.
   */
  bindWall(building: Building): void {
    const key = `${building.cell.x},${building.cell.y}`;
    if (this.walls.has(key)) return;
    const { x, y } = cellToCentre(
      building.cell.x,
      building.cell.y,
      this.tileSize,
    );
    const isTower = building.def.category === 'tower';
    const initialColor = isTower
      ? SpriteColors.ballista
      : colorForWall(building);
    const rect = this.factory(
      x,
      y,
      ENTITY_SIZE,
      ENTITY_SIZE,
      initialColor,
    );
    rect.setDepth(1);

    // Drive the tint off the per-damage event rather than the sparser
    // `damage-state-changed` (which only fires when computeSprite's
    // sprite-key changes). The 3-band `currentDamageState()` ladder is
    // finer than the sprite ladder for some defs (the latter can settle
    // on the lowest sprite while the former still reads 'cracked'), so
    // listening on 'damaged' guarantees the rectangle stays in sync.
    const onDamaged = () => {
      if (isTower) return;
      rect.setFillStyle(colorForWall(building), 1);
    };
    building.emitter.on('damaged', onDamaged);

    const onDestroyed = () => {
      rect.destroy();
      this.walls.delete(key);
    };
    // Per-Building destroyed event: the entity emits `wall:destroyed` on
    // its own emitter via the Building ctor in #15/#28. The shared bus
    // also receives this event (BuildingSystem fans it forward), but
    // subscribing here lets us tear down even before the system event
    // arrives.
    building.emitter.on(GameEvents.WallDestroyed, onDestroyed);

    this.walls.set(key, {
      building,
      rect,
      offDamageStateChanged: () =>
        building.emitter.off('damaged', onDamaged),
      offDestroyed: () =>
        building.emitter.off(GameEvents.WallDestroyed, onDestroyed),
    });
  }

  private unbindWall(cellX: number, cellY: number): void {
    const key = `${cellX},${cellY}`;
    const t = this.walls.get(key);
    if (!t) return;
    t.offDamageStateChanged();
    t.offDestroyed();
    t.rect.destroy();
    this.walls.delete(key);
  }

  /**
   * Bind a projectile rectangle. The binder owns no projectile lifecycle
   * itself (projectiles tear themselves down in DamageSystem); callers
   * supply a `getPosition` reader and `isDone` predicate so the binder
   * knows when to destroy the dot. M1 has no live ballistas, so this
   * method is unused in practice — kept here so #29's visual contract
   * lands fully and a future ballista wiring needs no binder change.
   */
  bindProjectile(args: {
    getPosition: () => { x: number; y: number };
    isDone: () => boolean;
  }): RectangleLike {
    const start = args.getPosition();
    const rect = this.factory(
      start.x,
      start.y,
      PROJECTILE_SIZE,
      PROJECTILE_SIZE,
      SpriteColors.projectile,
    );
    rect.setDepth(3);
    this.activeProjectiles.push({
      rect,
      getPosition: args.getPosition,
      isDone: args.isDone,
    });
    return rect;
  }

  private readonly activeProjectiles: {
    rect: RectangleLike;
    getPosition: () => { x: number; y: number };
    isDone: () => boolean;
  }[] = [];

  /**
   * Per-frame tick — called from `GameScene.update`. Walks every tracked
   * entity and copies its current cell into its rectangle. Hero stays put
   * (no movement controller in M1). Projectiles update from their reader
   * lambda; finished projectiles drop their rectangle.
   */
  tick(): void {
    for (const t of this.orcs.values()) {
      const { x, y } = cellToCentre(t.behavior.cell.x, t.behavior.cell.y, this.tileSize);
      t.rect.setPosition(x, y);
    }
    for (const t of this.humans.values()) {
      const { x, y } = cellToCentre(t.behavior.cell.x, t.behavior.cell.y, this.tileSize);
      t.rect.setPosition(x, y);
    }
    if (this.activeProjectiles.length > 0) {
      const survivors: typeof this.activeProjectiles = [];
      for (const p of this.activeProjectiles) {
        if (p.isDone()) {
          p.rect.destroy();
          continue;
        }
        const pos = p.getPosition();
        p.rect.setPosition(pos.x, pos.y);
        survivors.push(p);
      }
      this.activeProjectiles.length = 0;
      this.activeProjectiles.push(...survivors);
    }
  }

  /** Tear down every rectangle + listener. Called on scene shutdown. */
  destroy(): void {
    this.offWallBuilt();
    this.offWallDestroyed();
    if (this.hero) {
      this.hero.offDied();
      this.hero.rect.destroy();
      this.hero = null;
    }
    for (const t of this.orcs.values()) {
      t.offDied();
      t.rect.destroy();
    }
    this.orcs.clear();
    for (const t of this.humans.values()) {
      t.offDied();
      t.rect.destroy();
    }
    this.humans.clear();
    for (const t of this.walls.values()) {
      t.offDamageStateChanged();
      t.offDestroyed();
      t.rect.destroy();
    }
    this.walls.clear();
    for (const p of this.activeProjectiles) {
      p.rect.destroy();
    }
    this.activeProjectiles.length = 0;
  }

  /** Test/diagnostic: how many active per-category trackers. */
  get counts(): {
    hero: number;
    orcs: number;
    humans: number;
    walls: number;
    projectiles: number;
  } {
    return {
      hero: this.hero ? 1 : 0,
      orcs: this.orcs.size,
      humans: this.humans.size,
      walls: this.walls.size,
      projectiles: this.activeProjectiles.length,
    };
  }
}

/**
 * Helper for producing a rectangle factory bound to a Phaser scene's
 * `add` factory. Kept here so callers don't import Phaser types from
 * the binder module (jsdom-safe).
 */
export interface SceneAddLike {
  rectangle(
    x: number,
    y: number,
    width: number,
    height: number,
    fillColor?: number,
    fillAlpha?: number,
  ): RectangleLike;
}

export function rectangleFactoryFromScene(
  add: SceneAddLike,
): RectangleFactoryLike {
  return (x, y, w, h, color, alpha) => add.rectangle(x, y, w, h, color, alpha);
}

/** Re-export tile constants so test consumers don't need a second import. */
export { TILE_SIZE, TILE_HALF };
