import type { HeroDef } from '@/types';

interface BloodlineCardProps {
  heroDef: HeroDef;
  selected: boolean;
  onSelect: () => void;
}

/**
 * Presents a single bloodline option — portrait + name + description. M1 has
 * only Mougg'r, but the card shape scales to a multi-option picker later
 * (#16-flavoured work). "Description" sources from `heroDef.flavor` since the
 * hero JSON doesn't carry a long-form bio yet.
 */
export function BloodlineCard({
  heroDef,
  selected,
  onSelect,
}: BloodlineCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full flex-col gap-3 rounded-md border p-3 text-left transition-colors min-h-[44px] ${
        selected
          ? 'border-red-500 bg-red-900/30'
          : 'border-white/20 bg-black/40 hover:border-white/40'
      }`}
    >
      <div className="flex items-center gap-3">
        <img
          src={`/assets/${heroDef.sprite}`}
          alt={`${heroDef.name} portrait`}
          className="h-16 w-16 flex-none rounded-sm bg-black/60 object-contain"
        />
        <div className="flex flex-col">
          <span className="font-mono text-base text-white">
            {heroDef.name}
          </span>
          <span className="font-mono text-xs uppercase tracking-wider text-white/60">
            {heroDef.bloodline}
          </span>
        </div>
      </div>
      <p className="font-mono text-sm text-white/80">{heroDef.flavor}</p>
    </button>
  );
}
