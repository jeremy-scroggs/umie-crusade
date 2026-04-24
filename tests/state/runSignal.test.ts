import { describe, it, expect, vi } from 'vitest';
import {
  RUN_EVENTS,
  runSignal,
  type BeginRunPayload,
} from '@/state/runSignal';

describe('runSignal', () => {
  it('delivers BEGIN payload to subscribers', () => {
    const listener = vi.fn();
    runSignal.on(RUN_EVENTS.BEGIN, listener);

    const payload: BeginRunPayload = { heroId: 'hero-xyz' };
    runSignal.emit(RUN_EVENTS.BEGIN, payload);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(payload);

    runSignal.off(RUN_EVENTS.BEGIN, listener);
  });

  it('stops delivering after off()', () => {
    const listener = vi.fn();
    runSignal.on(RUN_EVENTS.BEGIN, listener);
    runSignal.off(RUN_EVENTS.BEGIN, listener);

    runSignal.emit(RUN_EVENTS.BEGIN, { heroId: 'ignored' });
    expect(listener).not.toHaveBeenCalled();
  });
});
