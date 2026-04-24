import { describe, it, expect, vi } from 'vitest';
import {
  AISystem,
  HumanState,
  OrcState,
  Pathfinding,
  DamageSystem,
  GameEvents,
} from '@/game/systems';
import type { TiledMapLike, WallLike } from '@/game/systems';
import { Orc } from '@/game/entities/Orc';
import { Human } from '@/game/entities/Human';
import { Building } from '@/game/entities/Building';
import { SimpleEventEmitter } from '@/game/components';
import mouggGrunt from '@/data/orcs/mougg-grunt.json';
import peasantLevy from '@/data/humans/peasant-levy.json';
import wallWood from '@/data/buildings/wall-wood.json';
import type { UnitDef, BuildingDef } from '@/types';

const orcDef = mouggGrunt as UnitDef;
const humanDef = peasantLevy as UnitDef;
const wallDef = wallWood as BuildingDef;

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

/** Wider field: W x H cells, all walkable. */
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

/**
 * Flush any pending microtasks (Pathfinding.findPath returns a Promise).
 * After the AI ticks, path results are applied in a `.then(...)` callback —
 * we let those resolve before making assertions.
 */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('AISystem — human state machine', () => {
  it('starts IDLE and begins pathing toward the fort goal on first tick', async () => {
    const map = corridor(5);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const damage = new DamageSystem({ emitter });
    const ai = new AISystem({
      pathfinding: pf,
      damage,
      rally: { x: 0, y: 0 },
      fortGoal: { x: 4, y: 0 },
      pathEmitter: emitter,
    });
    const human = Human.fromDef(humanDef);
    ai.registerHuman({ entity: human, cell: { x: 0, y: 0 } });

    expect(ai.humanBehavior(human)!.state).toBe(HumanState.Idle);
    ai.update(1 / 60);
    expect(ai.humanBehavior(human)!.state).toBe(HumanState.Pathing);
    await flush();
    expect(ai.humanBehavior(human)!.path).not.toBeNull();
    expect(ai.humanBehavior(human)!.path!.length).toBe(5);
  });

  it('wall-blocked human enters ATTACK_WALL, destroys wall, resumes path (AC)', async () => {
    // 5-wide corridor; a wall at (2,0) that the pathfinding knows about.
    const map = corridor(5);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const damage = new DamageSystem({ emitter });

    // Build a real wall-wood Building; wire its emitter so Damage can
    // detect `'died'` if we ever need it (not used directly here).
    const wall = Building.fromDef(wallDef);
    const wallCell = { x: 2, y: 0 };
    const wallLike: WallLike = { breakable: wall.breakable, cell: wallCell };

    const wallsByKey = new Map<string, WallLike>();
    wallsByKey.set(`${wallCell.x},${wallCell.y}`, wallLike);

    const ai = new AISystem({
      pathfinding: pf,
      damage,
      rally: { x: 0, y: 0 },
      fortGoal: { x: 4, y: 0 },
      pathEmitter: emitter,
      secondsPerMeleeAttack: 0.1, // keep the test quick
      wallAt: (x, y) => wallsByKey.get(`${x},${y}`) ?? null,
    });

    const human = Human.fromDef(humanDef);
    ai.registerHuman({ entity: human, cell: { x: 0, y: 0 } });

    // Tick once — path request issued before the wall goes up. Let it resolve.
    ai.update(1 / 60);
    await flush();

    // Now "build" the wall — Pathfinding marks (2,0) impassable and emits
    // path:invalidated, which the AI listens for.
    emitter.emit(GameEvents.WallBuilt, { x: 2, y: 0 });

    // Drive the human forward. `speed` = 70 → seconds-per-tile ≈ 0.457.
    // Tick enough sim-time for it to reach (1,0) and discover (2,0) blocked.
    for (let i = 0; i < 60; i += 1) {
      ai.update(0.1);
      await flush();
      if (ai.humanBehavior(human)!.state === HumanState.AttackWall) break;
    }

    const hb = ai.humanBehavior(human)!;
    expect(hb.state).toBe(HumanState.AttackWall);
    expect(hb.cell).toEqual({ x: 1, y: 0 });
    expect(hb.targetWall).toBe(wallLike);
    const hpBefore = wall.breakable.damageable.hp;
    // Let the human swing a few times.
    for (let i = 0; i < 20; i += 1) ai.update(0.1);
    expect(wall.breakable.damageable.hp).toBeLessThan(hpBefore);

    // Kill the wall directly so the test doesn't depend on wall HP tuning.
    wall.breakable.damageable.applyDamage(wall.breakable.damageable.hp);
    expect(wall.breakable.damageable.dead).toBe(true);

    // Tell Pathfinding the wall is gone — emits path:invalidated, which
    // sets needsRepath. The AI should resume PATHING and step to the goal.
    emitter.emit(GameEvents.WallDestroyed, { x: 2, y: 0 });
    for (let i = 0; i < 200; i += 1) {
      ai.update(0.1);
      await flush();
      if (ai.humanBehavior(human)!.cell.x === 4) break;
    }
    expect(ai.humanBehavior(human)!.cell).toEqual({ x: 4, y: 0 });
    // State is back to Pathing (already at goal, no new steps to take).
    expect(ai.humanBehavior(human)!.state).toBe(HumanState.Pathing);
  });

  it('re-requests path on `path:invalidated` (AC)', async () => {
    const map = corridor(5);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const findPathSpy = vi.spyOn(pf, 'findPath');
    const damage = new DamageSystem({ emitter });
    const ai = new AISystem({
      pathfinding: pf,
      damage,
      rally: { x: 0, y: 0 },
      fortGoal: { x: 4, y: 0 },
      pathEmitter: emitter,
    });
    const human = Human.fromDef(humanDef);
    ai.registerHuman({ entity: human, cell: { x: 0, y: 0 } });

    // First tick — initial path request.
    ai.update(1 / 60);
    await flush();
    const callsAfterFirst = findPathSpy.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThanOrEqual(1);

    // Simulate a wall change (builds fire path:invalidated).
    emitter.emit(GameEvents.PathInvalidated, {});
    expect(ai.humanBehavior(human)!.needsRepath).toBe(true);

    // Next tick consumes the flag and re-queries findPath.
    ai.update(1 / 60);
    await flush();
    expect(findPathSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

describe('AISystem — orc state machine', () => {
  it('IDLE_AT_RALLY engages the nearest human in aggro radius', () => {
    const map = field(10, 1);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const damage = new DamageSystem({ emitter });
    const ai = new AISystem({
      pathfinding: pf,
      damage,
      rally: { x: 0, y: 0 },
      fortGoal: { x: 9, y: 0 },
      pathEmitter: emitter,
      aggroRadius: 4 * 32, // 4 tiles
    });
    const orc = Orc.fromDef(orcDef);
    ai.registerOrc({ entity: orc, cell: { x: 0, y: 0 } });

    // Two humans — one at 2 tiles away (in range), one at 8 (out of range).
    const near = Human.fromDef(humanDef);
    const far = Human.fromDef(humanDef);
    ai.registerHuman({ entity: near, cell: { x: 2, y: 0 } });
    ai.registerHuman({ entity: far, cell: { x: 8, y: 0 } });

    ai.update(1 / 60);
    const ob = ai.orcBehavior(orc)!;
    expect(ob.state).toBe(OrcState.Engage);
    expect(ob.target?.instance.entity).toBe(near);
  });

  it('stays IDLE_AT_RALLY when all humans are outside aggro radius', () => {
    const map = field(20, 1);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const damage = new DamageSystem({ emitter });
    const ai = new AISystem({
      pathfinding: pf,
      damage,
      rally: { x: 0, y: 0 },
      fortGoal: { x: 19, y: 0 },
      pathEmitter: emitter,
      aggroRadius: 3 * 32,
    });
    const orc = Orc.fromDef(orcDef);
    ai.registerOrc({ entity: orc, cell: { x: 0, y: 0 } });

    const far = Human.fromDef(humanDef);
    ai.registerHuman({ entity: far, cell: { x: 15, y: 0 } });

    ai.update(1 / 60);
    expect(ai.orcBehavior(orc)!.state).toBe(OrcState.IdleAtRally);
    expect(ai.orcBehavior(orc)!.target).toBeNull();
  });

  it('engages, attacks, then returns to configurable rally cell when target dies (AC)', () => {
    const map = field(10, 1);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const damage = new DamageSystem({ emitter });
    const rally = { x: 3, y: 0 };
    const ai = new AISystem({
      pathfinding: pf,
      damage,
      rally,
      fortGoal: { x: 9, y: 0 },
      pathEmitter: emitter,
      aggroRadius: 10 * 32,
      secondsPerMeleeAttack: 0.1,
    });
    const orc = Orc.fromDef(orcDef);
    ai.registerOrc({ entity: orc, cell: { x: 3, y: 0 } });

    const victim = Human.fromDef(humanDef);
    ai.registerHuman({ entity: victim, cell: { x: 5, y: 0 } });

    // Let the orc engage + reach melee + kill the human.
    for (let i = 0; i < 200; i += 1) {
      ai.update(0.1);
      if (victim.damageable.dead) break;
    }
    expect(victim.damageable.dead).toBe(true);

    // Orc now returns to rally.
    for (let i = 0; i < 200; i += 1) {
      ai.update(0.1);
      if (ai.orcBehavior(orc)!.state === OrcState.IdleAtRally) break;
    }
    expect(ai.orcBehavior(orc)!.cell).toEqual(rally);
    expect(ai.orcBehavior(orc)!.state).toBe(OrcState.IdleAtRally);
  });
});

describe('AISystem — interaction', () => {
  it('human switches to ATTACK_ORC when an orc engages in melee range', () => {
    const map = field(10, 1);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const damage = new DamageSystem({ emitter });
    const ai = new AISystem({
      pathfinding: pf,
      damage,
      rally: { x: 0, y: 0 },
      fortGoal: { x: 9, y: 0 },
      pathEmitter: emitter,
      aggroRadius: 10 * 32,
      secondsPerMeleeAttack: 0.1,
    });

    const orc = Orc.fromDef(orcDef);
    ai.registerOrc({ entity: orc, cell: { x: 5, y: 0 } });
    const human = Human.fromDef(humanDef);
    ai.registerHuman({ entity: human, cell: { x: 6, y: 0 } });

    // One tick — human sees an adjacent orc and switches to ATTACK_ORC.
    ai.update(1 / 60);
    expect(ai.humanBehavior(human)!.state).toBe(HumanState.AttackOrc);

    // Drive ticks — both exchange melee hits via the shared DamageSystem.
    const startHuman = human.damageable.hp;
    const startOrc = orc.damageable.hp;
    for (let i = 0; i < 20; i += 1) ai.update(0.1);
    expect(human.damageable.hp).toBeLessThan(startHuman);
    expect(orc.damageable.hp).toBeLessThan(startOrc);
  });

  it('destroy() unsubscribes from path:invalidated', () => {
    const map = corridor(3);
    const emitter = new SimpleEventEmitter();
    const pf = new Pathfinding(map, emitter);
    const damage = new DamageSystem({ emitter });
    const ai = new AISystem({
      pathfinding: pf,
      damage,
      rally: { x: 0, y: 0 },
      fortGoal: { x: 2, y: 0 },
      pathEmitter: emitter,
    });
    const human = Human.fromDef(humanDef);
    ai.registerHuman({ entity: human, cell: { x: 0, y: 0 } });
    ai.destroy();

    emitter.emit(GameEvents.PathInvalidated, {});
    // After destroy the humans map is cleared, so the lookup returns undefined.
    expect(ai.humanBehavior(human)).toBeUndefined();
  });
});
