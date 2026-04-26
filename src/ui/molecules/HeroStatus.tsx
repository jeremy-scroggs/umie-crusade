interface HeroStatusProps {
  label: string;
  hp: number;
  maxHp: number;
}

/**
 * Hero HP molecule — label + segmented HP bar + numeric readout.
 * Mobile-first: 44px row height, single-row layout with a fluid bar so
 * it fits 375px viewports without horizontal scroll.
 *
 * Composes its own primitives (label, bar, value) rather than reusing
 * `ResourcePill` because the bar is a non-trivial visual the atom layer
 * doesn't carry.
 */
export function HeroStatus({ label, hp, maxHp }: HeroStatusProps) {
  const safeMax = Math.max(0, maxHp);
  const safeHp = Math.max(0, Math.min(hp, safeMax));
  // Avoid divide-by-zero when the hero hasn't been initialised. Treat
  // an uninitialised hero (maxHp == 0) as 0% rather than NaN/100%.
  const ratio = safeMax === 0 ? 0 : safeHp / safeMax;
  const percent = Math.round(ratio * 100);
  // Visual intent: green > 50%, amber > 25%, red below.
  const fillClass =
    ratio > 0.5
      ? 'bg-green-500'
      : ratio > 0.25
        ? 'bg-amber-500'
        : 'bg-red-600';

  return (
    <div
      role="group"
      aria-label={`${label} ${safeHp} / ${safeMax}`}
      className="flex min-h-[44px] items-center gap-2 rounded-md bg-black/60 px-3 py-1 font-mono text-sm text-white"
    >
      <span className="text-yellow-400">{label}</span>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={safeHp}
        className="relative h-2 w-24 overflow-hidden rounded-sm bg-black/80 sm:w-32"
      >
        <div
          className={`h-full ${fillClass} transition-[width] duration-200`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="tabular-nums">
        {safeHp}/{safeMax}
      </span>
    </div>
  );
}
