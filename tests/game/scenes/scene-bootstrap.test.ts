import { describe, it, expect } from 'vitest';
import {
  createSceneBootstrap,
  type SceneStoreLike,
} from '@/game/scenes/scene-bootstrap';
import { GameEvents } from '@/game/systems';
import {
  SimpleEventEmitter,
  type EventEmitterLike,
} from '@/game/components';

/**
 * Smoke-style boot test for the scene-bootstrap factory (#26).
 *
 * The factory is the production wiring graph for `GameScene` — the
 * smoke test in `tests/integration/m1-smoke.test.ts` uses an
 * equivalent inline harness, but the live scene now goes through this
 * factory. We verify the graph composes without throwing against the
 * real m1-slice JSON, every system handle is non-null, and a single
 * `wave.start()` + a few `update()` ticks emits `wave:start`.
 *
 * We do NOT comprehensively re-test scene-level Phaser behaviour — that
 * is what the human-deferred manual playtest covers. This test is a
 * minimal go/no-go gate for the bootstrap module.
 */

class FakeStore implements SceneStoreLike {
  gold = 0;

  addGold(amount: number): void {
    if (amount <= 0) return;
    this.gold += amount;
  }

  spendGold(amount: number): boolean {
    if (amount < 0) return false;
    if (this.gold < amount) return false;
    this.gold -= amount;
    return true;
  }
}

function captureEvents(
  bus: EventEmitterLike,
  names: readonly string[],
): { name: string; payload: unknown }[] {
  const captured: { name: string; payload: unknown }[] = [];
  for (const name of names) {
    bus.on(name, (...args: unknown[]) => {
      captured.push({ name, payload: args[0] });
    });
  }
  return captured;
}

describe('scene-bootstrap factory (#26)', () => {
  it('composes every M1 system against m1-slice without throwing', () => {
    const bus = new SimpleEventEmitter();
    const store = new FakeStore();

    const systems = createSceneBootstrap({ emitter: bus, store });

    expect(systems.bus).toBe(bus);
    expect(systems.pathfinding).toBeDefined();
    expect(systems.damage).toBeDefined();
    expect(systems.ai).toBeDefined();
    expect(systems.building).toBeDefined();
    expect(systems.economy).toBeDefined();
    expect(systems.wave).toBeDefined();
    expect(systems.input).toBeDefined();
    expect(systems.hero).toBeDefined();

    // m1-slice anchors: edges + fort-core cell match the object layer.
    expect(systems.fortCoreCell).toEqual({ x: 30, y: 11 });
    expect(systems.edges.N).toEqual({ x: 19, y: 0 });
    expect(systems.edges.S).toEqual({ x: 19, y: 22 });
    expect(systems.edges.W).toEqual({ x: 0, y: 11 });
    expect(systems.rallyCell).toEqual({ x: 27, y: 11 });

    // Hero has Clomp'uk wired via the validated def.
    expect(systems.hero.def.ability.id).toBe('clompuk');

    systems.destroy();
  });

  it('emits wave:start on the shared bus after wave.start() + update()', () => {
    const bus = new SimpleEventEmitter();
    const store = new FakeStore();
    // No pre-placed orcs: this test isolates the wave-start signal,
    // not full combat. (Smoke test covers full combat.)
    const systems = createSceneBootstrap({
      emitter: bus,
      store,
      preplacedOrcCount: 0,
    });

    const events = captureEvents(bus, [GameEvents.WaveStart]);
    systems.wave.start();
    // wave-1's first spawn has a non-zero startDelay; one update tick
    // is enough to fire wave:start (the system emits it from
    // `beginWave` before any spawn timing).
    systems.wave.update(0.05);

    expect(events.length).toBe(1);
    expect(events[0]?.name).toBe(GameEvents.WaveStart);
    const payload = events[0]?.payload as { waveNumber?: number };
    expect(payload.waveNumber).toBe(1);

    systems.destroy();
  });
});
