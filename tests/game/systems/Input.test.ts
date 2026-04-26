import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InputSystem, GameEvents } from '@/game/systems';
import type {
  CameraLike,
  HitTestFn,
  PointerLike,
} from '@/game/systems';
import { SimpleEventEmitter } from '@/game/components';
import gestures from '@/data/input/gestures.json';

const G = gestures as {
  tapMaxDurationMs: number;
  longPressDurationMs: number;
  dragThresholdPx: number;
  pinchMinDelta: number;
  wheelZoomStep: number;
};

/** Spy on a single bus event; returns the spy and a `payloads()` reader. */
function spyOn(emitter: SimpleEventEmitter, eventName: string) {
  const spy = vi.fn();
  emitter.on(eventName, spy);
  return {
    spy,
    payloads(): unknown[] {
      return spy.mock.calls.map((c) => c[0]);
    },
  };
}

/** Build a touch-style PointerLike. */
function touch(pointerId: number, x: number, y: number): PointerLike {
  return { pointerId, x, y, type: 'touch' };
}

/** Build a left-click mouse PointerLike. */
function mouseLeft(x: number, y: number): PointerLike {
  return { pointerId: 0, x, y, type: 'mouse', button: 0 };
}

/** Build a right-click mouse PointerLike. */
function mouseRight(x: number, y: number): PointerLike {
  return { pointerId: 0, x, y, type: 'mouse', button: 2 };
}

describe('InputSystem — tap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits select:tile on a quick tap with no movement', () => {
    const emitter = new SimpleEventEmitter();
    const tile = spyOn(emitter, GameEvents.SelectTile);
    const inspect = spyOn(emitter, GameEvents.InspectShow);
    const pan = spyOn(emitter, GameEvents.CameraPan);
    const sys = new InputSystem({ emitter, now: () => Date.now() });

    sys.onPointerDown(touch(1, 100, 100));
    vi.advanceTimersByTime(50);
    sys.onPointerUp(touch(1, 100, 100));

    expect(tile.spy).toHaveBeenCalledTimes(1);
    expect(tile.payloads()[0]).toEqual({ kind: 'screen', x: 100, y: 100 });
    expect(inspect.spy).not.toHaveBeenCalled();
    expect(pan.spy).not.toHaveBeenCalled();
  });

  it('emits select:entity when hitTest resolves an entity', () => {
    const emitter = new SimpleEventEmitter();
    const entitySpy = spyOn(emitter, GameEvents.SelectEntity);
    const tileSpy = spyOn(emitter, GameEvents.SelectTile);
    const hitTest: HitTestFn = () => ({ kind: 'entity', id: 'orc-1' });
    const sys = new InputSystem({ emitter, hitTest });

    sys.onPointerDown(touch(1, 50, 50));
    vi.advanceTimersByTime(50);
    sys.onPointerUp(touch(1, 50, 50));

    expect(entitySpy.spy).toHaveBeenCalledTimes(1);
    expect(entitySpy.payloads()[0]).toEqual({ id: 'orc-1' });
    expect(tileSpy.spy).not.toHaveBeenCalled();
  });

  it('emits select:tile with tile coords when hitTest resolves a tile', () => {
    const emitter = new SimpleEventEmitter();
    const tile = spyOn(emitter, GameEvents.SelectTile);
    const hitTest: HitTestFn = () => ({ kind: 'tile', x: 4, y: 7 });
    const sys = new InputSystem({ emitter, hitTest });

    sys.onPointerDown(touch(1, 200, 200));
    vi.advanceTimersByTime(10);
    sys.onPointerUp(touch(1, 200, 200));

    expect(tile.payloads()[0]).toEqual({ kind: 'tile', x: 4, y: 7 });
  });
});

describe('InputSystem — long-press', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires inspect:show after the long-press threshold', () => {
    const emitter = new SimpleEventEmitter();
    const inspect = spyOn(emitter, GameEvents.InspectShow);
    const tile = spyOn(emitter, GameEvents.SelectTile);
    const sys = new InputSystem({ emitter });

    sys.onPointerDown(touch(1, 30, 40));
    vi.advanceTimersByTime(G.longPressDurationMs);

    expect(inspect.spy).toHaveBeenCalledTimes(1);
    expect(inspect.payloads()[0]).toEqual({
      kind: 'screen',
      x: 30,
      y: 40,
    });

    sys.onPointerUp(touch(1, 30, 40));
    expect(tile.spy).not.toHaveBeenCalled();
  });

  it('cancels long-press once movement exceeds drag threshold', () => {
    const emitter = new SimpleEventEmitter();
    const inspect = spyOn(emitter, GameEvents.InspectShow);
    const sys = new InputSystem({ emitter });

    sys.onPointerDown(touch(1, 0, 0));
    vi.advanceTimersByTime(100);
    // Move past dragThresholdPx (10) -> long-press cancelled.
    sys.onPointerMove(touch(1, G.dragThresholdPx + 5, 0));
    vi.advanceTimersByTime(G.longPressDurationMs);

    expect(inspect.spy).not.toHaveBeenCalled();
  });

  it('cancel() clears in-flight long-press timer', () => {
    const emitter = new SimpleEventEmitter();
    const inspect = spyOn(emitter, GameEvents.InspectShow);
    const sys = new InputSystem({ emitter });

    sys.onPointerDown(touch(1, 10, 10));
    sys.cancel();
    vi.advanceTimersByTime(G.longPressDurationMs);

    expect(inspect.spy).not.toHaveBeenCalled();
    expect(sys.activePointerCount).toBe(0);
  });
});

describe('InputSystem — drag (pan)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits camera:pan deltas and calls CameraLike.pan once dragging', () => {
    const emitter = new SimpleEventEmitter();
    const pan = spyOn(emitter, GameEvents.CameraPan);
    const camera: CameraLike = { pan: vi.fn(), zoom: vi.fn() };
    const sys = new InputSystem({ emitter, camera });

    sys.onPointerDown(touch(1, 0, 0));
    // First move below threshold — no pan yet.
    sys.onPointerMove(touch(1, 5, 0));
    expect(pan.spy).not.toHaveBeenCalled();
    // Cross the threshold.
    sys.onPointerMove(touch(1, 20, 0));
    // Subsequent moves stream pan deltas.
    sys.onPointerMove(touch(1, 30, 5));
    sys.onPointerMove(touch(1, 35, 7));

    // 3 pan emits since promotion (the threshold-crossing move + 2 more).
    expect(pan.spy).toHaveBeenCalledTimes(3);
    const calls = pan.payloads() as { dx: number; dy: number }[];
    const totalDx = calls.reduce((s, c) => s + c.dx, 0);
    const totalDy = calls.reduce((s, c) => s + c.dy, 0);
    expect(totalDx).toBe(35 - 5); // total movement after the first sub-threshold move
    expect(totalDy).toBe(7);
    expect(camera.pan).toHaveBeenCalledTimes(3);
  });

  it('does not fire select:tile after a drag', () => {
    const emitter = new SimpleEventEmitter();
    const tile = spyOn(emitter, GameEvents.SelectTile);
    const sys = new InputSystem({ emitter });

    sys.onPointerDown(touch(1, 0, 0));
    sys.onPointerMove(touch(1, 50, 0));
    sys.onPointerUp(touch(1, 50, 0));

    expect(tile.spy).not.toHaveBeenCalled();
  });

  it('emits camera:pan even when no CameraLike is provided', () => {
    const emitter = new SimpleEventEmitter();
    const pan = spyOn(emitter, GameEvents.CameraPan);
    const sys = new InputSystem({ emitter });

    sys.onPointerDown(touch(1, 0, 0));
    sys.onPointerMove(touch(1, 50, 0));
    sys.onPointerMove(touch(1, 60, 0));

    expect(pan.spy).toHaveBeenCalledTimes(2);
  });
});

describe('InputSystem — pinch (zoom)', () => {
  it('emits camera:zoom and calls CameraLike.zoom on a distance change', () => {
    const emitter = new SimpleEventEmitter();
    const zoom = spyOn(emitter, GameEvents.CameraZoom);
    const camera: CameraLike = { pan: vi.fn(), zoom: vi.fn() };
    const sys = new InputSystem({ emitter, camera });

    // Two pointers, initial separation = 100 px on the x axis.
    sys.onPointerDown(touch(1, 0, 0));
    sys.onPointerDown(touch(2, 100, 0));
    // Spread the second pointer to 200 -> new dist 200 -> factor 2.
    sys.onPointerMove(touch(2, 200, 0));

    expect(zoom.spy).toHaveBeenCalledTimes(1);
    const payload = zoom.payloads()[0] as { factor: number };
    expect(payload.factor).toBeCloseTo(2, 5);
    expect(camera.zoom).toHaveBeenCalledWith(2);
  });

  it('suppresses tap on each pointer after a pinch', () => {
    const emitter = new SimpleEventEmitter();
    const tile = spyOn(emitter, GameEvents.SelectTile);
    const inspect = spyOn(emitter, GameEvents.InspectShow);
    const sys = new InputSystem({ emitter });

    sys.onPointerDown(touch(1, 0, 0));
    sys.onPointerDown(touch(2, 100, 0));
    sys.onPointerMove(touch(2, 150, 0));
    sys.onPointerUp(touch(2, 150, 0));
    sys.onPointerUp(touch(1, 0, 0));

    expect(tile.spy).not.toHaveBeenCalled();
    expect(inspect.spy).not.toHaveBeenCalled();
  });

  it('ignores pinch jitter below pinchMinDelta', () => {
    const emitter = new SimpleEventEmitter();
    const zoom = spyOn(emitter, GameEvents.CameraZoom);
    const sys = new InputSystem({ emitter });

    sys.onPointerDown(touch(1, 0, 0));
    sys.onPointerDown(touch(2, 1000, 0));
    // 1000 -> 1005 = ratio 1.005, well below pinchMinDelta default 0.01.
    sys.onPointerMove(touch(2, 1005, 0));

    expect(zoom.spy).not.toHaveBeenCalled();
  });
});

describe('InputSystem — mouse fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('right-click maps to inspect:show', () => {
    const emitter = new SimpleEventEmitter();
    const inspect = spyOn(emitter, GameEvents.InspectShow);
    const tile = spyOn(emitter, GameEvents.SelectTile);
    const sys = new InputSystem({ emitter });

    sys.onPointerDown(mouseRight(40, 50));
    sys.onPointerUp(mouseRight(40, 50));

    expect(inspect.spy).toHaveBeenCalledTimes(1);
    expect(inspect.payloads()[0]).toEqual({
      kind: 'screen',
      x: 40,
      y: 50,
    });
    expect(tile.spy).not.toHaveBeenCalled();
  });

  it('left-click maps to tap (select:tile)', () => {
    const emitter = new SimpleEventEmitter();
    const tile = spyOn(emitter, GameEvents.SelectTile);
    const sys = new InputSystem({ emitter });

    sys.onPointerDown(mouseLeft(10, 10));
    vi.advanceTimersByTime(50);
    sys.onPointerUp(mouseLeft(10, 10));

    expect(tile.spy).toHaveBeenCalledTimes(1);
  });

  it('wheel maps to camera:zoom and calls CameraLike.zoom', () => {
    const emitter = new SimpleEventEmitter();
    const zoom = spyOn(emitter, GameEvents.CameraZoom);
    const camera: CameraLike = { pan: vi.fn(), zoom: vi.fn() };
    const sys = new InputSystem({ emitter, camera });

    sys.onWheel(-100);

    expect(zoom.spy).toHaveBeenCalledTimes(1);
    const payload = zoom.payloads()[0] as { factor: number };
    expect(payload.factor).toBeCloseTo(1 + 100 * G.wheelZoomStep, 5);
    expect(camera.zoom).toHaveBeenCalled();
  });
});

describe('InputSystem — config', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses JSON defaults when no config provided', () => {
    const emitter = new SimpleEventEmitter();
    const inspect = spyOn(emitter, GameEvents.InspectShow);
    const sys = new InputSystem({ emitter });

    sys.onPointerDown(touch(1, 0, 0));
    vi.advanceTimersByTime(G.longPressDurationMs - 1);
    expect(inspect.spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(inspect.spy).toHaveBeenCalledTimes(1);
  });

  it('honours per-instance config overrides', () => {
    const emitter = new SimpleEventEmitter();
    const inspect = spyOn(emitter, GameEvents.InspectShow);
    const sys = new InputSystem({
      emitter,
      config: { longPressDurationMs: 300 },
    });

    sys.onPointerDown(touch(1, 0, 0));
    vi.advanceTimersByTime(299);
    expect(inspect.spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(inspect.spy).toHaveBeenCalledTimes(1);
  });
});

describe('InputSystem — pointer bookkeeping', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks activePointerCount through down/up', () => {
    const emitter = new SimpleEventEmitter();
    const sys = new InputSystem({ emitter });

    expect(sys.activePointerCount).toBe(0);
    sys.onPointerDown(touch(1, 0, 0));
    expect(sys.activePointerCount).toBe(1);
    sys.onPointerDown(touch(2, 100, 0));
    expect(sys.activePointerCount).toBe(2);
    sys.onPointerUp(touch(2, 100, 0));
    expect(sys.activePointerCount).toBe(1);
    sys.onPointerUp(touch(1, 0, 0));
    expect(sys.activePointerCount).toBe(0);
  });
});
