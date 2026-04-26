interface AbilityButtonProps {
  /** Display label, e.g. "Clomp'uk". From i18n. */
  label: string;
  /** Localised "Ready" copy from i18n. */
  readyLabel: string;
  /** Total cooldown duration in ms (from hero def). */
  cooldownMs: number;
  /** Absolute timestamp the ability becomes available, or null if idle. */
  readyAtMs: number | null;
  /** Current clock — caller owns the time source. */
  nowMs: number;
  onActivate: () => void;
}

/**
 * AbilityButton — round, 56px wide tap target showing the hero's
 * Clomp'uk readiness. Disabled while the cooldown timer is active.
 * Cooldown remaining is rendered as ceil(seconds) so the player sees
 * a stable countdown and the value never reads "0s" while still on
 * cooldown.
 *
 * Reads no balance numbers — total cooldown comes from the caller via
 * `cooldownMs`. The button is purely a controlled view.
 */
export function AbilityButton({
  label,
  readyLabel,
  cooldownMs,
  readyAtMs,
  nowMs,
  onActivate,
}: AbilityButtonProps) {
  const remainingMs =
    readyAtMs === null ? 0 : Math.max(0, readyAtMs - nowMs);
  const onCooldown = remainingMs > 0;
  const remainingSec = Math.ceil(remainingMs / 1000);
  // Visual fill ratio (0 = freshly used, 1 = ready). When `cooldownMs`
  // is 0 we treat the button as ready to avoid a divide-by-zero NaN.
  const fillRatio =
    !onCooldown || cooldownMs <= 0
      ? 1
      : 1 - remainingMs / cooldownMs;
  const fillPercent = Math.round(fillRatio * 100);

  return (
    <button
      type="button"
      onClick={onActivate}
      disabled={onCooldown}
      aria-label={label}
      aria-disabled={onCooldown}
      className={`relative flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-full border-2 font-mono text-xs uppercase tracking-wider transition-colors ${
        onCooldown
          ? 'border-white/30 bg-black/70 text-white/60'
          : 'border-red-400 bg-red-700 text-white hover:bg-red-600'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 bottom-0 ${
          onCooldown ? 'bg-red-500/30' : 'bg-red-300/0'
        }`}
        style={{ height: `${fillPercent}%` }}
      />
      <span className="relative z-10 text-center leading-tight">
        {onCooldown ? `${remainingSec}s` : readyLabel}
      </span>
      <span className="sr-only">{label}</span>
    </button>
  );
}
