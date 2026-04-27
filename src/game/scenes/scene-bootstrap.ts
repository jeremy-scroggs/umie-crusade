/**
 * scene-bootstrap — factory that wires every M1 system together for the
 * live `GameScene` (#26).
 *
 * Mirrors `tests/integration/m1-smoke.test.ts`'s `buildHarness` shape so
 * the production scene composes the same graph the smoke test already
 * vets. Keeping the wiring as a stand-alone module (not inside the
 * Phaser scene class) means we can unit-test it in jsdom without
 * loading Phaser's canvas-feature detection.
 *
 * Every balance number flows from validated JSON defs imported here; no
 * hardcoded magic numbers. `aggroRadius` and `secondsPerMeleeAttack` are
 * structural defaults (the unit-def schema doesn't yet carry these per
 * #9's note); they live as ctor options so a future schema migration
 * can tighten them without touching the scene.
 */
import {
  AISystem,
  BuildingSystem,
  DamageSystem,
  Economy,
  GameEvents,
  InputSystem,
  Pathfinding,
  WaveSystem,
  type EconomyStoreLike,
  type FortCoreLike,
  type SpawnEdgeCells,
  type TiledMapLike,
  type BuildingStoreLike,
  type HitTestFn,
  type Cell,
} from '@/game/systems';
import { Hero } from '@/game/entities/Hero';
import { Orc } from '@/game/entities/Orc';
import type { Human } from '@/game/entities/Human';
import {
  Damageable,
  type EventEmitterLike,
} from '@/game/components';
import type { HeroDef, UnitDef, WallDef, WaveDef } from '@/types';

import m1Slice from '@/data/maps/m1-slice.json';
import peasantLevy from '@/data/humans/peasant-levy.json';
import mouggGruntJson from '@/data/orcs/mougg-grunt.json';
import wallWood from '@/data/buildings/wall-wood.json';
import muggrJson from '@/data/heroes/mougg-r.json';
import wave1 from '@/data/waves/m1-wave-1.json';
import wave2 from '@/data/waves/m1-wave-2.json';
import wave3 from '@/data/waves/m1-wave-3.json';
import wave4 from '@/data/waves/m1-wave-4.json';
import wave5 from '@/data/waves/m1-wave-5.json';

/**
 * Combined store contract — Economy needs `addGold/spendGold`,
 * BuildingSystem needs `gold + spendGold`. The live Zustand store
 * (`getGameStore()`) satisfies both shapes.
 */
export type SceneStoreLike = EconomyStoreLike & BuildingStoreLike;

/**
 * Cells for the m1-slice edges + fort-core. Derived from the object
 * layer in `src/data/maps/m1-slice.json` (px / tilewidth). Matches the
 * smoke-test constants — these are structural anchors of the slice map
 * itself, not balance numbers.
 */
const M1_EDGES: SpawnEdgeCells = {
  N: { x: 19, y: 0 },
  S: { x: 19, y: 22 },
  W: { x: 0, y: 11 },
};
const M1_FORT_CORE_CELL: Cell = { x: 30, y: 11 };
/** Rally cell — adjacent to fort, west side, in the open plain. */
const M1_RALLY_CELL: Cell = { x: 27, y: 11 };

/**
 * Structural defaults for AI tuning. These are NOT balance numbers — the
 * unit-def schema doesn't yet carry per-unit aggro / attack-rate (see
 * #9). They live here so a future schema migration can drop them in.
 * Values mirror the smoke-test harness for parity.
 */
const DEFAULT_AGGRO_TILES = 8;
const DEFAULT_SECONDS_PER_MELEE_ATTACK = 0.5;

/**
 * Placeholder fort-core HP. The smoke test uses 5000 — generous so
 * wave-defeat detection (not fort survival) drives the run. M2 will
 * replace this with a fort-core def. Lives as a ctor option so the
 * scene + tests can override.
 */
const DEFAULT_FORT_HP = 5000;

/** Pre-placed orc squad size at the rally cell. Structural placeholder
 * until the training-queue UI lands (M2). Smoke test uses 6 — match it. */
const DEFAULT_PRE_PLACED_ORC_COUNT = 6;

const HUMAN_DEFS: Readonly<Record<string, UnitDef>> = {
  'peasant-levy': peasantLevy as UnitDef,
};
const ORC_DEF = mouggGruntJson as UnitDef;
const HERO_DEF = muggrJson as HeroDef;
const WALL_DEF = wallWood as WallDef;
const M1_WAVES: WaveDef[] = [
  wave1 as WaveDef,
  wave2 as WaveDef,
  wave3 as WaveDef,
  wave4 as WaveDef,
  wave5 as WaveDef,
];

export interface SceneBootstrapOptions {
  /** Shared event bus across every system. */
  emitter: EventEmitterLike;
  /** Live game store (or a fake satisfying `SceneStoreLike` for tests). */
  store: SceneStoreLike;
  /** Override the parsed map (tests). Defaults to the bundled m1-slice. */
  map?: TiledMapLike;
  /** Override the fort-core cell (tests). Defaults to m1-slice's marker. */
  fortCoreCell?: Cell;
  /** Override the fort-core HP (M2 will pull from a def). */
  fortHp?: number;
  /** Override aggro radius in tiles (structural). */
  aggroTiles?: number;
  /** Override melee cadence (structural). */
  secondsPerMeleeAttack?: number;
  /** Override pre-placed orc squad size (M2 swaps in a training queue). */
  preplacedOrcCount?: number;
  /** Optional hit-tester for InputSystem. Defaults to a tile-grid hit-test. */
  hitTest?: HitTestFn;
  /**
   * Optional fan-out invoked for every spawned human, AFTER it has been
   * registered with `AISystem.registerHuman` and `Economy.registerHuman`
   * (so the new human's behaviour record exists by the time the
   * callback fires). Used by `GameScene` to bind a sprite + wire the
   * `gameStore.addSkull()` increment on each human's `'died'` event.
   * Default: no-op — preserves the existing factory contract.
   */
  onHumanSpawned?: (human: Human) => void;
  /**
   * Optional fan-out invoked once per pre-placed orc, AFTER it has been
   * registered with `AISystem.registerOrc`. Used by `GameScene` to bind
   * a sprite for the initial squad. Default: no-op.
   */
  onOrcPreplaced?: (orc: Orc) => void;
}

export interface SceneBootstrap {
  readonly bus: EventEmitterLike;
  readonly pathfinding: Pathfinding;
  readonly damage: DamageSystem;
  readonly ai: AISystem;
  readonly building: BuildingSystem;
  readonly economy: Economy;
  readonly wave: WaveSystem;
  readonly input: InputSystem;
  readonly hero: Hero;
  readonly fortCore: FortCoreLike;
  readonly edges: SpawnEdgeCells;
  readonly rallyCell: Cell;
  readonly fortCoreCell: Cell;
  /**
   * Pre-placed orc squad — handles to every orc registered via the
   * factory's pre-placement loop. Exposed so callers (GameScene's
   * sprite binder) can bind visuals after the factory finishes
   * without poking AISystem internals.
   */
  readonly preplacedOrcs: readonly Orc[];
  /** Tear down listeners + clear maps. Scene shutdown calls this. */
  destroy(): void;
}

/**
 * Construct every M1 system against the m1-slice map and a shared bus.
 * Returns a `SceneBootstrap` the scene holds for the lifetime of the
 * run. `wave.start()` is NOT called here — the scene calls it after
 * the systems are wired so test consumers can stage assertions before
 * the first wave fires.
 */
export function createSceneBootstrap(
  opts: SceneBootstrapOptions,
): SceneBootstrap {
  const bus = opts.emitter;
  const store = opts.store;
  const map = opts.map ?? (m1Slice as TiledMapLike);
  const fortCoreCell = opts.fortCoreCell ?? M1_FORT_CORE_CELL;
  const fortHp = opts.fortHp ?? DEFAULT_FORT_HP;
  const aggroTiles = opts.aggroTiles ?? DEFAULT_AGGRO_TILES;
  const secondsPerMeleeAttack =
    opts.secondsPerMeleeAttack ?? DEFAULT_SECONDS_PER_MELEE_ATTACK;
  const preplacedOrcCount =
    opts.preplacedOrcCount ?? DEFAULT_PRE_PLACED_ORC_COUNT;
  const edges = M1_EDGES;
  const rallyCell = M1_RALLY_CELL;

  const pathfinding = new Pathfinding(map, bus);
  const damage = new DamageSystem({ emitter: bus });

  // Fort-core: a Damageable on the shared bus + the fort-core cell.
  // Wave system listens to its 'died' event; M2 will swap a real
  // fort-core entity in.
  const fortDamageable = new Damageable({
    hp: fortHp,
    armor: 0,
    emitter: bus,
  });
  const fortCore: FortCoreLike = {
    cell: fortCoreCell,
    damageable: fortDamageable,
  };

  const building = new BuildingSystem({
    def: WALL_DEF,
    pathfinding,
    emitter: bus,
    store,
    fortCore: fortCoreCell,
    spawns: [edges.N, edges.S, edges.W],
  });

  const wallAt = (x: number, y: number) =>
    building.buildingAt({ x, y }) ?? null;

  const ai = new AISystem({
    pathfinding,
    damage,
    rally: rallyCell,
    fortGoal: fortCoreCell,
    pathEmitter: bus,
    aggroRadius: aggroTiles * pathfinding.tileWidth,
    secondsPerMeleeAttack,
    wallAt,
  });

  const economy = new Economy({ emitter: bus, store });

  const wave = new WaveSystem({
    waves: M1_WAVES,
    unitDefs: HUMAN_DEFS,
    edges,
    fortCore,
    emitter: bus,
    onSpawn: (human, edge) => {
      const cell = edges[edge];
      ai.registerHuman({ entity: human, cell });
      economy.registerHuman(human);
      opts.onHumanSpawned?.(human);
    },
  });

  // Pre-place a small orc squad at the rally cell. The smoke test does
  // the same — until a training-queue UI lands (M2), defenders spawn
  // with the run so the player has something to fight with.
  const preplacedOrcs: Orc[] = [];
  for (let i = 0; i < preplacedOrcCount; i += 1) {
    const orc = Orc.fromDef(ORC_DEF);
    ai.registerOrc({ entity: orc, cell: { x: rallyCell.x, y: rallyCell.y } });
    preplacedOrcs.push(orc);
    opts.onOrcPreplaced?.(orc);
  }

  // Hero (#16). The Hero is constructed against the shared bus so
  // ability-used events propagate to the HUD glue layer.
  const hero = Hero.fromDef(HERO_DEF, bus);

  // Default hit-test: pointer in screen-space px → cell. Scene glue can
  // override for camera-aware tests.
  const defaultHitTest: HitTestFn = (point) => {
    const cellX = Math.floor(point.x / pathfinding.tileWidth);
    const cellY = Math.floor(point.y / pathfinding.tileHeight);
    if (cellX < 0 || cellY < 0) return null;
    if (cellX >= pathfinding.width || cellY >= pathfinding.height) return null;
    return { kind: 'tile', x: cellX, y: cellY };
  };

  const input = new InputSystem({
    emitter: bus,
    hitTest: opts.hitTest ?? defaultHitTest,
  });

  return {
    bus,
    pathfinding,
    damage,
    ai,
    building,
    economy,
    wave,
    input,
    hero,
    fortCore,
    edges,
    rallyCell,
    fortCoreCell,
    preplacedOrcs,
    destroy: () => {
      wave.destroy();
      ai.destroy();
      input.cancel();
    },
  };
}

/**
 * Convenience re-export — keeps the GameEvents constant available to
 * callers that import the bootstrap module without forcing a second
 * import of the systems barrel.
 */
export { GameEvents };
