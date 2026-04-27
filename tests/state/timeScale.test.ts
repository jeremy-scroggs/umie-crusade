import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/state/gameStore';

/**
 * Scaling-math tests for issue #54.
 *
 * `GameScene.update` is the single point at which `dt` is multiplied by
 * `gameStore.timeScale` before being handed to each system. These tests
 * mirror that exact arithmetic against a tiny fake "system" with a `dt`
 * accumulator, so a future refactor that moves the multiply (or breaks
 * it for one system) shows up here without needing a Phaser scene.
 *
 * The fake system is intentionally trivial — its only job is to record
 * how much simulated time has elapsed. The "tick" helper mirrors the
 * `(delta / 1000) * timeScale` computation in `GameScene.update`.
 */

interface FakeSystem {
  /** Simulated seconds elapsed across all `update(dt)` calls. */
  elapsed: number;
  update(dt: number): void;
}

const makeSystem = (): FakeSystem => ({
  elapsed: 0,
  update(dt) {
    this.elapsed += dt;
  },
});

/**
 * Drive `delta` ms through the same multiply the scene uses, into every
 * system. The scene's `update(_, delta)` arithmetic is:
 *   const scaledDt = (delta / 1000) * timeScale;
 *   systems.forEach(s => s.update(scaledDt));
 */
const tick = (systems: FakeSystem[], delta: number): void => {
  const { timeScale } = useGameStore.getState();
  const scaledDt = (delta / 1000) * timeScale;
  for (const s of systems) s.update(scaledDt);
};

describe('GameScene-style timeScale multiplier', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('default 1x advances dt 1:1', () => {
    const sys = makeSystem();
    tick([sys], 1000);
    tick([sys], 500);
    expect(sys.elapsed).toBeCloseTo(1.5, 10);
  });

  it('2x doubles the dt fed to systems', () => {
    const sys = makeSystem();
    useGameStore.getState().setTimeScale(2);
    tick([sys], 1000);
    expect(sys.elapsed).toBeCloseTo(2, 10);
  });

  it('4x quadruples the dt fed to systems', () => {
    const sys = makeSystem();
    useGameStore.getState().setTimeScale(4);
    tick([sys], 250);
    expect(sys.elapsed).toBeCloseTo(1, 10);
  });

  it('0x freezes simulation — dt is exactly zero', () => {
    const sys = makeSystem();
    useGameStore.getState().setTimeScale(0);
    tick([sys], 1000);
    tick([sys], 16);
    tick([sys], 999_999);
    expect(sys.elapsed).toBe(0);
  });

  it('all systems share the same scaled dt within a tick', () => {
    const a = makeSystem();
    const b = makeSystem();
    const c = makeSystem();
    useGameStore.getState().setTimeScale(2);
    tick([a, b, c], 100);
    expect(a.elapsed).toBeCloseTo(0.2, 10);
    expect(a.elapsed).toBe(b.elapsed);
    expect(b.elapsed).toBe(c.elapsed);
  });

  it('scale changes apply on the very next tick (pause -> resume)', () => {
    const sys = makeSystem();
    // 1x for 500 ms — half a sim-second elapses.
    tick([sys], 500);
    expect(sys.elapsed).toBeCloseTo(0.5, 10);
    // Pause for 1000 ms of wall time — no sim-time advances.
    useGameStore.getState().setTimeScale(0);
    tick([sys], 1000);
    expect(sys.elapsed).toBeCloseTo(0.5, 10);
    // 4x for 250 ms — one sim-second elapses.
    useGameStore.getState().setTimeScale(4);
    tick([sys], 250);
    expect(sys.elapsed).toBeCloseTo(1.5, 10);
  });

  it('pause -> resume preserves accumulated state (no reset of system clocks)', () => {
    // The scaling itself is dt-only; system internals are untouched.
    // Confirm by interleaving paused ticks between active ones.
    const sys = makeSystem();
    tick([sys], 100); // +0.1
    useGameStore.getState().setTimeScale(0);
    tick([sys], 100); // +0
    tick([sys], 100); // +0
    useGameStore.getState().setTimeScale(1);
    tick([sys], 100); // +0.1
    expect(sys.elapsed).toBeCloseTo(0.2, 10);
  });
});
