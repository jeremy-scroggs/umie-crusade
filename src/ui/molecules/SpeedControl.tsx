import { useGameStore, TIME_SCALES, type TimeScale } from '@/state/gameStore';
import { t, type StringKey } from '@/lib/i18n';
import { SpeedButton } from '@/ui/atoms/SpeedButton';

/**
 * Resolve the (label, ariaLabel) pair for a given `TimeScale`. The
 * label is what the player sees on the button; the ariaLabel is the
 * collapsed screen-reader phrase (relevant for the pause button which
 * also renders a glyph). `1`/`2`/`4` reuse their visible label as
 * their accessible name — no extra context needed.
 */
function labelsFor(scale: TimeScale): { label: string; aria: string } {
  if (scale === 0) {
    return { label: t('hud.speed.pause'), aria: t('hud.speed.pauseAria') };
  }
  // The four `hud.speed.<n>x` keys are statically known — cast through
  // the StringKey union so `t()` stays type-safe.
  const key = `hud.speed.${scale}x` as StringKey;
  const text = t(key);
  return { label: text, aria: text };
}

/**
 * SpeedControl molecule — four `SpeedButton` atoms iterating
 * `TIME_SCALES`. The active button reflects the gameStore's
 * `timeScale`; tapping a button calls `setTimeScale(n)`.
 *
 * Iteration order matches the `TIME_SCALES` tuple. Adding/removing
 * a preset is therefore a single edit on the gameStore — this widget
 * picks the change up automatically.
 *
 * Mobile-first: four 44px-min buttons with `gap-1` (≈ 4×44 + 3×4 =
 * 188px) fit comfortably under a 375px viewport. Wraps with the rest
 * of the HUD top row on extremely narrow viewports.
 */
export function SpeedControl() {
  const timeScale = useGameStore((s) => s.timeScale);
  const setTimeScale = useGameStore((s) => s.setTimeScale);

  return (
    <div
      role="group"
      aria-label={t('hud.speed.groupAria')}
      className="flex items-center gap-1"
    >
      {TIME_SCALES.map((scale) => {
        const { label, aria } = labelsFor(scale);
        return (
          <SpeedButton
            key={scale}
            scale={scale}
            label={label}
            ariaLabel={aria}
            active={timeScale === scale}
            onSelect={() => setTimeScale(scale)}
          />
        );
      })}
    </div>
  );
}
