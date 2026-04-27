import { describe, it, expect, vi } from 'vitest';
import { Building } from '@/game/entities/Building';
import { SimpleEventEmitter } from '@/game/components';
import { GameEvents } from '@/game/systems/events';
import wallWood from '@/data/buildings/wall-wood.json';
import ballista from '@/data/buildings/ballista.json';
import type { BuildingDef } from '@/types';

const wallDef = wallWood as BuildingDef;
const towerDef = ballista as BuildingDef;

/** Default cell used by tests that don't care about grid position. */
const cell0 = { x: 0, y: 0 };

describe('Building.fromDef (wall)', () => {
  it('reads hp/armor from the def and reports wall category', () => {
    const b = Building.fromDef(wallDef, undefined, cell0);
    expect(b.category).toBe('wall');
    expect(b.breakable.maxHp).toBe(wallDef.hp);
  });

  it('exposes damageStates via the wall getter', () => {
    const b = Building.fromDef(wallDef, undefined, cell0);
    expect(b.damageStates.length).toBeGreaterThan(0);
  });

  it('throws when accessing combat on a wall', () => {
    const b = Building.fromDef(wallDef, undefined, cell0);
    expect(() => b.combat).toThrow();
  });

  it('transitions through damage state sprites as HP drops', () => {
    const b = Building.fromDef(wallDef, undefined, cell0);
    const before = b.breakable.currentSprite();
    b.breakable.applyDamage(Math.floor(wallDef.hp * 0.5));
    const after = b.breakable.currentSprite();
    expect(after).not.toBe(before);
  });
});

describe('Building.fromDef (tower)', () => {
  it('reads hp/armor from the def and reports tower category', () => {
    const b = Building.fromDef(towerDef, undefined, cell0);
    expect(b.category).toBe('tower');
    expect(b.breakable.maxHp).toBe(towerDef.hp);
  });

  it('exposes combat block via the tower getter', () => {
    const b = Building.fromDef(towerDef, undefined, cell0);
    if (towerDef.category !== 'tower') throw new Error('fixture drift');
    expect(b.combat.range).toBe(towerDef.combat.range);
    expect(b.combat.damage).toBe(towerDef.combat.damage);
  });

  it('throws when accessing damageStates on a tower', () => {
    const b = Building.fromDef(towerDef, undefined, cell0);
    expect(() => b.damageStates).toThrow();
  });

  it("tower's Breakable falls back to the def sprite (no damageStates)", () => {
    const b = Building.fromDef(towerDef, undefined, cell0);
    expect(b.breakable.currentSprite()).toBe(towerDef.sprite);
  });
});

describe('Building.fromDef (cell binding — wall destruction)', () => {
  it('re-emits wall:destroyed with {x,y} when its Breakable is destroyed', () => {
    const emitter = new SimpleEventEmitter();
    const spy = vi.fn();
    emitter.on(GameEvents.WallDestroyed, spy);

    const b = Building.fromDef(wallDef, emitter, { x: 3, y: 5 });
    b.breakable.applyDamage(wallDef.hp + 50);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ x: 3, y: 5 });
  });

  it('emits wall:destroyed only once even with extra damage hits', () => {
    const emitter = new SimpleEventEmitter();
    const spy = vi.fn();
    emitter.on(GameEvents.WallDestroyed, spy);

    const b = Building.fromDef(wallDef, emitter, { x: 1, y: 1 });
    b.breakable.applyDamage(wallDef.hp + 50);
    b.breakable.applyDamage(20);
    b.breakable.applyDamage(20);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('exposes the bound cell on the entity', () => {
    const b = Building.fromDef(wallDef, undefined, { x: 7, y: 9 });
    expect(b.cell).toEqual({ x: 7, y: 9 });
  });
});
