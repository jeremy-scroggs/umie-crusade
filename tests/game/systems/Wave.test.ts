import { describe, it, expect, vi } from 'vitest';
import { WaveSystem, GameEvents } from '@/game/systems';
import type { FortCoreLike, SpawnEdgeCells } from '@/game/systems';
import { Damageable, SimpleEventEmitter } from '@/game/components';
import { Human } from '@/game/entities/Human';
import peasantLevy from '@/data/humans/peasant-levy.json';
import type { SpawnEdge, UnitDef, WaveDef } from '@/types';

const humanDef = peasantLevy as UnitDef;
const unitDefs = { 'peasant-levy': humanDef };

const edges: SpawnEdgeCells = {
  N: { x: 19, y: 0 },
  S: { x: 19, y: 22 },
  W: { x: 0, y: 11 },
};

/** Build a minimal fort-core mock backed by a real `Damageable`. */
function makeFortCore(hp = 500): FortCoreLike & { damageable: Damageable } {
  const emitter = new SimpleEventEmitter();
  const damageable = new Damageable({ hp, armor: 0, emitter });
  return {
    cell: { x: 30, y: 11 },
    damageable,
  };
}

/** Inline wave def — keeps timing assertions independent of the M1 balance. */
function wave(
  number: number,
  spawns: WaveDef['spawns'],
  rewardGold = 10,
  cry?: string,
): WaveDef {
  return {
    id: `test-wave-${number}`,
    number,
    spawns,
    reward: { gold: rewardGold },
    cry,
  };
}

describe('WaveSystem — spawn count + timing (AC)', () => {
  it('respects startDelay and interval; spawns exactly count humans', () => {
    const fortCore = makeFortCore();
    const onSpawn = vi.fn<(h: Human, e: SpawnEdge) => void>();
    const sys = new WaveSystem({
      waves: [
        wave(1, [
          {
            unitId: 'peasant-levy',
            count: 3,
            edge: 'N',
            startDelay: 2,
            interval: 1,
          },
        ]),
      ],
      unitDefs,
      edges,
      fortCore,
      onSpawn,
      emitter: new SimpleEventEmitter(),
    });

    sys.start();

    // Before t=2 — no spawns.
    sys.update(1.0);
    expect(onSpawn).toHaveBeenCalledTimes(0);
    sys.update(0.9);
    expect(onSpawn).toHaveBeenCalledTimes(0);

    // Cross t=2 → first spawn fires.
    sys.update(0.2);
    expect(onSpawn).toHaveBeenCalledTimes(1);

    // t=3 → second spawn.
    sys.update(1.0);
    expect(onSpawn).toHaveBeenCalledTimes(2);

    // t=4 → third (final) spawn.
    sys.update(1.0);
    expect(onSpawn).toHaveBeenCalledTimes(3);

    // Further ticks must not over-spawn.
    sys.update(5.0);
    expect(onSpawn).toHaveBeenCalledTimes(3);
  });

  it('emits at the configured edge cell per spawn entry', () => {
    const fortCore = makeFortCore();
    const seen: SpawnEdge[] = [];
    const sys = new WaveSystem({
      waves: [
        wave(1, [
          {
            unitId: 'peasant-levy',
            count: 1,
            edge: 'N',
            startDelay: 0,
            interval: 0,
          },
          {
            unitId: 'peasant-levy',
            count: 1,
            edge: 'W',
            startDelay: 0,
            interval: 0,
          },
        ]),
      ],
      unitDefs,
      edges,
      fortCore,
      onSpawn: (_h, edge) => {
        seen.push(edge);
      },
      emitter: new SimpleEventEmitter(),
    });
    sys.start();
    sys.update(0.1);
    expect(seen.sort()).toEqual(['N', 'W']);
  });

  it('handles a single tick larger than the interval (multi-spawn per update)', () => {
    const fortCore = makeFortCore();
    const onSpawn = vi.fn<(h: Human, e: SpawnEdge) => void>();
    const sys = new WaveSystem({
      waves: [
        wave(1, [
          {
            unitId: 'peasant-levy',
            count: 4,
            edge: 'N',
            startDelay: 0,
            interval: 0.5,
          },
        ]),
      ],
      unitDefs,
      edges,
      fortCore,
      onSpawn,
      emitter: new SimpleEventEmitter(),
    });
    sys.start();
    // dt=10s — well past every emission. Should fire all 4.
    sys.update(10);
    expect(onSpawn).toHaveBeenCalledTimes(4);
  });
});

describe('WaveSystem — wave:start / wave:complete events', () => {
  it('emits wave:start on start() with the wave def metadata', () => {
    const fortCore = makeFortCore();
    const onWaveStart = vi.fn();
    const sys = new WaveSystem({
      waves: [
        wave(
          1,
          [
            {
              unitId: 'peasant-levy',
              count: 1,
              edge: 'N',
              startDelay: 0,
              interval: 0,
            },
          ],
          25,
          'battle.waveStart',
        ),
      ],
      unitDefs,
      edges,
      fortCore,
      onSpawn: () => {},
      emitter: new SimpleEventEmitter(),
    });
    sys.emitter.on(GameEvents.WaveStart, onWaveStart);
    sys.start();
    expect(onWaveStart).toHaveBeenCalledTimes(1);
    expect(onWaveStart.mock.calls[0]![0]).toMatchObject({
      waveId: 'test-wave-1',
      waveNumber: 1,
      cry: 'battle.waveStart',
    });
  });

  it('emits wave:complete only after every spawned human is dead (AC)', () => {
    const fortCore = makeFortCore();
    const spawned: Human[] = [];
    const onWaveComplete = vi.fn();
    const sys = new WaveSystem({
      waves: [
        wave(
          1,
          [
            {
              unitId: 'peasant-levy',
              count: 2,
              edge: 'N',
              startDelay: 0,
              interval: 0.5,
            },
          ],
          25,
        ),
      ],
      unitDefs,
      edges,
      fortCore,
      onSpawn: (h) => {
        spawned.push(h);
      },
      emitter: new SimpleEventEmitter(),
    });
    sys.emitter.on(GameEvents.WaveComplete, onWaveComplete);

    sys.start();
    sys.update(2); // emits both spawns.
    expect(spawned.length).toBe(2);
    // No complete yet — humans alive.
    expect(onWaveComplete).not.toHaveBeenCalled();
    sys.update(1);
    expect(onWaveComplete).not.toHaveBeenCalled();

    // Kill the first — still one alive, no complete.
    spawned[0]!.damageable.applyDamage(spawned[0]!.damageable.hp);
    sys.update(0.1);
    expect(onWaveComplete).not.toHaveBeenCalled();

    // Kill the second — complete fires once.
    spawned[1]!.damageable.applyDamage(spawned[1]!.damageable.hp);
    sys.update(0.1);
    expect(onWaveComplete).toHaveBeenCalledTimes(1);
    expect(onWaveComplete.mock.calls[0]![0]).toMatchObject({
      waveId: 'test-wave-1',
      waveNumber: 1,
      reward: { gold: 25 },
    });
  });
});

describe('WaveSystem — multi-wave + run:won', () => {
  it('begins next wave after wave:complete; emits run:won after the final wave (AC)', () => {
    const fortCore = makeFortCore();
    const spawned: Human[] = [];
    const startSpy = vi.fn();
    const completeSpy = vi.fn();
    const wonSpy = vi.fn();
    const lostSpy = vi.fn();

    const sys = new WaveSystem({
      waves: [
        wave(1, [
          {
            unitId: 'peasant-levy',
            count: 1,
            edge: 'N',
            startDelay: 0,
            interval: 0,
          },
        ]),
        wave(2, [
          {
            unitId: 'peasant-levy',
            count: 1,
            edge: 'S',
            startDelay: 0,
            interval: 0,
          },
        ]),
      ],
      unitDefs,
      edges,
      fortCore,
      onSpawn: (h) => spawned.push(h),
      emitter: new SimpleEventEmitter(),
    });

    sys.emitter.on(GameEvents.WaveStart, startSpy);
    sys.emitter.on(GameEvents.WaveComplete, completeSpy);
    sys.emitter.on(GameEvents.RunWon, wonSpy);
    sys.emitter.on(GameEvents.RunLost, lostSpy);

    sys.start();
    sys.update(0.1);
    expect(spawned.length).toBe(1);
    spawned[0]!.damageable.applyDamage(spawned[0]!.damageable.hp);
    sys.update(0.1);

    expect(completeSpy).toHaveBeenCalledTimes(1);
    expect(startSpy).toHaveBeenCalledTimes(2); // wave 1, then wave 2.

    // Kill wave 2's lone spawn.
    sys.update(0.1);
    expect(spawned.length).toBe(2);
    spawned[1]!.damageable.applyDamage(spawned[1]!.damageable.hp);
    sys.update(0.1);

    expect(completeSpy).toHaveBeenCalledTimes(2);
    expect(wonSpy).toHaveBeenCalledTimes(1);
    expect(wonSpy.mock.calls[0]![0]).toMatchObject({ lastWaveNumber: 2 });
    expect(lostSpy).not.toHaveBeenCalled();
    expect(sys.isWon).toBe(true);
  });

  it('sorts waves by number — out-of-order ctor input plays in 1,2,3 order', () => {
    const fortCore = makeFortCore();
    const startSpy = vi.fn();
    const sys = new WaveSystem({
      waves: [wave(3, [oneSpawn('N')]), wave(1, [oneSpawn('N')]), wave(2, [oneSpawn('N')])],
      unitDefs,
      edges,
      fortCore,
      onSpawn: () => {},
      emitter: new SimpleEventEmitter(),
    });
    sys.emitter.on(GameEvents.WaveStart, startSpy);
    sys.start();
    expect(startSpy.mock.calls[0]![0]).toMatchObject({ waveNumber: 1 });
  });
});

describe('WaveSystem — run:lost (fort-core destruction) (AC)', () => {
  it('emits run:lost when fort-core dies and stops further spawns', () => {
    const fortCore = makeFortCore(50);
    const onSpawn = vi.fn<(h: Human, e: SpawnEdge) => void>();
    const lostSpy = vi.fn();
    const wonSpy = vi.fn();

    const sys = new WaveSystem({
      waves: [
        wave(1, [
          {
            unitId: 'peasant-levy',
            count: 5,
            edge: 'N',
            startDelay: 0,
            interval: 1,
          },
        ]),
      ],
      unitDefs,
      edges,
      fortCore,
      onSpawn,
      emitter: new SimpleEventEmitter(),
    });
    sys.emitter.on(GameEvents.RunLost, lostSpy);
    sys.emitter.on(GameEvents.RunWon, wonSpy);

    sys.start();
    sys.update(0.1);
    expect(onSpawn).toHaveBeenCalledTimes(1);

    // Kill the fort-core mid-wave.
    fortCore.damageable.applyDamage(999);
    expect(lostSpy).toHaveBeenCalledTimes(1);
    expect(lostSpy.mock.calls[0]![0]).toMatchObject({ reason: 'fort-destroyed' });
    expect(sys.isLost).toBe(true);

    // Subsequent updates do not spawn anyone new.
    const before = onSpawn.mock.calls.length;
    sys.update(10);
    expect(onSpawn.mock.calls.length).toBe(before);
    expect(wonSpy).not.toHaveBeenCalled();
  });

  it('emits run:lost only once even on repeated death events', () => {
    const fortCore = makeFortCore(10);
    const lostSpy = vi.fn();
    const sys = new WaveSystem({
      waves: [wave(1, [oneSpawn('N')])],
      unitDefs,
      edges,
      fortCore,
      onSpawn: () => {},
      emitter: new SimpleEventEmitter(),
    });
    sys.emitter.on(GameEvents.RunLost, lostSpy);
    sys.start();
    fortCore.damageable.applyDamage(999);
    // Damageable guards against double-emit, but be defensive:
    fortCore.damageable.emitter.emit('died');
    expect(lostSpy).toHaveBeenCalledTimes(1);
  });
});

describe('WaveSystem — lifecycle', () => {
  it('start() is idempotent', () => {
    const fortCore = makeFortCore();
    const startSpy = vi.fn();
    const sys = new WaveSystem({
      waves: [wave(1, [oneSpawn('N')])],
      unitDefs,
      edges,
      fortCore,
      onSpawn: () => {},
      emitter: new SimpleEventEmitter(),
    });
    sys.emitter.on(GameEvents.WaveStart, startSpy);
    sys.start();
    sys.start();
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('destroy() unsubscribes the fort-core listener', () => {
    const fortCore = makeFortCore();
    const lostSpy = vi.fn();
    const sys = new WaveSystem({
      waves: [wave(1, [oneSpawn('N')])],
      unitDefs,
      edges,
      fortCore,
      onSpawn: () => {},
      emitter: new SimpleEventEmitter(),
    });
    sys.emitter.on(GameEvents.RunLost, lostSpy);
    sys.start();
    sys.destroy();
    fortCore.damageable.applyDamage(9999);
    expect(lostSpy).not.toHaveBeenCalled();
  });

  it('throws on unknown unitId — loud failure for malformed wave files', () => {
    const fortCore = makeFortCore();
    const sys = new WaveSystem({
      waves: [
        wave(1, [
          {
            unitId: 'no-such-unit',
            count: 1,
            edge: 'N',
            startDelay: 0,
            interval: 0,
          },
        ]),
      ],
      unitDefs,
      edges,
      fortCore,
      onSpawn: () => {},
      emitter: new SimpleEventEmitter(),
    });
    sys.start();
    expect(() => sys.update(0.1)).toThrow(/unknown unitId/);
  });
});

/** Tiny helper for tests that don't care about spawn shape. */
function oneSpawn(edge: SpawnEdge): WaveDef['spawns'][number] {
  return {
    unitId: 'peasant-levy',
    count: 1,
    edge,
    startDelay: 0,
    interval: 0,
  };
}
