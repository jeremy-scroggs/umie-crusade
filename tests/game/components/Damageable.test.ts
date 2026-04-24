import { describe, it, expect, vi } from 'vitest';
import { Damageable } from '@/game/components/Damageable';
import { SimpleEventEmitter } from '@/game/components/EventEmitter';

const makeEmitter = () => new SimpleEventEmitter();

describe('Damageable', () => {
  it('applies damage - armor with a floor at 0', () => {
    const d = new Damageable({ hp: 50, armor: 5, emitter: makeEmitter() });

    // 10 - 5 armor = 5 effective
    const effective = d.applyDamage(10);
    expect(effective).toBe(5);
    expect(d.hp).toBe(45);

    // 3 - 5 armor = -2 -> floored at 0
    const blocked = d.applyDamage(3);
    expect(blocked).toBe(0);
    expect(d.hp).toBe(45);
  });

  it('decrements HP across multiple hits', () => {
    const d = new Damageable({ hp: 30, armor: 0, emitter: makeEmitter() });
    d.applyDamage(10);
    d.applyDamage(10);
    expect(d.hp).toBe(10);
  });

  it("emits 'died' event when HP reaches 0", () => {
    const emitter = makeEmitter();
    const onDied = vi.fn();
    emitter.on('died', onDied);

    const d = new Damageable({ hp: 20, armor: 0, emitter });
    d.applyDamage(20);

    expect(d.hp).toBe(0);
    expect(d.dead).toBe(true);
    expect(onDied).toHaveBeenCalledTimes(1);
  });

  it("emits 'died' when HP drops below 0 (overkill)", () => {
    const emitter = makeEmitter();
    const onDied = vi.fn();
    emitter.on('died', onDied);

    const d = new Damageable({ hp: 10, armor: 2, emitter });
    d.applyDamage(100); // effective 98, overkill

    expect(d.hp).toBe(0);
    expect(onDied).toHaveBeenCalledTimes(1);
  });

  it("does NOT re-emit 'died' on further damage after death", () => {
    const emitter = makeEmitter();
    const onDied = vi.fn();
    emitter.on('died', onDied);

    const d = new Damageable({ hp: 10, armor: 0, emitter });
    d.applyDamage(10);
    d.applyDamage(5);
    d.applyDamage(5);

    expect(onDied).toHaveBeenCalledTimes(1);
  });

  it("emits 'damaged' with { amount, effective, hp } payload", () => {
    const emitter = makeEmitter();
    const onDamaged = vi.fn();
    emitter.on('damaged', onDamaged);

    const d = new Damageable({ hp: 30, armor: 3, emitter });
    d.applyDamage(10);

    expect(onDamaged).toHaveBeenCalledWith({
      amount: 10,
      effective: 7,
      hp: 23,
    });
  });

  it('heal respects maxHp', () => {
    const d = new Damageable({ hp: 20, armor: 0, emitter: makeEmitter() });
    d.applyDamage(15);
    expect(d.hp).toBe(5);
    const healed = d.heal(100);
    expect(healed).toBe(15);
    expect(d.hp).toBe(20);
  });
});
