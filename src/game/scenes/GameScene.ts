import Phaser from 'phaser';
import { getGameStore, subscribeGameStore } from '@/state/bridge';
import { SimpleEventEmitter } from '@/game/components';
import {
  GameEvents,
  type SelectTilePayload,
  type WaveStartPayload,
  type WaveCompletePayload,
} from '@/game/systems';
import {
  createSceneBootstrap,
  type SceneBootstrap,
} from './scene-bootstrap';
import { setActiveSystems } from './gameBridge';
import {
  SpriteBinder,
  rectangleFactoryFromScene,
} from './sprite-binder';

/**
 * GameScene — the live M1 vertical-slice scene.
 *
 * Responsibilities:
 *  - Load the `m1-slice` Tiled map (already preloaded in PreloadScene).
 *  - Construct the M1 system graph via `createSceneBootstrap` and
 *    publish the result on `gameBridge` so the React UI overlay
 *    (BuildPanel) can call into `BuildingSystem` without prop-drilling.
 *  - Drive `update(dt)` for AI, Damage, Wave, Economy each frame.
 *  - Adapt Phaser pointer events into the system's `InputSystem` and
 *    forward the resulting `select:tile` event into the gameStore so
 *    BuildPanel reacts.
 *  - Bridge wave lifecycle into the gameStore (`setWave`,
 *    `triggerWaveStart`).
 *  - Tear down on shutdown — destroy systems + clear the bridge ref.
 *
 * Replay is "free" — `<PhaserGame />` is unmounted/remounted by App.tsx
 * when `runStatus` flips, so a fresh `Phaser.Game` is constructed and
 * this scene boots clean. No replay logic needed inside the scene.
 */
export class GameScene extends Phaser.Scene {
  private map!: Phaser.Tilemaps.Tilemap;
  private systems: SceneBootstrap | null = null;
  private spriteBinder: SpriteBinder | null = null;
  private offSelectTile: (() => void) | null = null;
  private offWaveStart: (() => void) | null = null;
  private offWaveComplete: (() => void) | null = null;
  private offTimeScale: (() => void) | null = null;

  constructor() {
    super({ key: 'Game' });
  }

  create(): void {
    // 1. Tilemap. The PreloadScene cached `m1-slice` already.
    this.map = this.make.tilemap({ key: 'm1-slice' });
    const tileset = this.map.addTilesetImage(
      'placeholder',
      'placeholder-tileset',
    );
    if (tileset) {
      // Render every tile layer the m1-slice ships with. Iteration
      // mirrors what Tiled's exported map produces — ground / forest /
      // water — without hardcoding layer names.
      for (const layerData of this.map.layers) {
        this.map.createLayer(layerData.name, tileset, 0, 0);
      }
    }

    // 2. Wire systems. The shared SimpleEventEmitter is what every
    // system fans out on — same shape the smoke test uses. The sprite
    // binder is constructed AFTER systems so the bootstrap's
    // `onHumanSpawned` / `onOrcPreplaced` callbacks can bind sprites at
    // spawn-time. Skull credit and sprite binding ride the same
    // callback path so we don't subscribe to per-entity events twice.
    const bus = new SimpleEventEmitter();
    const store = getGameStore();
    // Reset run-scoped skulls so a replay starts at 0.
    store.setSkulls(0);

    // Forward declare so the bootstrap callbacks can call into the binder.
    let binder: SpriteBinder | null = null;

    this.systems = createSceneBootstrap({
      emitter: bus,
      store,
      onHumanSpawned: (human) => {
        // Sprite first (so the rectangle is in place before the entity
        // can be killed mid-tick), then skull-credit on death.
        binder?.bindHuman(human);
        human.emitter.on('died', () => {
          getGameStore().addSkull();
        });
      },
      onOrcPreplaced: (orc) => {
        binder?.bindOrc(orc);
      },
    });

    // Construct the binder + bind the entities that already exist
    // (hero + pre-placed orcs already registered above). The
    // pre-placed orcs registered before `binder` was assigned, so we
    // bind them explicitly here.
    this.spriteBinder = new SpriteBinder({
      rectangleFactory: rectangleFactoryFromScene(this.add),
      emitter: bus,
      ai: this.systems.ai,
      building: this.systems.building,
    });
    binder = this.spriteBinder;
    binder.bindHero(this.systems.hero, this.systems.rallyCell);
    // Pre-placed orcs were registered before `binder` existed — the
    // bootstrap returns the squad list so we can bind them now without
    // poking AISystem internals.
    for (const o of this.systems.preplacedOrcs) {
      binder.bindOrc(o);
    }

    // Mirror hero HP into the gameStore so the HUD reflects it.
    store.setHero(
      this.systems.hero.damageable.hp,
      this.systems.hero.damageable.maxHp,
    );
    store.setHeroAbilityCooldown(this.systems.hero.def.ability.cooldownMs, 0);

    // Publish the bootstrap so the React BuildPanel can call into
    // BuildingSystem via the bridge.
    setActiveSystems(this.systems);

    // 3. Wave lifecycle → gameStore. Wave events use the shared bus so
    // these are scene-bounded (cleaned up in shutdown).
    const onWaveStart = (...args: unknown[]) => {
      const payload = args[0] as WaveStartPayload | undefined;
      if (!payload) return;
      store.setWave(payload.waveNumber);
      store.triggerWaveStart(Date.now());
    };
    bus.on(GameEvents.WaveStart, onWaveStart);
    this.offWaveStart = () => bus.off(GameEvents.WaveStart, onWaveStart);

    const onWaveComplete = (...args: unknown[]) => {
      const payload = args[0] as WaveCompletePayload | undefined;
      if (!payload) return;
      // wave number already advanced via wave:start; nothing extra to
      // mirror today (gold credit lives in Economy). Hook stays in
      // place so future hud bookkeeping (e.g. wave-clear toast) has a
      // single attach point.
    };
    bus.on(GameEvents.WaveComplete, onWaveComplete);
    this.offWaveComplete = () =>
      bus.off(GameEvents.WaveComplete, onWaveComplete);

    // Run lifecycle → gameStore. The wave system emits run:won/run:lost
    // on the same bus. The Hedk'nah Pile commit lives on the
    // RunSummary page (#20) so it only fires on a win path; the scene
    // does NOT commit here.
    bus.on(GameEvents.RunWon, () => {
      store.winRun();
    });
    bus.on(GameEvents.RunLost, () => {
      store.loseRun();
    });

    // 4. Selection bridge: forward InputSystem's `select:tile` into the
    // gameStore so BuildPanel opens. The InputSystem already includes
    // a default tile-grid hit-test (from scene-bootstrap), so payloads
    // arrive with `kind: 'tile'`.
    const onSelectTile = (...args: unknown[]) => {
      const payload = args[0] as SelectTilePayload | undefined;
      if (!payload) return;
      if (payload.kind !== 'tile') return;
      const cell = { x: payload.x, y: payload.y };
      const wall = this.systems?.building.buildingAt(cell);
      if (wall) {
        store.setSelectedWall({
          cell,
          hp: wall.breakable.hp,
          maxHp: wall.breakable.maxHp,
        });
        store.setSelectedTile(null);
      } else {
        store.setSelectedTile(cell);
        store.setSelectedWall(null);
      }
    };
    bus.on(GameEvents.SelectTile, onSelectTile);
    this.offSelectTile = () => bus.off(GameEvents.SelectTile, onSelectTile);

    // 5. Phaser → InputSystem. Adapt pointer events into PointerLike.
    const input = this.systems.input;
    const adapt = (
      pointer: Phaser.Input.Pointer,
    ): {
      pointerId: number;
      x: number;
      y: number;
      button: number;
      type: 'touch' | 'mouse';
    } => ({
      pointerId: pointer.id,
      x: pointer.worldX,
      y: pointer.worldY,
      button: pointer.button,
      type: pointer.wasTouch ? 'touch' : 'mouse',
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      input.onPointerDown(adapt(pointer));
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      input.onPointerMove(adapt(pointer));
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      input.onPointerUp(adapt(pointer));
    });
    this.input.on(
      'wheel',
      (
        _pointer: Phaser.Input.Pointer,
        _objects: Phaser.GameObjects.GameObject[],
        _dx: number,
        deltaY: number,
      ) => {
        input.onWheel(deltaY);
      },
    );

    // 6. timeScale (#54) — mirror the gameStore slice into Phaser's
    // built-in timer scale so any future `this.time.delayedCall` etc.
    // honors pause/2x/4x without per-call wiring. The custom system
    // loops scale `dt` directly in `update` below — this subscribe
    // exists only so Phaser-internal timers stay in sync. Physics is
    // not enabled in this project; if it ever is, mirror into
    // `this.physics.world.timeScale` here as well.
    this.time.timeScale = store.timeScale;
    this.offTimeScale = subscribeGameStore((state, prev) => {
      if (state.timeScale === prev.timeScale) return;
      this.time.timeScale = state.timeScale;
    });

    // 7. Lifecycle hooks — fire systems destroy on scene shutdown so a
    // stop()-then-start() cycle (replay reuses this code path) leaves
    // no dangling listeners.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.teardown());

    // 8. Begin the run.
    this.systems.wave.start();
  }

  update(_time: number, delta: number): void {
    if (!this.systems) return;
    // SINGLE multiply site for `timeScale` (#54). Every system below
    // receives the already-scaled `dt`, so each one stays
    // store-agnostic and unit-testable in jsdom. `timeScale === 0`
    // ⇒ scaledDt === 0 ⇒ all four system update loops effectively
    // freeze (cooldowns don't tick, projectiles don't move, spawn
    // timers don't advance, respawn timers don't advance) — which is
    // exactly the pause semantic we want.
    const { timeScale } = getGameStore();
    const scaledDt = (delta / 1000) * timeScale;
    this.systems.ai.update(scaledDt);
    this.systems.damage.update(scaledDt);
    this.systems.wave.update(scaledDt);
    this.systems.economy.update(scaledDt);
    // Sprite-binder reads tile positions off AI.* behaviour records, so
    // the tick MUST run after the AI update or sprites lag a frame.
    // It has no `dt` accumulator of its own — pure render reader — so
    // it is intentionally NOT scaled.
    this.spriteBinder?.tick();
  }

  private teardown(): void {
    this.offSelectTile?.();
    this.offWaveStart?.();
    this.offWaveComplete?.();
    this.offTimeScale?.();
    this.offSelectTile = null;
    this.offWaveStart = null;
    this.offWaveComplete = null;
    this.offTimeScale = null;
    this.spriteBinder?.destroy();
    this.spriteBinder = null;
    this.systems?.destroy();
    this.systems = null;
    setActiveSystems(null);
  }
}
