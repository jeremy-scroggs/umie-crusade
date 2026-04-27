interface BuildSlotProps {
  /** Display label, e.g. "Wall". From i18n. */
  label: string;
  /** Build cost in gold. Must come from a JSON def — never hardcode. */
  cost: number;
  /** Localised "Bludgelt" prefix on the cost chip. From i18n. */
  goldLabel: string;
  /** True iff the player can afford `cost`. */
  affordable: boolean;
  /** Optional sprite path served from `/assets/`. Falls back to label initial. */
  iconSrc?: string;
  /** Localised insufficient-gold notice — shown when not affordable. */
  insufficientLabel: string;
  /** Confirm callback. Caller wires to BuildingSystem.tryPlaceWall etc. */
  onSelect: () => void;
}

/**
 * BuildSlot — single buildable option in the BuildPanel.
 *
 * Mobile-first: `min-h-[44px]` satisfies iOS tap-target guidance. The
 * card layout mirrors `HeroOptionCard` so the BuildPanel feels at home
 * with the rest of the overlay UI.
 *
 * Affordability is owned by the parent (`BuildPanel`) — the slot itself
 * is a controlled view. When `affordable` is false the button is
 * `disabled`, dimmed at 50% opacity, and the localised insufficient-gold
 * notice replaces the default cost chip so screen readers still get
 * meaningful feedback.
 */
export function BuildSlot({
  label,
  cost,
  goldLabel,
  affordable,
  iconSrc,
  insufficientLabel,
  onSelect,
}: BuildSlotProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!affordable}
      aria-disabled={!affordable}
      aria-label={`${label}, ${cost} ${goldLabel}`}
      className={`flex w-full min-h-[44px] items-center gap-3 rounded-md border p-3 text-left font-mono transition-colors ${
        affordable
          ? 'border-red-500 bg-black/60 text-white hover:bg-red-900/30'
          : 'cursor-not-allowed border-white/20 bg-black/40 text-white/60 opacity-50'
      }`}
    >
      {iconSrc !== undefined ? (
        <img
          src={`/assets/${iconSrc}`}
          alt=""
          aria-hidden="true"
          className="h-10 w-10 flex-none rounded-sm bg-black/60 object-contain"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-10 w-10 flex-none items-center justify-center rounded-sm bg-black/60 text-base"
        >
          {label.charAt(0)}
        </span>
      )}
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-base">{label}</span>
        {affordable ? (
          <span className="text-xs text-yellow-400">
            {goldLabel} {cost}
          </span>
        ) : (
          <span className="text-xs text-red-300">
            {insufficientLabel}
          </span>
        )}
      </div>
    </button>
  );
}
