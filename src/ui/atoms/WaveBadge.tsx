interface WaveBadgeProps {
  label: string;
  value: number;
}

/**
 * Wave indicator atom. Visually distinct from `ResourcePill` because
 * the current wave is the dominant battlefield context — uses the
 * Bloodrock crimson chrome instead of black/yellow.
 *
 * Mobile-first: `min-h-[44px]` keeps the chip a comfortable tap-sized
 * target so it can later host a tap-to-show-wave-details affordance
 * without being re-built.
 */
export function WaveBadge({ label, value }: WaveBadgeProps) {
  return (
    <div
      role="status"
      aria-label={`${label} ${value}`}
      className="flex min-h-[44px] items-center gap-2 rounded-md border border-red-500/60 bg-red-900/40 px-3 py-1 font-mono text-sm text-white"
    >
      <span className="uppercase tracking-wider text-red-200">{label}</span>
      <span className="text-base text-white">{value}</span>
    </div>
  );
}
