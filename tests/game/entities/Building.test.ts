import { describe, it, expect } from 'vitest';
import { Building } from '@/game/entities/Building';
import wallWood from '@/data/buildings/wall-wood.json';
import ballista from '@/data/buildings/ballista.json';
import type { BuildingDef } from '@/types';

const wallDef = wallWood as BuildingDef;
const towerDef = ballista as BuildingDef;

describe('Building.fromDef (wall)', () => {
  it('reads hp/armor from the def and reports wall category', () => {
    const b = Building.fromDef(wallDef);
    expect(b.category).toBe('wall');
    expect(b.breakable.maxHp).toBe(wallDef.hp);
  });

  it('exposes damageStates via the wall getter', () => {
    const b = Building.fromDef(wallDef);
    expect(b.damageStates.length).toBeGreaterThan(0);
  });

  it('throws when accessing combat on a wall', () => {
    const b = Building.fromDef(wallDef);
    expect(() => b.combat).toThrow();
  });

  it('transitions through damage state sprites as HP drops', () => {
    const b = Building.fromDef(wallDef);
    const before = b.breakable.currentSprite();
    b.breakable.applyDamage(Math.floor(wallDef.hp * 0.5));
    const after = b.breakable.currentSprite();
    expect(after).not.toBe(before);
  });
});

describe('Building.fromDef (tower)', () => {
  it('reads hp/armor from the def and reports tower category', () => {
    const b = Building.fromDef(towerDef);
    expect(b.category).toBe('tower');
    expect(b.breakable.maxHp).toBe(towerDef.hp);
  });

  it('exposes combat block via the tower getter', () => {
    const b = Building.fromDef(towerDef);
    if (towerDef.category !== 'tower') throw new Error('fixture drift');
    expect(b.combat.range).toBe(towerDef.combat.range);
    expect(b.combat.damage).toBe(towerDef.combat.damage);
  });

  it('throws when accessing damageStates on a tower', () => {
    const b = Building.fromDef(towerDef);
    expect(() => b.damageStates).toThrow();
  });

  it("tower's Breakable falls back to the def sprite (no damageStates)", () => {
    const b = Building.fromDef(towerDef);
    expect(b.breakable.currentSprite()).toBe(towerDef.sprite);
  });
});
