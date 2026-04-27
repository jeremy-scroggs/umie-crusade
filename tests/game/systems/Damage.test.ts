import { describe, it, expect, vi } from 'vitest';
import { DamageSystem } from '@/game/systems/Damage';
import type { TowerLike } from '@/game/systems/Damage';
import { Orc } from '@/game/entities/Orc';
import { Human } from '@/game/entities/Human';
import { Building } from '@/game/entities/Building';
import { SimpleEventEmitter } from '@/game/components/EventEmitter';
import { Damageable } from '@/game/components/Damageable';
import type { TargetLike } from '@/game/entities/Projectile';
import mouggGrunt from '@/data/orcs/mougg-grunt.json';
import peasantLevy from '@/data/humans/peasant-levy.json';
import ballista from '@/data/buildings/ballista.json';
import type { UnitDef, BuildingDef } from '@/types';

const orcDef = mouggGrunt as UnitDef;
const humanDef = peasantLevy as UnitDef;
const ballistaDef = ballista as BuildingDef;

function positionedTarget(
  hp: number,
  armor: number,
  position = { x: 0, y: 0 },
): TargetLike & {
  damageable: Damageable;
  position: { x: number; y: number };
  emitter: SimpleEventEmitter;
} {
  const emitter = new SimpleEventEmitter();
  const damageable = new Damageable({ hp, armor, emitter });
  return { position, damageable, emitter };
}

function makeTower(
  position = { x: 0, y: 0 },
  overrides?: Partial<BuildingDef['category'] extends 'tower' ? object : never>,
): TowerLike {
  void overrides;
  const b = Building.fromDef(ballistaDef, undefined, { x: 0, y: 0 });
  return { position, combat: b.combat };
}

describe('DamageSystem.meleeAttack', () => {
  it('applies attacker dps through Damageable on the target (AC)', () => {
    const sys = new DamageSystem();
    const orc = Orc.fromDef(orcDef);
    const human = Human.fromDef(humanDef);

    // Give the human a fatter HP pool via a derived entity-equivalent target
    // (we don't want the levy to die in one hit for this test).
    const tough = positionedTarget(100, humanDef.stats.armor);
    const effective = sys.meleeAttack(orc, tough);
    expect(effective).toBe(orcDef.stats.dps - humanDef.stats.armor);
    expect(tough.damageable.hp).toBe(100 - effective);

    // Also verify it works against a real entity.
    const startHp = human.damageable.hp;
    sys.meleeAttack(orc, {
      position: { x: 0, y: 0 },
      damageable: human.damageable,
    });
    expect(human.damageable.hp).toBeLessThan(startHp);
  });

  it("emits 'melee-hit' with attacker/target/effective", () => {
    const sys = new DamageSystem();
    const orc = Orc.fromDef(orcDef);
    const target = positionedTarget(50, 0);
    const spy = vi.fn();
    sys.emitter.on('melee-hit', spy);

    sys.meleeAttack(orc, target);
    expect(spy).toHaveBeenCalledTimes(1);
    const [payload] = spy.mock.calls[0];
    expect(payload).toMatchObject({
      attacker: orc,
      target,
      effective: orcDef.stats.dps,
    });
  });

  it('respects armor (floor 0) via Damageable', () => {
    const sys = new DamageSystem();
    // Fabricate an attacker with dps = 4; target armor = 10 → effective 0.
    const attacker = { def: { stats: { dps: 4 } } };
    const target = positionedTarget(30, 10);
    const effective = sys.meleeAttack(attacker, target);
    expect(effective).toBe(0);
    expect(target.damageable.hp).toBe(30);
  });
});

describe('DamageSystem.fireProjectile', () => {
  it('spawns a projectile using the tower combat block (AC)', () => {
    const sys = new DamageSystem();
    const tower = makeTower({ x: 0, y: 0 });
    const target = positionedTarget(100, 0, { x: 240, y: 0 });

    const p = sys.fireProjectile(tower, target);
    expect(p.speed).toBe(tower.combat.projectileSpeed);
    expect(p.damage).toBe(tower.combat.damage);
    expect(sys.projectiles.has(p)).toBe(true);
  });

  it("emits 'projectile-spawned' with the new projectile", () => {
    const sys = new DamageSystem();
    const tower = makeTower();
    const target = positionedTarget(100, 0, { x: 100, y: 0 });
    const spy = vi.fn();
    sys.emitter.on('projectile-spawned', spy);

    const p = sys.fireProjectile(tower, target);
    expect(spy).toHaveBeenCalledTimes(1);
    const [payload] = spy.mock.calls[0];
    expect(payload).toMatchObject({ tower, target, projectile: p });
  });
});

describe('DamageSystem.update (projectile loop)', () => {
  it('advances projectiles and resolves on hit (AC)', () => {
    const sys = new DamageSystem();
    const tower = makeTower({ x: 0, y: 0 });
    const target = positionedTarget(100, 2, { x: 60, y: 0 });
    const hitSpy = vi.fn();
    sys.emitter.on('projectile-hit', hitSpy);

    sys.fireProjectile(tower, target);

    // Run the loop until the projectile resolves (1/60 steps, cap 2s).
    const dt = 1 / 60;
    for (let i = 0; i < 120 && sys.projectiles.size > 0; i += 1) {
      sys.update(dt);
    }

    expect(sys.projectiles.size).toBe(0);
    expect(hitSpy).toHaveBeenCalledTimes(1);
    // damage 20 - armor 2 = 18 effective.
    const expected = tower.combat.damage - target.damageable.armor;
    expect(target.damageable.hp).toBe(100 - expected);
  });

  it('auto-fires per attackRate when selectTarget returns a target', () => {
    const target = positionedTarget(10000, 0, { x: 100, y: 0 });
    const sys = new DamageSystem({
      selectTarget: () => target,
    });
    const tower = makeTower({ x: 0, y: 0 });
    const spawnSpy = vi.fn();
    sys.emitter.on('projectile-spawned', spawnSpy);
    sys.register(tower);

    // Simulate ~3 seconds at 60fps.
    const dt = 1 / 60;
    for (let i = 0; i < 3 * 60; i += 1) sys.update(dt);

    // At attackRate 0.8/s over 3s we expect ~2-3 shots (first shot at t=0,
    // subsequent at 1.25s intervals). Assert conservative bounds.
    const expectedShots = Math.floor(3 * tower.combat.attackRate) + 1;
    expect(spawnSpy.mock.calls.length).toBeGreaterThanOrEqual(expectedShots - 1);
    expect(spawnSpy.mock.calls.length).toBeLessThanOrEqual(expectedShots + 1);
  });

  it('does not auto-fire when no selectTarget is given', () => {
    const sys = new DamageSystem();
    const tower = makeTower();
    sys.register(tower);
    const spawnSpy = vi.fn();
    sys.emitter.on('projectile-spawned', spawnSpy);
    for (let i = 0; i < 120; i += 1) sys.update(1 / 60);
    expect(spawnSpy).not.toHaveBeenCalled();
  });
});

describe('DamageSystem death handling', () => {
  it('invokes onEntityDied when a damaged target dies (AC)', () => {
    const onEntityDied = vi.fn();
    const sys = new DamageSystem({ onEntityDied });
    const attacker = { def: { stats: { dps: 100 } } };
    const target = positionedTarget(5, 0);

    sys.meleeAttack(attacker, target);
    // With deathLingerSeconds=0 the callback fires synchronously on died.
    expect(target.damageable.dead).toBe(true);
    expect(onEntityDied).toHaveBeenCalledWith(target);
  });

  it("emits 'target-died' when a damaged target dies", () => {
    const sys = new DamageSystem();
    const spy = vi.fn();
    sys.emitter.on('target-died', spy);

    const attacker = { def: { stats: { dps: 100 } } };
    const target = positionedTarget(5, 0);
    sys.meleeAttack(attacker, target);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('delays the free callback when deathLingerSeconds > 0', () => {
    const onEntityDied = vi.fn();
    const sys = new DamageSystem({ onEntityDied, deathLingerSeconds: 0.5 });
    const attacker = { def: { stats: { dps: 100 } } };
    const target = positionedTarget(5, 0);

    sys.meleeAttack(attacker, target);
    expect(onEntityDied).not.toHaveBeenCalled();

    // Advance < linger.
    sys.update(0.25);
    expect(onEntityDied).not.toHaveBeenCalled();

    // Cross the threshold.
    sys.update(0.3);
    expect(onEntityDied).toHaveBeenCalledWith(target);
  });
});
