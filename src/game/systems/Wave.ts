import type { SpawnEdge, UnitDef, WaveDef, WaveSpawn } from '@/types';
import { SimpleEventEmitter } from '@/game/components';
import type { EventEmitterLike } from '@/game/components';
import { Human } from '@/game/entities/Human';
import type { Cell } from './Pathfinding';
import { GameEvents } from './events';
import type {
  RunLostPayload,
  RunWonPayload,
  WaveCompletePayload,
  WaveStartPayload,
} from './events';

/**
 * Wave — runtime system that drives spawn timing, fort-core game-over,
 * and run win/lose detection.
 *
 * Responsibilities:
 *  - Read a `WaveDef[]` (sorted by `number`, supplied at construction —
 *    tests inject mocks; production uses {@link loadM1Waves}) and emit
 *    `Human` entities at the configured `edge` cell with the configured
 *    `startDelay` + `interval` cadence.
 *  - Emit `wave:start` at the start of each wave and `wave:complete`
 *    when every spawned human in the wave is dead. After the final
 *    wave's `wave:complete`, emit `run:won`.
 *  - Watch the fort-core's `damageable.died` and emit `run:lost` once
 *    when HP hits 0. After that, all further spawns are suppressed.
 *
 * Design notes:
 *  - `onSpawn(human, edge)` is the only outward channel for the
 *    spawned entity. The scene wires this into `AISystem.registerHuman`
 *    + any sprite/group bookkeeping. The wave system itself never
 *    references the AI system — keeps coupling at the scene layer.
 *  - `humansProvider` defaults to "every human this system spawned that
 *    isn't dead", so a basic run needs zero extra wiring. Callers can
 *    override (e.g. if death-tracking lives elsewhere).
 *  - Zero hardcoded balance numbers. Counts, edges, delays, intervals,
 *    rewards, and the wave order all flow from the validated `WaveDef`.
 *  - Pure TS — no Phaser top-level import; runs in jsdom for tests.
 */

/**
 * Structural shape the fort-core needs to expose. We keep this loose so
 * the scene can plug in any `Building` (or future fort-core entity)
 * whose `damageable` reports death via the standard `'died'` event.
 */
export interface FortCoreLike {
  /** Cell on the grid the fort-core occupies. */
  readonly cell: Cell;
  /** Damageable component — dead flag + emitter. */
  readonly damageable: {
    readonly dead: boolean;
    readonly emitter: EventEmitterLike;
  };
}

/** Mapping from spawn edge to the cell where humans are emitted. */
export type SpawnEdgeCells = Readonly<Record<SpawnEdge, Cell>>;

export interface WaveSystemOptions {
  /** Wave definitions, in play order. Sorted by `number` ascending. */
  waves: readonly WaveDef[];
  /** UnitDef registry keyed by `unitId` — the spawner looks up def here. */
  unitDefs: Readonly<Record<string, UnitDef>>;
  /** Edge → cell map. Caller derives this from the Tiled map markers. */
  edges: SpawnEdgeCells;
  /** Fort-core entity. Its death triggers `run:lost`. */
  fortCore: FortCoreLike;
  /**
   * Invoked for every human the system spawns. The scene typically calls
   * `AISystem.registerHuman` here and tracks the sprite. Spawned humans
   * are also tracked internally for "wave defeated" detection.
   */
  onSpawn: (human: Human, edge: SpawnEdge) => void;
  /** Optional system event bus — defaults to a `SimpleEventEmitter`. */
  emitter?: EventEmitterLike;
  /**
   * Source of currently-alive humans for "wave defeated" detection.
   * Defaults to the system's own `spawnedHumans` set (filtered by
   * `damageable.dead`).
   */
  humansProvider?: () => Iterable<Human>;
}

/** Internal per-spawn-entry record. */
interface ActiveSpawn {
  readonly spawn: WaveSpawn;
  emittedCount: number;
  /** Wave-relative second timestamp for the next emission. */
  nextAt: number;
}

/** Internal per-wave record. */
interface ActiveWave {
  readonly def: WaveDef;
  readonly activeSpawns: ActiveSpawn[];
  readonly spawnedHumans: Set<Human>;
  /** Seconds elapsed since `start()` of this wave. */
  elapsed: number;
  startEmitted: boolean;
  completeEmitted: boolean;
}

export class WaveSystem {
  readonly emitter: EventEmitterLike;
  readonly waves: readonly WaveDef[];
  readonly edges: SpawnEdgeCells;

  private readonly unitDefs: Readonly<Record<string, UnitDef>>;
  private readonly fortCore: FortCoreLike;
  private readonly onSpawn: (human: Human, edge: SpawnEdge) => void;
  private readonly humansProvider: () => Iterable<Human>;

  private currentIndex = 0;
  private current: ActiveWave | null = null;
  private started = false;
  private destroyed = false;
  private runWonEmitted = false;
  private runLostEmitted = false;

  /** Set of every human ever spawned by this system (alive + dead). */
  private readonly allSpawned: Set<Human> = new Set();

  private readonly onFortDied = (): void => {
    if (this.runLostEmitted) return;
    this.runLostEmitted = true;
    this.destroyed = true;
    const payload: RunLostPayload = { reason: 'fort-destroyed' };
    this.emitter.emit(GameEvents.RunLost, payload);
  };

  constructor(opts: WaveSystemOptions) {
    this.waves = [...opts.waves].sort((a, b) => a.number - b.number);
    this.unitDefs = opts.unitDefs;
    this.edges = opts.edges;
    this.fortCore = opts.fortCore;
    this.onSpawn = opts.onSpawn;
    this.emitter = opts.emitter ?? new SimpleEventEmitter();
    this.humansProvider =
      opts.humansProvider ?? (() => this.defaultHumansProvider());

    // Subscribe once to the fort-core's death event. Damageable emits
    // `'died'` exactly once on its own emitter.
    this.fortCore.damageable.emitter.on('died', this.onFortDied);
  }

  /** Tear down — unsubscribes from fort-core and clears tracked sets. */
  destroy(): void {
    this.destroyed = true;
    this.fortCore.damageable.emitter.off('died', this.onFortDied);
    this.allSpawned.clear();
    this.current = null;
  }

  /**
   * Begin the run. Initialises wave 0 and emits its `wave:start`. Idempotent
   * — calling again is a no-op (matches scene init re-entrancy).
   */
  start(): void {
    if (this.started || this.destroyed) return;
    if (this.waves.length === 0) return;
    this.started = true;
    this.beginWave(0);
  }

  /** True once `start()` has been called and the run hasn't ended. */
  get isRunning(): boolean {
    return this.started && !this.destroyed;
  }

  /** True if `run:lost` has fired. */
  get isLost(): boolean {
    return this.runLostEmitted;
  }

  /** True if `run:won` has fired. */
  get isWon(): boolean {
    return this.runWonEmitted;
  }

  /** Index of the wave currently running (0-based), or -1 if not started. */
  get currentWaveIndex(): number {
    return this.current ? this.currentIndex : -1;
  }

  /** Per-tick step. Advances spawn timers and checks wave completion. */
  update(dt: number): void {
    if (!this.started || this.destroyed) return;
    const w = this.current;
    if (!w) return;

    w.elapsed += dt;

    // Fire any due spawn emissions. A single tick can emit more than one
    // human if `dt` exceeds the spawn `interval`.
    for (const active of w.activeSpawns) {
      while (
        active.emittedCount < active.spawn.count &&
        w.elapsed >= active.nextAt
      ) {
        this.emitSpawn(w, active);
      }
    }

    // Check wave completion: all spawn entries fully emitted AND every
    // alive-tracked human is dead.
    if (!w.completeEmitted && this.allSpawnsExhausted(w) && this.allDead(w)) {
      w.completeEmitted = true;
      const payload: WaveCompletePayload = {
        waveId: w.def.id,
        waveNumber: w.def.number,
        reward: { gold: w.def.reward.gold },
      };
      this.emitter.emit(GameEvents.WaveComplete, payload);
      this.advanceAfterComplete();
    }
  }

  /**
   * Emit a single human for an active spawn entry. Looks up the def by
   * `unitId` (throws if missing — a malformed wave file is loud failure
   * by design), constructs a `Human`, places it at the edge cell, and
   * fans out via `onSpawn`.
   */
  private emitSpawn(w: ActiveWave, active: ActiveSpawn): void {
    const def = this.unitDefs[active.spawn.unitId];
    if (!def) {
      throw new Error(
        `WaveSystem: unknown unitId '${active.spawn.unitId}' in wave '${w.def.id}'`,
      );
    }
    const human = Human.fromDef(def);
    w.spawnedHumans.add(human);
    this.allSpawned.add(human);

    active.emittedCount += 1;
    if (active.emittedCount < active.spawn.count) {
      active.nextAt += active.spawn.interval;
    }

    // Fanout — let the scene wire AI / sprites. The cell is the edge
    // cell; the AI system will pathfind from here toward the fort goal.
    this.onSpawn(human, active.spawn.edge);
  }

  /** Initialise the wave at `index` and emit `wave:start`. */
  private beginWave(index: number): void {
    const def = this.waves[index];
    if (!def) return;

    const activeSpawns: ActiveSpawn[] = def.spawns.map((spawn) => ({
      spawn,
      emittedCount: 0,
      nextAt: spawn.startDelay,
    }));

    this.currentIndex = index;
    this.current = {
      def,
      activeSpawns,
      spawnedHumans: new Set<Human>(),
      elapsed: 0,
      startEmitted: false,
      completeEmitted: false,
    };

    const payload: WaveStartPayload = {
      waveId: def.id,
      waveNumber: def.number,
      cry: def.cry,
    };
    this.current.startEmitted = true;
    this.emitter.emit(GameEvents.WaveStart, payload);
  }

  /**
   * Called after a wave's `wave:complete` fires. If a next wave exists,
   * begin it; otherwise emit `run:won` exactly once.
   */
  private advanceAfterComplete(): void {
    const nextIndex = this.currentIndex + 1;
    if (nextIndex < this.waves.length) {
      this.beginWave(nextIndex);
      return;
    }
    if (!this.runWonEmitted) {
      this.runWonEmitted = true;
      const last = this.waves[this.waves.length - 1]!;
      const payload: RunWonPayload = { lastWaveNumber: last.number };
      this.emitter.emit(GameEvents.RunWon, payload);
    }
    this.current = null;
  }

  private allSpawnsExhausted(w: ActiveWave): boolean {
    for (const a of w.activeSpawns) {
      if (a.emittedCount < a.spawn.count) return false;
    }
    return true;
  }

  /**
   * "All spawned humans of this wave are dead" — defers to the
   * `humansProvider` source-of-truth so callers can swap in a different
   * tracker (e.g. a scene-level alive-set). The default reads the
   * wave's own `spawnedHumans` set.
   */
  private allDead(w: ActiveWave): boolean {
    if (w.spawnedHumans.size === 0) {
      // No humans ever spawned — defensive; only true when count totals 0.
      return true;
    }
    const alive = new Set<Human>();
    for (const h of this.humansProvider()) {
      if (!h.damageable.dead) alive.add(h);
    }
    for (const h of w.spawnedHumans) {
      if (alive.has(h)) return false;
    }
    return true;
  }

  /** Default humans provider — every spawned human, alive or dead. */
  private *defaultHumansProvider(): IterableIterator<Human> {
    for (const h of this.allSpawned) {
      yield h;
    }
  }
}
