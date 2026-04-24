import { describe, it, expect, vi } from 'vitest';
import { Upgradeable } from '@/game/components/Upgradeable';
import { SimpleEventEmitter } from '@/game/components/EventEmitter';

describe('Upgradeable', () => {
  it('starts at level 1 with no upgrades', () => {
    const u = new Upgradeable({ emitter: new SimpleEventEmitter() });
    expect(u.level).toBe(1);
    expect(u.canUpgrade()).toBe(false);
  });

  it('throws when applying an upgrade with none configured', () => {
    const u = new Upgradeable({ emitter: new SimpleEventEmitter() });
    expect(() => u.applyUpgrade('any')).toThrow();
  });

  it("emits 'upgraded' and increments level for a known id", () => {
    const emitter = new SimpleEventEmitter();
    const spy = vi.fn();
    emitter.on('upgraded', spy);

    const u = new Upgradeable({
      emitter,
      upgrades: [{ id: 'reinforced', label: 'Reinforced' }],
    });
    u.applyUpgrade('reinforced');
    expect(u.level).toBe(2);
    expect(spy).toHaveBeenCalledWith({ id: 'reinforced', level: 2 });
  });
});
