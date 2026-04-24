import { SimpleEventEmitter } from '@/game/components';
import type { EventEmitterLike } from '@/game/components';
import { GameEvents } from './events';
import type { WaveCompletePayload } from './events';
import { getGameStore } from '@/state/bridge';
import type { UnitDef } from '@/types';

/**
 * Economy — runtime system that owns the gold loop.
 *
 * Responsibilities:
 *  - Credit `goldDrop` to the player when a registered human dies
 *    (subscribes to the human's `'died'` event, same pattern as
 *    `DamageSystem.watchDeath`).
 *  - Debit `respawnCost.gold` when an orc requests respawn, enforce the
 *    `respawnCost.time` timer, and emit `'economy:respawn-ready'` when the
 *    timer completes. Returns a discriminated result — no throws.
 *  - Credit `reward.gold` on `wave:complete` (subscribed via the system
 *    emitter).
 *  - Expose `canAfford(n)` so UI can grey-out buttons before a debit.
 *
 * Every balance number flows from validated defs (UnitDef.goldDrop,
 * UnitDef.respawnCost, WaveCompletePayload.reward.gold). This file
 * contains zero hardcoded stats.
 */

/** Minimum store shape Economy needs. A test seam for jsdom/unit work. */
export interface EconomyStoreLike {
  readonly gold: number;
  addGold(amount: number): void;
  spendGold(amount: number): boolean;
}

/** Minimum human shape: a validated UnitDef plus an emitter that fires `'died'`. */
export interface EconomyHumanLike {
  readonly def: Pick<UnitDef, 'id' | 'faction' | 'goldDrop'>;
  readonly emitter: EventEmitterLike;
}

/** Minimum orc shape: a validated UnitDef with an optional `respawnCost`. */
export interface EconomyOrcLike {
  readonly def: Pick<UnitDef, 'id' | 'faction' | 'respawnCost'>;
}

export interface EconomyOptions {
  /** System bus (also used to receive `wave:complete`). Defaults to a new SimpleEventEmitter. */
  emitter?: EventEmitterLike;
  /**
   * Test seam — supply a concrete store object. When passed, all store
   * reads/writes go here instead of the live Zustand store.
   */
  store?: EconomyStoreLike;
  /**
   * Test seam — supply a lambda that returns the live store. Defaults to
   * `getGameStore()` from `@/state/bridge`. Ignored when `store` is set.
   */
  getStore?: () => EconomyStoreLike;
}

export interface RespawnSuccess {
  ok: true;
  /** Seconds remaining until `'economy:respawn-ready'` fires. */
  respawnAt: number;
}

export interface RespawnFailure {
  ok: false;
  reason: 'insufficient-gold' | 'no-respawn-cost';
  /** Gold required — only present for `insufficient-gold`. */
  needed?: number;
  /** Gold the player has — only present for `insufficient-gold`. */
  have?: number;
}

export type RespawnResult = RespawnSuccess | RespawnFailure;

/** Internal record for the respawn-timer Map. */
interface RespawnTimer {
  remaining: number;
}

export class Economy {
  readonly emitter: EventEmitterLike;
  private readonly getStore: () => EconomyStoreLike;
  private readonly watchedHumans: WeakSet<EconomyHumanLike> = new WeakSet();
  private readonly respawnTimers: Map<EconomyOrcLike, RespawnTimer> = new Map();

  constructor(opts: EconomyOptions = {}) {
    this.emitter = opts.emitter ?? new SimpleEventEmitter();
    if (opts.store) {
      const concrete = opts.store;
      this.getStore = () => concrete;
    } else {
      this.getStore = opts.getStore ?? (() => getGameStore());
    }

    // Wire wave-complete credit via the shared system bus.
    this.emitter.on(GameEvents.WaveComplete, (...args: unknown[]) => {
      const payload = args[0] as WaveCompletePayload | undefined;
      if (!payload) return;
      this.onWaveComplete(payload);
    });
  }

  /**
   * Subscribe once to a human's `'died'` event — on death we credit the
   * configured `goldDrop`. Idempotent: re-registering the same human is a
   * no-op.
   */
  registerHuman(human: EconomyHumanLike): void {
    if (this.watchedHumans.has(human)) return;
    this.watchedHumans.add(human);

    const onDied = (): void => {
      const amount = human.def.goldDrop ?? 0;
      if (amount <= 0) return;
      this.getStore().addGold(amount);
      this.emitter.emit('economy:gold-drop', {
        unitId: human.def.id,
        amount,
      });
    };
    human.emitter.on('died', onDied);
  }

  /**
   * Attempt to respawn an orc. Reads `respawnCost` off its validated def.
   *  - Returns `{ ok: false, reason: 'no-respawn-cost' }` if the def has no
   *    `respawnCost` block (defensive — humans, cost-less heroes).
   *  - Returns `{ ok: false, reason: 'insufficient-gold', needed, have }`
   *    if the store can't cover the cost. Store is left untouched.
   *  - Otherwise debits the cost, starts the respawn timer, returns
   *    `{ ok: true, respawnAt: cost.time }`.
   */
  requestRespawn(orc: EconomyOrcLike): RespawnResult {
    const cost = orc.def.respawnCost;
    if (!cost) {
      return { ok: false, reason: 'no-respawn-cost' };
    }

    const store = this.getStore();
    if (!store.spendGold(cost.gold)) {
      this.emitter.emit('economy:insufficient-gold', {
        unitId: orc.def.id,
        needed: cost.gold,
        have: store.gold,
      });
      return {
        ok: false,
        reason: 'insufficient-gold',
        needed: cost.gold,
        have: store.gold,
      };
    }

    this.respawnTimers.set(orc, { remaining: cost.time });
    return { ok: true, respawnAt: cost.time };
  }

  /**
   * Per-tick step. Advances all pending respawn timers; when a timer hits
   * zero it fires `'economy:respawn-ready'` with `{ orc }` and is removed.
   */
  update(dt: number): void {
    if (this.respawnTimers.size === 0) return;
    const ready: EconomyOrcLike[] = [];
    for (const [orc, timer] of this.respawnTimers) {
      timer.remaining = Math.max(0, timer.remaining - dt);
      if (timer.remaining <= 0) ready.push(orc);
    }
    for (const orc of ready) {
      this.respawnTimers.delete(orc);
      this.emitter.emit('economy:respawn-ready', { orc });
    }
  }

  /** Fast read — lets UI grey-out buttons before attempting a debit. */
  canAfford(amount: number): boolean {
    return this.getStore().gold >= amount;
  }

  /** True if this orc has a pending respawn timer. */
  hasPendingRespawn(orc: EconomyOrcLike): boolean {
    return this.respawnTimers.has(orc);
  }

  /**
   * Handler for `wave:complete` — credits the wave's configured reward.
   * Exposed for direct calling in tests; production goes through the
   * shared emitter.
   */
  private onWaveComplete(payload: WaveCompletePayload): void {
    const amount = payload.reward.gold;
    if (amount <= 0) return;
    this.getStore().addGold(amount);
    this.emitter.emit('economy:wave-reward', {
      waveId: payload.waveId,
      amount,
    });
  }
}
