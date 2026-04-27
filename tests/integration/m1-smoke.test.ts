import { describe, it, expect } from 'vitest';
import {
  AISystem,
  BuildingSystem,
  DamageSystem,
  Economy,
  GameEvents,
  Pathfinding,
  WaveSystem,
} from '@/game/systems';
import type {
  EconomyStoreLike,
  FortCoreLike,
  SpawnEdgeCells,
  TiledMapLike,
} from '@/game/systems';
import { Human } from '@/game/entities/Human';
import { Orc } from '@/game/entities/Orc';
import {
  Damageable,
  SimpleEventEmitter,
  type EventEmitterLike,
} from '@/game/components';
import type { BuildingDef, UnitDef, WaveDef } from '@/types';

import m1Slice from '@/data/maps/m1-slice.json';
import peasantLevy from '@/data/humans/peasant-levy.json';
import mouggGrunt from '@/data/orcs/mougg-grunt.json';
import wallWood from '@/data/buildings/wall-wood.json';
import wave1 from '@/data/waves/m1-wave-1.json';
import wave2 from '@/data/waves/m1-wave-2.json';
import wave3 from '@/data/waves/m1-wave-3.json';
import wave4 from '@/data/waves/m1-wave-4.json';
import wave5 from '@/data/waves/m1-wave-5.json';

/**
 * M1 integration smoke — drives a full 5-wave run with every merged
 * system wired together (Pathfinding, Damage, AI, Wave, Economy,
 * BuildingSystem). This is the go/no-go gate for M1.
 *
 * The test runs in jsdom — same pattern as `tests/game/systems/Wave.test.ts`
 * and `AI.test.ts`. There is no Phaser scene, no canvas, no real clock; we
 * advance every system by a fixed `dt` per loop iteration and flush
 * microtasks between ticks so `Pathfinding.findPath` promises resolve.
 *
 * Win condition: `WaveSystem` emits `run:won` after wave 5 completes.
 * Bookkeeping: a small `EconomyStoreLike` fake captures gold flow.
 *
 * Why we pre-place orcs at the rally cell:
 *   The integration question is "do humans pathfind toward the fort while
 *   orcs intercept and kill them?" — that requires orcs in the field.
 *   Pre-placing avoids a second player-action subsystem (training
 *   queue) that's out of M1 scope.
 *
 * Why no walls:
 *   Wall placement is exercised by `tests/game/systems/Building.test.ts`
 *   (#14 / #15). Adding it here would couple the smoke to BuildingSystem
 *   state without adding signal for the win/lose pipeline. We DO
 *   construct the BuildingSystem against the real map to verify it
 *   integrates without wiring errors.
 */

const humanDef = peasantLevy as UnitDef;
const orcDef = mouggGrunt as UnitDef;
const wallDef = wallWood as BuildingDef;
const map = m1Slice as TiledMapLike;
const allWaves: WaveDef[] = [
  wave1 as WaveDef,
  wave2 as WaveDef,
  wave3 as WaveDef,
  wave4 as WaveDef,
  wave5 as WaveDef,
];

/** Edges parsed off the m1-slice object layer. Cell = px / tilewidth. */
const edges: SpawnEdgeCells = {
  N: { x: 19, y: 0 },
  S: { x: 19, y: 22 },
  W: { x: 0, y: 11 },
};
const fortCoreCell = { x: 30, y: 11 };
/** Rally cell — adjacent to fort, west side, in the open plain. */
const rallyCell = { x: 27, y: 11 };

/** In-memory EconomyStoreLike — keeps the smoke test off the live Zustand store. */
class FakeStore implements EconomyStoreLike {
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

/** Drain pending microtasks so `findPath` promise chains apply. */
async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve();
  }
}

/** Construct a fort-core mock backed by a real Damageable on the system bus. */
function makeFortCore(emitter: EventEmitterLike, hp: number): FortCoreLike {
  const damageable = new Damageable({ hp, armor: 0, emitter });
  return { cell: fortCoreCell, damageable };
}

interface SmokeHarness {
  bus: EventEmitterLike;
  store: FakeStore;
  pathfinding: Pathfinding;
  damage: DamageSystem;
  ai: AISystem;
  building: BuildingSystem;
  economy: Economy;
  wave: WaveSystem;
  fortCore: FortCoreLike;
  spawnedHumans: Human[];
  spawnedOrcs: Orc[];
  events: { name: string; payload: unknown }[];
}

/**
 * Wire every system up against the real m1 data. The bus is shared so
 * `wall:built` / `wave:complete` / `path:invalidated` propagate across
 * Pathfinding, Building, Wave, Economy and AI without a scene layer.
 */
function buildHarness(opts: { fortHp: number; orcCount: number }): SmokeHarness {
  const bus = new SimpleEventEmitter();
  const store = new FakeStore();

  const pathfinding = new Pathfinding(map, bus);
  const damage = new DamageSystem({ emitter: bus });

  const fortCore = makeFortCore(bus, opts.fortHp);

  // BuildingSystem is constructed but not driven — we want to verify it
  // composes against the real map without runtime errors.
  const building = new BuildingSystem({
    def: wallDef,
    pathfinding,
    emitter: bus,
    store,
    fortCore: fortCoreCell,
    spawns: [edges.N, edges.S, edges.W],
  });

  // AI consumes Building directly (#28) — no adapter needed.
  const wallAt = (x: number, y: number) =>
    building.buildingAt({ x, y }) ?? null;

  const ai = new AISystem({
    pathfinding,
    damage,
    rally: rallyCell,
    fortGoal: fortCoreCell,
    pathEmitter: bus,
    // Generous aggro so orcs near the fort can engage humans crossing
    // the corridor. 8 tiles ~ width of the map's central corridor.
    aggroRadius: 8 * pathfinding.tileWidth,
    secondsPerMeleeAttack: 0.5,
    wallAt,
  });

  const economy = new Economy({ emitter: bus, store });

  const spawnedHumans: Human[] = [];
  const spawnedOrcs: Orc[] = [];

  const wave = new WaveSystem({
    waves: allWaves,
    unitDefs: { 'peasant-levy': humanDef },
    edges,
    fortCore,
    emitter: bus,
    onSpawn: (human, edge) => {
      spawnedHumans.push(human);
      const cell = edges[edge];
      ai.registerHuman({ entity: human, cell });
      economy.registerHuman(human);
    },
  });

  // Pre-place orcs at the rally cell so the player has defenders. Each
  // orc carries its own emitter (default) so per-unit `'died'` doesn't
  // bleed across instances.
  for (let i = 0; i < opts.orcCount; i += 1) {
    const orc = Orc.fromDef(orcDef);
    spawnedOrcs.push(orc);
    ai.registerOrc({ entity: orc, cell: { x: rallyCell.x, y: rallyCell.y } });
  }

  // Capture the lifecycle events for assertions.
  const events: { name: string; payload: unknown }[] = [];
  for (const name of [
    GameEvents.WaveStart,
    GameEvents.WaveComplete,
    GameEvents.RunWon,
    GameEvents.RunLost,
  ]) {
    bus.on(name, (...args: unknown[]) => {
      events.push({ name, payload: args[0] });
    });
  }

  return {
    bus,
    store,
    pathfinding,
    damage,
    ai,
    building,
    economy,
    wave,
    fortCore,
    spawnedHumans,
    spawnedOrcs,
    events,
  };
}

/**
 * Drive the simulation forward until `predicate` returns true or
 * `maxTicks` elapses. Returns the number of ticks consumed.
 */
async function runUntil(
  h: SmokeHarness,
  dt: number,
  maxTicks: number,
  predicate: () => boolean,
): Promise<number> {
  for (let i = 0; i < maxTicks; i += 1) {
    h.ai.update(dt);
    h.damage.update(dt);
    h.wave.update(dt);
    h.economy.update(dt);
    await flush();
    if (predicate()) return i + 1;
  }
  return maxTicks;
}

describe('M1 smoke — full 5-wave playthrough', () => {
  it(
    'completes all five waves and emits run:won (AC)',
    async () => {
      // Generous fort HP so the smoke is about wave-defeat detection, not
      // a fort-survival edge. The unit fort-core test already covers low-HP
      // run:lost.
      const h = buildHarness({ fortHp: 5000, orcCount: 6 });
      h.wave.start();

      const dt = 1 / 30;
      // Cap: wave-5 spawns finish at ~22s sim time, then orc kill + travel
      // takes another ~30s in the worst case. 5 minutes of sim time at 30Hz
      // = 9000 ticks, plenty of margin.
      const maxTicks = 30 * 60 * 5;
      const consumed = await runUntil(h, dt, maxTicks, () => h.wave.isWon || h.wave.isLost);

      expect(h.wave.isLost).toBe(false);
      expect(h.wave.isWon).toBe(true);

      // Run finished within the cap.
      expect(consumed).toBeLessThan(maxTicks);

      // Lifecycle: every wave emitted both wave:start and wave:complete,
      // plus a single run:won at the end.
      const starts = h.events.filter((e) => e.name === GameEvents.WaveStart);
      const completes = h.events.filter(
        (e) => e.name === GameEvents.WaveComplete,
      );
      const wons = h.events.filter((e) => e.name === GameEvents.RunWon);
      const losts = h.events.filter((e) => e.name === GameEvents.RunLost);

      expect(starts.length).toBe(5);
      expect(completes.length).toBe(5);
      expect(wons.length).toBe(1);
      expect(losts.length).toBe(0);

      // run:won fires AFTER the last wave:complete.
      const lastCompleteIdx = h.events.findLastIndex(
        (e) => e.name === GameEvents.WaveComplete,
      );
      const wonIdx = h.events.findIndex((e) => e.name === GameEvents.RunWon);
      expect(wonIdx).toBeGreaterThan(lastCompleteIdx);

      // Economy: gold accrued from peasant goldDrop (4 each, ~50 humans
      // total across 5 waves) PLUS wave rewards (25+35+45+60+100 = 265).
      // Lower bound is just the wave rewards (humans can theoretically
      // reach the fort in degenerate balance, but we sized fort HP so they
      // don't). Use the reward sum as a tight lower bound.
      const rewardSum = allWaves.reduce((s, w) => s + w.reward.gold, 0);
      expect(h.store.gold).toBeGreaterThanOrEqual(rewardSum);

      // At least one orc survived the run.
      const aliveOrcs = h.spawnedOrcs.filter((o) => !o.damageable.dead);
      expect(aliveOrcs.length).toBeGreaterThan(0);
    },
    30000,
  );
});
