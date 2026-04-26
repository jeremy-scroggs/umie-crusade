/**
 * InputSystem — Phaser-agnostic gesture translator (issue #21).
 *
 * Accepts raw pointer events through `onPointerDown`/`onPointerMove`/
 * `onPointerUp` (plus `onWheel` for desktop) and emits semantic events
 * (`select:tile`, `select:entity`, `inspect:show`, `camera:pan`,
 * `camera:zoom`) on the supplied `EventEmitterLike` bus.
 *
 * The system is intentionally Phaser-free so it can be unit-tested in
 * jsdom without loading Phaser's canvas-feature detection (same
 * pattern as Pathfinding/AI/Building). A scene-level glue layer
 * (lands later) adapts `Phaser.Input.Pointer` → `PointerLike` and
 * forwards the four entry points.
 *
 * Gesture thresholds come from `src/data/input/gestures.json`
 * (validated by zod) so designers can tweak feel without a code
 * change. Callers may override per-instance via `opts.config`.
 */

import type { EventEmitterLike } from '../components/EventEmitter';
import {
  GameEvents,
  type CameraPanPayload,
  type CameraZoomPayload,
  type InspectShowPayload,
  type SelectEntityPayload,
  type SelectTilePayload,
} from './events';
import gestures from '@/data/input/gestures.json';
import type { InputGesturesDef } from '@/data/schemas';

/**
 * Phaser-agnostic pointer-event shape. Real Phaser pointers (or DOM
 * `PointerEvent`s) are adapted into this by the scene glue layer.
 */
export interface PointerLike {
  /** Stable id per active pointer. Phaser uses `pointer.id`; mouse = 0. */
  pointerId: number;
  /** Screen-space pixel x. */
  x: number;
  /** Screen-space pixel y. */
  y: number;
  /** Optional mouse button. 0 = left, 2 = right. Touch: undefined. */
  button?: number;
  /** Optional pointer kind hint. Used to select mouse fallback paths. */
  type?: 'mouse' | 'touch' | 'pen';
}

/**
 * Optional camera adapter. The system always emits `camera:pan` /
 * `camera:zoom` on the bus regardless; the adapter is convenience
 * for the common case where one camera is the primary consumer.
 */
export interface CameraLike {
  /** Pan by a screen-space delta (px). */
  pan(dx: number, dy: number): void;
  /** Multiplicative zoom relative to current. */
  zoom(factor: number): void;
}

/**
 * Result of a caller-supplied hit test. Lets the input system stay
 * opaque to entities + the tilemap.
 */
export type HitResult =
  | { kind: 'entity'; id: string }
  | { kind: 'tile'; x: number; y: number }
  | null;

export type HitTestFn = (point: { x: number; y: number }) => HitResult;

/** Override-able subset of `InputGesturesDef`. */
export type InputGesturesConfig = Partial<InputGesturesDef>;

export interface InputSystemOptions {
  emitter: EventEmitterLike;
  /** Optional camera; if omitted, only events are emitted. */
  camera?: CameraLike;
  /** Optional hit-tester for tap / long-press resolution. */
  hitTest?: HitTestFn;
  /** Per-instance threshold overrides (e.g. accessibility profile). */
  config?: InputGesturesConfig;
  /** Override `Date.now()` for tests / determinism. */
  now?: () => number;
}

/** Per-pointer gesture state. */
interface PointerState {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
  /** Set true when total movement crosses dragThresholdPx. */
  isDragging: boolean;
  /** True while a long-press timer is scheduled and not yet fired. */
  longPressHandle: ReturnType<typeof setTimeout> | null;
  /** True after long-press fired, so pointerup doesn't also fire tap. */
  longPressFired: boolean;
  /** True if this pointer was recruited into a pinch. Suppresses tap. */
  pinchActive: boolean;
  button?: number;
}

const DEFAULT_GESTURES: InputGesturesDef = gestures as InputGesturesDef;

/** Pixel-distance helper. */
function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export class InputSystem {
  private readonly emitter: EventEmitterLike;
  private readonly camera?: CameraLike;
  private readonly hitTest?: HitTestFn;
  private readonly config: InputGesturesDef;
  private readonly now: () => number;

  /** Active pointers keyed by id. Insertion order = recency. */
  private readonly pointers = new Map<number, PointerState>();

  /** Last measured pinch distance while two pointers are active. */
  private pinchLastDist: number | null = null;

  constructor(opts: InputSystemOptions) {
    this.emitter = opts.emitter;
    this.camera = opts.camera;
    this.hitTest = opts.hitTest;
    this.config = { ...DEFAULT_GESTURES, ...(opts.config ?? {}) };
    this.now = opts.now ?? Date.now;
  }

  get activePointerCount(): number {
    return this.pointers.size;
  }

  onPointerDown(p: PointerLike): void {
    const state: PointerState = {
      pointerId: p.pointerId,
      startX: p.x,
      startY: p.y,
      lastX: p.x,
      lastY: p.y,
      startTime: this.now(),
      isDragging: false,
      longPressHandle: null,
      longPressFired: false,
      pinchActive: false,
      button: p.button,
    };

    // Right-click is the desktop equivalent of long-press; we don't
    // arm a timer — pointerup fires `inspect:show` immediately.
    const isRightClick = p.button === 2;
    if (!isRightClick) {
      state.longPressHandle = setTimeout(() => {
        // Only fire if the pointer is still active and hasn't
        // dragged or been recruited into a pinch.
        const cur = this.pointers.get(p.pointerId);
        if (!cur || cur.isDragging || cur.pinchActive) return;
        cur.longPressFired = true;
        cur.longPressHandle = null;
        this.emitInspectAt({ x: cur.startX, y: cur.startY });
      }, this.config.longPressDurationMs);
    }

    this.pointers.set(p.pointerId, state);

    // If we now have exactly two active pointers, promote both to a
    // pinch in flight: cancel any single-pointer gestures on each
    // (long-press timers, pending taps).
    if (this.pointers.size === 2) {
      for (const ps of this.pointers.values()) {
        ps.pinchActive = true;
        if (ps.longPressHandle !== null) {
          clearTimeout(ps.longPressHandle);
          ps.longPressHandle = null;
        }
      }
      const [a, b] = [...this.pointers.values()];
      this.pinchLastDist = dist(a!.lastX, a!.lastY, b!.lastX, b!.lastY);
    }
  }

  onPointerMove(p: PointerLike): void {
    const state = this.pointers.get(p.pointerId);
    if (!state) return;

    const dx = p.x - state.lastX;
    const dy = p.y - state.lastY;
    state.lastX = p.x;
    state.lastY = p.y;

    // Pinch path takes precedence when two pointers are active.
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const cur = dist(a!.lastX, a!.lastY, b!.lastX, b!.lastY);
      if (this.pinchLastDist !== null && this.pinchLastDist > 0) {
        const factor = cur / this.pinchLastDist;
        if (Math.abs(factor - 1) > this.config.pinchMinDelta) {
          this.emitZoom(factor);
        }
      }
      this.pinchLastDist = cur;
      return;
    }

    // Single-pointer drag promotion.
    if (!state.isDragging) {
      const total = dist(p.x, p.y, state.startX, state.startY);
      if (total > this.config.dragThresholdPx) {
        state.isDragging = true;
        // Cancel any pending long-press — the user is panning.
        if (state.longPressHandle !== null) {
          clearTimeout(state.longPressHandle);
          state.longPressHandle = null;
        }
      }
    }

    if (state.isDragging) {
      this.emitPan(dx, dy);
    }
  }

  onPointerUp(p: PointerLike): void {
    const state = this.pointers.get(p.pointerId);
    if (!state) return;

    // Always clean up before any branching.
    if (state.longPressHandle !== null) {
      clearTimeout(state.longPressHandle);
      state.longPressHandle = null;
    }
    this.pointers.delete(p.pointerId);
    // Reset pinch tracking once we drop below two.
    if (this.pointers.size < 2) {
      this.pinchLastDist = null;
    }

    // Pinch ended with this lift-up: don't fire a tap on either pointer.
    if (state.pinchActive) return;

    // Drag ended: no tap.
    if (state.isDragging) return;

    // Long-press already consumed this gesture.
    if (state.longPressFired) return;

    // Right-click maps directly to `inspect:show` on release.
    if (state.button === 2) {
      this.emitInspectAt({ x: state.startX, y: state.startY });
      return;
    }

    // Tap window check — quick + within drag threshold.
    const elapsed = this.now() - state.startTime;
    const moved = dist(p.x, p.y, state.startX, state.startY);
    if (
      elapsed <= this.config.tapMaxDurationMs &&
      moved <= this.config.dragThresholdPx
    ) {
      this.emitTapAt({ x: state.startX, y: state.startY });
    }
  }

  /**
   * Desktop wheel → zoom. `point` is reserved for a future
   * "zoom-to-cursor" enhancement (the scene glue would translate
   * cursor screen coords to a focal point); today we ignore it and
   * zoom around the camera centre.
   */
  onWheel(deltaY: number, point?: { x: number; y: number }): void {
    void point;
    // Convention: negative deltaY = wheel up = zoom in (factor > 1).
    const factor = 1 - deltaY * this.config.wheelZoomStep;
    if (factor === 1) return;
    this.emitZoom(factor);
  }

  /** Cancel any in-flight gestures. Scene shutdown calls this. */
  cancel(): void {
    for (const ps of this.pointers.values()) {
      if (ps.longPressHandle !== null) {
        clearTimeout(ps.longPressHandle);
        ps.longPressHandle = null;
      }
    }
    this.pointers.clear();
    this.pinchLastDist = null;
  }

  // --- emit helpers (kept centralised for one place to evolve payloads) ---

  private emitTapAt(point: { x: number; y: number }): void {
    const hit = this.hitTest?.(point) ?? null;
    if (hit && hit.kind === 'entity') {
      const payload: SelectEntityPayload = { id: hit.id };
      this.emitter.emit(GameEvents.SelectEntity, payload);
      return;
    }
    if (hit && hit.kind === 'tile') {
      const payload: SelectTilePayload = {
        kind: 'tile',
        x: hit.x,
        y: hit.y,
      };
      this.emitter.emit(GameEvents.SelectTile, payload);
      return;
    }
    const payload: SelectTilePayload = {
      kind: 'screen',
      x: point.x,
      y: point.y,
    };
    this.emitter.emit(GameEvents.SelectTile, payload);
  }

  private emitInspectAt(point: { x: number; y: number }): void {
    const hit = this.hitTest?.(point) ?? null;
    if (hit && hit.kind === 'entity') {
      const payload: InspectShowPayload = { kind: 'entity', id: hit.id };
      this.emitter.emit(GameEvents.InspectShow, payload);
      return;
    }
    if (hit && hit.kind === 'tile') {
      const payload: InspectShowPayload = {
        kind: 'tile',
        x: hit.x,
        y: hit.y,
      };
      this.emitter.emit(GameEvents.InspectShow, payload);
      return;
    }
    const payload: InspectShowPayload = {
      kind: 'screen',
      x: point.x,
      y: point.y,
    };
    this.emitter.emit(GameEvents.InspectShow, payload);
  }

  private emitPan(dx: number, dy: number): void {
    const payload: CameraPanPayload = { dx, dy };
    this.emitter.emit(GameEvents.CameraPan, payload);
    this.camera?.pan(dx, dy);
  }

  private emitZoom(factor: number): void {
    const payload: CameraZoomPayload = { factor };
    this.emitter.emit(GameEvents.CameraZoom, payload);
    this.camera?.zoom(factor);
  }
}
