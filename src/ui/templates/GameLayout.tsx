import { PhaserGame } from '@/game/PhaserGame';
import { HUD } from '@/ui/organisms/HUD';

export function GameLayout() {
  return (
    <div className="relative w-screen h-screen bg-black">
      <PhaserGame />
      <HUD />
    </div>
  );
}
