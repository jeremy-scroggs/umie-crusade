import { describe, it, expect, vi } from 'vitest';
import { Breakable } from '@/game/components/Breakable';
import { SimpleEventEmitter } from '@/game/components/EventEmitter';

const wallStates = [
  { hpThreshold: 1.0, sprite: 'buildings/wall-wood-pristine.png' },
  { hpThreshold: 0.66, sprite: 'buildings/wall-wood-cracked.png' },
  { hpThreshold: 0.33, sprite: 'buildings/wall-wood-crumbling.png' },
];

describe('Breakable', () => {
  it('starts at the highest-threshold sprite', () => {
    const b = new Breakable({
      hp: 100,
      armor: 0,
      emitter: new SimpleEventEmitter(),
      damageStates: wallStates,
      fallbackSprite: 'fallback.png',
    });
    expect(b.currentSprite()).toBe('buildings/wall-wood-pristine.png');
  });

  it("emits 'damage-state-changed' crossing a threshold downward", () => {
    const emitter = new SimpleEventEmitter();
    const spy = vi.fn();
    emitter.on('damage-state-changed', spy);

    const b = new Breakable({
      hp: 100,
      armor: 0,
      emitter,
      damageStates: wallStates,
      fallbackSprite: 'fallback.png',
    });

    // hpThreshold = "state applies when fraction >= threshold". Match the
    // HIGHEST matching threshold. 100 HP, iterate descending [1.0, 0.66, 0.33].
    b.applyDamage(25); // hp 75 -> fraction 0.75 >= 0.66 -> cracked
    expect(spy).toHaveBeenCalledWith('buildings/wall-wood-cracked.png');
    expect(b.currentSprite()).toBe('buildings/wall-wood-cracked.png');

    b.applyDamage(50); // hp 25 -> fraction 0.25 < 0.33 -> crumbling
    expect(spy).toHaveBeenCalledWith('buildings/wall-wood-crumbling.png');
    expect(b.currentSprite()).toBe('buildings/wall-wood-crumbling.png');
  });

  it('returns fallbackSprite when damageStates is empty (towers)', () => {
    const b = new Breakable({
      hp: 80,
      armor: 1,
      emitter: new SimpleEventEmitter(),
      damageStates: [],
      fallbackSprite: 'buildings/ballista.png',
    });
    expect(b.currentSprite()).toBe('buildings/ballista.png');
    b.applyDamage(50);
    expect(b.currentSprite()).toBe('buildings/ballista.png');
  });

  it('forwards damage to the underlying Damageable', () => {
    const b = new Breakable({
      hp: 100,
      armor: 5,
      emitter: new SimpleEventEmitter(),
      damageStates: [],
      fallbackSprite: 'x.png',
    });
    const effective = b.applyDamage(15);
    expect(effective).toBe(10);
    expect(b.hp).toBe(90);
  });
});
