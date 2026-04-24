/**
 * Game-system event names + payload types.
 *
 * Systems emit / subscribe to these via an `EventEmitterLike` bus
 * (see `src/game/components/EventEmitter.ts`). The string names are
 * exported as `as const` constants so callers get exhaustive
 * autocomplete + safe string matching.
 *
 * Wall events are emitted by the wall-placement system (issue #14). At
 * the time of this file's introduction (#7, Pathfinding) there are no
 * real emitters yet — tests simulate emissions — but the types are
 * defined here so the pathfinding system can subscribe with full typing
 * and downstream work doesn't need to re-invent them.
 */
export const GameEvents = {
  /** Emitted when a wall is placed at a grid cell. */
  WallBuilt: 'wall:built',
  /** Emitted when a wall is destroyed at a grid cell. */
  WallDestroyed: 'wall:destroyed',
  /**
   * Emitted by the pathfinding system when its path cache has been
   * invalidated (e.g. after a wall change). Consumers should drop any
   * cached path handles.
   */
  PathInvalidated: 'path:invalidated',
  /**
   * Emitted by the pathfinding system as a broadcast hint that
   * dependent movement/AI systems may want to re-query their paths.
   * Fires after `PathInvalidated`.
   */
  PathRecompute: 'path:recompute',
  /**
   * Emitted by the wave-spawning system when all spawns for a wave have
   * been defeated. Economy listens and credits `reward.gold`.
   * Payload: `WaveCompletePayload`.
   */
  WaveComplete: 'wave:complete',
} as const;

export type GameEventName = (typeof GameEvents)[keyof typeof GameEvents];

/** Payload for `wall:built` / `wall:destroyed`. */
export interface WallEventPayload {
  /** Grid-cell x coordinate (column). */
  x: number;
  /** Grid-cell y coordinate (row). */
  y: number;
}

/**
 * Payload for `path:invalidated` / `path:recompute`.
 * Currently empty — the signal itself is the payload. Future work may
 * add a `reason` or a list of affected cells; keeping a typed object
 * means extending without a breaking change.
 */
export type PathEventPayload = Record<string, never>;

/**
 * Payload for `wave:complete`. `waveId` + `waveNumber` come from the
 * wave def (`src/data/waves/*.json`); `reward.gold` is the wave's
 * configured completion bonus.
 */
export interface WaveCompletePayload {
  waveId: string;
  waveNumber: number;
  reward: {
    gold: number;
  };
}
