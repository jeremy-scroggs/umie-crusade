import { describe, it, expect } from 'vitest';
import { Orc } from '@/game/entities/Orc';
import { Human } from '@/game/entities/Human';
import grunt from '@/data/orcs/grunt.json';
import type { UnitDef } from '@/types';

const def = grunt as UnitDef;

describe('Orc.fromDef', () => {
  it('reads hp and armor from the def (no hardcoded stats)', () => {
    const orc = Orc.fromDef(def);
    expect(orc.damageable.maxHp).toBe(def.stats.hp);
    expect(orc.damageable.armor).toBe(def.stats.armor);
    expect(orc.damageable.hp).toBe(def.stats.hp);
  });

  it('attaches a Targetable component with a priority from the category', () => {
    const orc = Orc.fromDef(def);
    expect(orc.targetable.isTargetable).toBe(true);
    expect(typeof orc.targetable.priority).toBe('number');
  });

  it('shares a single emitter across components (died bubbles)', () => {
    const orc = Orc.fromDef(def);
    let died = false;
    orc.emitter.on('died', () => {
      died = true;
    });
    orc.damageable.applyDamage(def.stats.hp + def.stats.armor);
    expect(died).toBe(true);
  });

  it("throws if faction mismatches ('human' def given to Orc.fromDef)", () => {
    const human: UnitDef = { ...def, faction: 'human' };
    expect(() => Orc.fromDef(human)).toThrow(/faction 'orc'/);
  });
});

describe('Human.fromDef', () => {
  it('accepts a human-faction def', () => {
    const humanDef: UnitDef = {
      id: 'peasant-levy',
      name: 'Peasant Levy',
      category: 'fodder',
      faction: 'human',
      stats: { hp: 20, dps: 3, speed: 70, armor: 0 },
      cost: { gold: 0, trainTime: 0 },
      sprite: 'humans/peasant-levy.png',
      animations: ['idle', 'walk', 'attack', 'death'],
      abilities: [],
      unlockRequirement: null,
      flavor: 'Demon! Demon!',
      goldDrop: 4,
    };
    const h = Human.fromDef(humanDef);
    expect(h.damageable.maxHp).toBe(humanDef.stats.hp);
  });

  it('throws on an orc-faction def', () => {
    expect(() => Human.fromDef(def)).toThrow(/faction 'human'/);
  });
});
