import { z } from 'zod';

/**
 * Gesture-recognition thresholds for the InputSystem (issue #21).
 *
 * Keeps the four "feel" numbers in JSON so a designer can tweak them
 * without a code change (CLAUDE.md "no magic numbers" rule). Defaults
 * shipped in `src/data/input/gestures.json`. Callers may still override
 * per-instance via the system's `opts.config` (e.g. accessibility).
 */
export const inputGesturesSchema = z.object({
  /** Max ms between pointerdown and pointerup to count as a tap. */
  tapMaxDurationMs: z.number().positive(),
  /** Hold duration (ms) before pointerdown promotes to long-press. */
  longPressDurationMs: z.number().positive(),
  /** Pixel movement above which a single-pointer hold becomes a drag. */
  dragThresholdPx: z.number().positive(),
  /** Minimum |factor - 1| before a pinch step emits `camera:zoom`. */
  pinchMinDelta: z.number().positive(),
  /** Multiplier applied per wheel deltaY pixel for desktop zoom. */
  wheelZoomStep: z.number().positive(),
});

export type InputGesturesDef = z.infer<typeof inputGesturesSchema>;
