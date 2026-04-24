import { describe, it, expect } from 'vitest';
import { unitDefSchema } from '@/data/schemas/unit.schema';
import {
  wallDefSchema,
  towerDefSchema,
  buildingDefSchema,
} from '@/data/schemas/building.schema';
import { waveDefSchema } from '@/data/schemas/wave.schema';
import { heroDefSchema } from '@/data/schemas/hero.schema';
import { stringsDefSchema } from '@/data/schemas/strings.schema';
import mouggGrunt from '@/data/orcs/mougg-grunt.json';
import enStrings from '@/data/strings/en.json';

describe('unit schema', () => {
  it('accepts mougg-grunt.json', () => {
    const result = unitDefSchema.safeParse(mouggGrunt);
    if (!result.success) console.error(result.error.format());
    expect(result.success).toBe(true);
  });

  it('accepts a human with goldDrop and no respawnCost', () => {
    const human = {
      id: 'peasant-levy',
      name: 'Peasant Levy',
      bloodline: 'none',
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
    expect(unitDefSchema.safeParse(human).success).toBe(true);
  });

  it('rejects missing required fields', () => {
    expect(unitDefSchema.safeParse({ id: 'x' }).success).toBe(false);
  });

  it('rejects negative hp', () => {
    const invalid = { ...mouggGrunt, stats: { ...mouggGrunt.stats, hp: -10 } };
    expect(unitDefSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects invalid category', () => {
    expect(
      unitDefSchema.safeParse({ ...mouggGrunt, category: 'dragon' }).success,
    ).toBe(false);
  });

  it('rejects invalid faction', () => {
    expect(
      unitDefSchema.safeParse({ ...mouggGrunt, faction: 'elf' }).success,
    ).toBe(false);
  });
});

describe('building schema', () => {
  const validWall = {
    id: 'wall-wood',
    name: 'Wood Wall',
    category: 'wall',
    hp: 100,
    armor: 0,
    buildCost: { gold: 20 },
    repairCost: { goldPerHp: 1 },
    damageStates: [
      { hpThreshold: 1.0, sprite: 'buildings/wall-wood-pristine.png' },
      { hpThreshold: 0.66, sprite: 'buildings/wall-wood-cracked.png' },
      { hpThreshold: 0.33, sprite: 'buildings/wall-wood-crumbling.png' },
    ],
    sprite: 'buildings/wall-wood-pristine.png',
    flavor: 'Nub pass!',
  };

  const validTower = {
    id: 'ballista',
    name: 'Ballista',
    category: 'tower',
    hp: 80,
    armor: 1,
    buildCost: { gold: 60 },
    combat: { range: 240, damage: 20, attackRate: 0.8, projectileSpeed: 300 },
    sprite: 'buildings/ballista.png',
    flavor: 'Zakk!',
  };

  it('accepts a valid wall', () => {
    expect(wallDefSchema.safeParse(validWall).success).toBe(true);
    expect(buildingDefSchema.safeParse(validWall).success).toBe(true);
  });

  it('accepts a valid tower', () => {
    expect(towerDefSchema.safeParse(validTower).success).toBe(true);
    expect(buildingDefSchema.safeParse(validTower).success).toBe(true);
  });

  it('rejects wall missing damageStates', () => {
    const { damageStates: _unused, ...invalid } = validWall;
    void _unused;
    expect(buildingDefSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects tower missing combat block', () => {
    const { combat: _unused, ...invalid } = validTower;
    void _unused;
    expect(buildingDefSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects unknown category', () => {
    expect(
      buildingDefSchema.safeParse({ ...validWall, category: 'trap' }).success,
    ).toBe(false);
  });
});

describe('wave schema', () => {
  const valid = {
    id: 'm1-wave-1',
    number: 1,
    spawns: [
      {
        unitId: 'peasant-levy',
        count: 5,
        edge: 'N',
        startDelay: 0,
        interval: 1.5,
      },
    ],
    reward: { gold: 25 },
    cry: 'battle.waveStart',
  };

  it('accepts a valid wave', () => {
    expect(waveDefSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a wave without cry', () => {
    const { cry: _unused, ...noCry } = valid;
    void _unused;
    expect(waveDefSchema.safeParse(noCry).success).toBe(true);
  });

  it('rejects empty spawns array', () => {
    expect(
      waveDefSchema.safeParse({ ...valid, spawns: [] }).success,
    ).toBe(false);
  });

  it('rejects invalid edge', () => {
    const bad = { ...valid, spawns: [{ ...valid.spawns[0], edge: 'E' }] };
    expect(waveDefSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects non-integer count', () => {
    const bad = { ...valid, spawns: [{ ...valid.spawns[0], count: 1.5 }] };
    expect(waveDefSchema.safeParse(bad).success).toBe(false);
  });
});

describe('hero schema', () => {
  const valid = {
    ...mouggGrunt,
    ability: {
      id: 'clompuk',
      damage: 30,
      radius: 64,
      stunMs: 1500,
      cooldownMs: 12000,
    },
  };

  it('accepts a hero extending a unit def', () => {
    expect(heroDefSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a hero missing ability', () => {
    const { ability: _unused, ...noAbility } = valid;
    void _unused;
    expect(heroDefSchema.safeParse(noAbility).success).toBe(false);
  });

  it('rejects ability with negative cooldown', () => {
    const bad = { ...valid, ability: { ...valid.ability, cooldownMs: -1 } };
    expect(heroDefSchema.safeParse(bad).success).toBe(false);
  });
});

describe('strings schema', () => {
  it('accepts en.json', () => {
    expect(stringsDefSchema.safeParse(enStrings).success).toBe(true);
  });

  it('rejects a non-string value', () => {
    expect(stringsDefSchema.safeParse({ 'hud.gold': 1 }).success).toBe(false);
  });

  it('rejects a bundle missing a required key', () => {
    const { 'hud.gold': _dropped, ...withoutHudGold } = enStrings;
    void _dropped;
    expect(stringsDefSchema.safeParse(withoutHudGold).success).toBe(false);
  });

  it('rejects an empty string value', () => {
    expect(
      stringsDefSchema.safeParse({ ...enStrings, 'hud.gold': '' }).success,
    ).toBe(false);
  });
});
