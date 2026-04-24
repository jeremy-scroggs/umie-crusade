import { SimpleEventEmitter } from '@/game/components/EventEmitter';

/**
 * Cross-system "begin run" signal. React fires it after the hero is persisted;
 * Phaser subscribes to swap scenes. Using the existing `SimpleEventEmitter`
 * keeps this jsdom-safe (no Phaser canvas init in tests) and matches the
 * codebase's established event pattern.
 *
 * The actual Phaser-side subscription + scene change is out of scope for
 * issue #18 — this module defines the contract (event name + payload).
 */
export const RUN_EVENTS = {
  BEGIN: 'run:begin',
} as const;

export interface BeginRunPayload {
  heroId: string;
}

export const runSignal = new SimpleEventEmitter();
