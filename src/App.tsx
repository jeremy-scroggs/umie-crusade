import { useMetaStore } from '@/state/metaStore';
import { HeroCreate } from '@/ui/pages/HeroCreate';
import { GameLayout } from '@/ui/templates/GameLayout';

export function App() {
  const activeHeroId = useMetaStore((s) => s.activeHeroId);

  // Minimal "transitions to Phaser Game scene" shim: route to hero-create
  // until the player has an active hero persisted in the meta roster. When
  // a real scene manager / router lands this becomes redundant.
  if (!activeHeroId) return <HeroCreate />;
  return <GameLayout />;
}
