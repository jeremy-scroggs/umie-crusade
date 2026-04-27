import { describe, it, expect } from 'vitest';
import { unitDefSchema } from '@/data/schemas/unit.schema';
import {
  wallDefSchema,
  towerDefSchema,
  buildingDefSchema,
} from '@/data/schemas/building.schema';
import {
  waveDefSchema,
  wavePatternSchema,
  waveGeneratorConfigSchema,
} from '@/data/schemas/wave.schema';
import { heroDefSchema } from '@/data/schemas/hero.schema';
import { stringsDefSchema } from '@/data/schemas/strings.schema';
import grunt from '@/data/orcs/grunt.json';
import enStrings from '@/data/strings/en.json';

describe('unit schema', () => {
  it('accepts grunt.json', () => {
    const result = unitDefSchema.safeParse(grunt);
    if (!result.success) console.error(result.error.format());
    expect(result.success).toBe(true);
  });

  it('accepts a human with goldDrop and no respawnCost', () => {
    const human = {
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
    expect(unitDefSchema.safeParse(human).success).toBe(true);
  });

  it('rejects missing required fields', () => {
    expect(unitDefSchema.safeParse({ id: 'x' }).success).toBe(false);
  });

  it('rejects negative hp', () => {
    const invalid = { ...grunt, stats: { ...grunt.stats, hp: -10 } };
    expect(unitDefSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects invalid category', () => {
    expect(
      unitDefSchema.safeParse({ ...grunt, category: 'dragon' }).success,
    ).toBe(false);
  });

  it('rejects invalid faction', () => {
    expect(
      unitDefSchema.safeParse({ ...grunt, faction: 'elf' }).success,
    ).toBe(false);
  });

  it('accepts a unit with kind and role (M2)', () => {
    const peon = {
      ...grunt,
      id: 'peon',
      name: 'Peon',
      category: 'builder',
      kind: 'peon',
      role: 'gatherer',
    };
    expect(unitDefSchema.safeParse(peon).success).toBe(true);
  });

  it('accepts each new M2 kind value', () => {
    for (const kind of ['peon', 'gukka', 'skowt', 'mojoka'] as const) {
      expect(
        unitDefSchema.safeParse({ ...grunt, kind }).success,
      ).toBe(true);
    }
  });

  it('accepts each role value', () => {
    for (const role of [
      'fighter',
      'builder',
      'gatherer',
      'caster',
      'scout',
    ] as const) {
      expect(
        unitDefSchema.safeParse({ ...grunt, role }).success,
      ).toBe(true);
    }
  });

  it('rejects an invalid kind', () => {
    expect(
      unitDefSchema.safeParse({ ...grunt, kind: 'demon' }).success,
    ).toBe(false);
  });

  it('rejects an invalid role', () => {
    expect(
      unitDefSchema.safeParse({ ...grunt, role: 'tank' }).success,
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

  const validStoneWall = {
    id: 'wall-stone',
    name: 'Stone Wall',
    category: 'wall-stone',
    hp: 250,
    armor: 3,
    buildCost: { gold: 60 },
    repairCost: { goldPerHp: 2 },
    damageStates: [
      { hpThreshold: 1.0, sprite: 'buildings/wall-stone-pristine.png' },
      { hpThreshold: 0.5, sprite: 'buildings/wall-stone-cracked.png' },
    ],
    sprite: 'buildings/wall-stone-pristine.png',
    flavor: 'Klop hard.',
  };

  const validGate = {
    id: 'gate-wood',
    name: 'Wood Gate',
    category: 'gate',
    hp: 120,
    armor: 1,
    buildCost: { gold: 40 },
    repairCost: { goldPerHp: 1 },
    damageStates: [
      { hpThreshold: 1.0, sprite: 'buildings/gate-wood-closed.png' },
    ],
    sprite: 'buildings/gate-wood-closed.png',
    passableByTeam: 'orc' as const,
    flavor: 'Open for the hai!',
  };

  const validWatchtower = {
    id: 'watchtower',
    name: 'Watchtower',
    category: 'watchtower',
    hp: 90,
    armor: 1,
    buildCost: { gold: 70 },
    combat: {
      range: 220,
      damage: 12,
      attackRate: 1.0,
      projectileSpeed: 280,
    },
    sightRadius: 320,
    sprite: 'buildings/watchtower.png',
    flavor: 'See umie comin.',
  };

  it('accepts a valid stone wall (M2)', () => {
    expect(buildingDefSchema.safeParse(validStoneWall).success).toBe(true);
  });

  it('accepts a valid gate with each passableByTeam value (M2)', () => {
    for (const passableByTeam of ['orc', 'human', 'both', 'none'] as const) {
      expect(
        buildingDefSchema.safeParse({ ...validGate, passableByTeam }).success,
      ).toBe(true);
    }
  });

  it('accepts a valid watchtower (M2)', () => {
    expect(buildingDefSchema.safeParse(validWatchtower).success).toBe(true);
  });

  it('rejects gate missing passableByTeam', () => {
    const { passableByTeam: _unused, ...invalid } = validGate;
    void _unused;
    expect(buildingDefSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects gate with unknown passableByTeam value', () => {
    expect(
      buildingDefSchema.safeParse({ ...validGate, passableByTeam: 'elf' })
        .success,
    ).toBe(false);
  });

  it('rejects watchtower missing sightRadius', () => {
    const { sightRadius: _unused, ...invalid } = validWatchtower;
    void _unused;
    expect(buildingDefSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects watchtower with non-positive sightRadius', () => {
    expect(
      buildingDefSchema.safeParse({ ...validWatchtower, sightRadius: 0 })
        .success,
    ).toBe(false);
  });

  it('rejects stone wall missing damageStates', () => {
    const { damageStates: _unused, ...invalid } = validStoneWall;
    void _unused;
    expect(buildingDefSchema.safeParse(invalid).success).toBe(false);
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

describe('wavePattern schema (M2)', () => {
  const valid = {
    id: 'rush',
    units: [
      { unitId: 'peasant-levy', weight: 3 },
      { unitId: 'peasant-zealot', weight: 1 },
    ],
    edgeBias: ['N', 'W'] as const,
    cry: 'battle.rushIncoming',
  };

  it('accepts a valid pattern', () => {
    expect(wavePatternSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a pattern without cry', () => {
    const { cry: _unused, ...noCry } = valid;
    void _unused;
    expect(wavePatternSchema.safeParse(noCry).success).toBe(true);
  });

  it('rejects empty units array', () => {
    expect(
      wavePatternSchema.safeParse({ ...valid, units: [] }).success,
    ).toBe(false);
  });

  it('rejects a unit with zero weight', () => {
    const bad = {
      ...valid,
      units: [{ unitId: 'peasant-levy', weight: 0 }],
    };
    expect(wavePatternSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty edgeBias', () => {
    expect(
      wavePatternSchema.safeParse({ ...valid, edgeBias: [] }).success,
    ).toBe(false);
  });

  it('rejects an invalid edge in edgeBias', () => {
    expect(
      wavePatternSchema.safeParse({ ...valid, edgeBias: ['E'] }).success,
    ).toBe(false);
  });
});

describe('waveGeneratorConfig schema (M2)', () => {
  const valid = {
    id: 'm2-default',
    waveCount: 10,
    baseBudget: 50,
    budgetGrowth: 15,
    patterns: ['rush', 'wedge'],
    rewardPerWave: { gold: 25 },
  };

  it('accepts a valid generator config', () => {
    expect(waveGeneratorConfigSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects zero waveCount', () => {
    expect(
      waveGeneratorConfigSchema.safeParse({ ...valid, waveCount: 0 }).success,
    ).toBe(false);
  });

  it('rejects non-integer waveCount', () => {
    expect(
      waveGeneratorConfigSchema.safeParse({ ...valid, waveCount: 2.5 })
        .success,
    ).toBe(false);
  });

  it('rejects empty patterns array', () => {
    expect(
      waveGeneratorConfigSchema.safeParse({ ...valid, patterns: [] }).success,
    ).toBe(false);
  });

  it('rejects negative budgetGrowth', () => {
    expect(
      waveGeneratorConfigSchema.safeParse({ ...valid, budgetGrowth: -1 })
        .success,
    ).toBe(false);
  });
});

describe('hero schema', () => {
  const valid = {
    ...grunt,
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
    expect(stringsDefSchema.safeParse({ 'hud.bludgelt': 1 }).success).toBe(false);
  });

  it('rejects a bundle missing a required key', () => {
    const { 'hud.bludgelt': _dropped, ...withoutHudBludgelt } = enStrings;
    void _dropped;
    expect(stringsDefSchema.safeParse(withoutHudBludgelt).success).toBe(false);
  });

  it('rejects an empty string value', () => {
    expect(
      stringsDefSchema.safeParse({ ...enStrings, 'hud.bludgelt': '' }).success,
    ).toBe(false);
  });
});
