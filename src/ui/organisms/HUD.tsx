import { useGameStore } from '@/state/gameStore';
import { ResourcePill } from '@/ui/atoms/ResourcePill';

export function HUD() {
  const gold = useGameStore((s) => s.gold);
  const wave = useGameStore((s) => s.wave);
  const lives = useGameStore((s) => s.lives);

  return (
    <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 p-2">
      <ResourcePill label="Gold" value={gold} />
      <ResourcePill label="Wave" value={wave} />
      <ResourcePill label="Lives" value={lives} />
    </div>
  );
}
