interface SkullCounterProps {
  /** Localised accessible label (e.g. "Skulls taken"). */
  ariaLabel: string;
  value: number;
}

/**
 * Skulls-taken atom. Renders a small unicode skull glyph next to the
 * count — standard art will replace the glyph with a sprite later, but
 * the structural shape and accessibility surface stay the same.
 *
 * Mobile-first: 44px min height, generous touch padding even though the
 * counter isn't interactive today (lets us upgrade it to a button-styled
 * details affordance without re-fitting layout).
 */
export function SkullCounter({ ariaLabel, value }: SkullCounterProps) {
  return (
    <div
      role="status"
      aria-label={`${ariaLabel} ${value}`}
      className="flex min-h-[44px] items-center gap-2 rounded-md bg-black/60 px-3 py-1 font-mono text-sm text-white"
    >
      <span aria-hidden="true" className="text-lg leading-none text-white/90">
        {'\u{1F480}'}
      </span>
      <span className="text-base">{value}</span>
    </div>
  );
}
