import { describe, it, expect, vi } from 'vitest';
import {
  Targetable,
  CATEGORY_TARGET_PRIORITY,
} from '@/game/components/Targetable';
import { SimpleEventEmitter } from '@/game/components/EventEmitter';

describe('Targetable', () => {
  it('defaults isTargetable to true', () => {
    const t = new Targetable({
      priority: CATEGORY_TARGET_PRIORITY.melee,
      emitter: new SimpleEventEmitter(),
    });
    expect(t.isTargetable).toBe(true);
  });

  it("emits 'targetable-changed' when toggled", () => {
    const emitter = new SimpleEventEmitter();
    const spy = vi.fn();
    emitter.on('targetable-changed', spy);

    const t = new Targetable({ priority: 1, emitter });
    t.setTargetable(false);
    expect(spy).toHaveBeenCalledWith(false);
    expect(t.isTargetable).toBe(false);
  });

  it('does not emit when value is unchanged', () => {
    const emitter = new SimpleEventEmitter();
    const spy = vi.fn();
    emitter.on('targetable-changed', spy);

    const t = new Targetable({ priority: 1, emitter });
    t.setTargetable(true); // already true
    expect(spy).not.toHaveBeenCalled();
  });

  it('priority map orders caster above fodder', () => {
    expect(CATEGORY_TARGET_PRIORITY.caster).toBeGreaterThan(
      CATEGORY_TARGET_PRIORITY.fodder,
    );
  });
});
