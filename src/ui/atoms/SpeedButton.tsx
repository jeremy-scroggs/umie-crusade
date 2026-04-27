import type { TimeScale } from '@/state/gameStore';

interface SpeedButtonProps {
  /** Speed value this button selects. `0` is pause; `1`/`2`/`4` are
   *  multipliers. Used only to decide whether to render the pause
   *  glyph — the visible label always comes from `label`. */
  scale: TimeScale;
  /** Visible label, e.g. "Pause", "1×". From i18n. */
  label: string;
  /** Accessible name. For the pause button this collapses the glyph
   *  + label down to a single screen-reader phrase. */
  ariaLabel: string;
  /** True when this button matches the current `timeScale`. Drives
   *  visual highlight + `aria-pressed`. */
  active: boolean;
  onSelect: () => void;
}

/**
 * Speed-control atom. A single tap target for one of the allowed
 * `TIME_SCALES`. Pure controlled view — owns no state, reads no store.
 *
 * Mobile-first: `min-h-[44px]` AND `min-w-[44px]` so the icon-only
 * pause button still clears the iOS tap-target guidance. Active state
 * uses the same crimson chrome as `Button` primary; inactive mirrors
 * the ghost variant for visual hierarchy.
 */
export function SpeedButton({
  scale,
  label,
  ariaLabel,
  active,
  onSelect,
}: SpeedButtonProps) {
  const isPause = scale === 0;
  const activeClasses = active
    ? 'bg-red-700 border-red-400 text-white'
    : 'bg-transparent border-white/30 text-white hover:bg-white/10';

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md border px-3 py-1 font-mono text-sm transition-colors ${activeClasses}`}
    >
      {isPause ? (
        <span aria-hidden="true" className="text-base leading-none">
          {'⏸'}
        </span>
      ) : null}
      <span>{label}</span>
    </button>
  );
}
