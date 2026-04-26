import { useGameStore } from '@/state/gameStore';
import { useMetaStore } from '@/state/metaStore';
import { GameOver } from '@/ui/pages/GameOver';
import { HeroCreate } from '@/ui/pages/HeroCreate';
import { RunSummary } from '@/ui/pages/RunSummary';
import { GameLayout } from '@/ui/templates/GameLayout';

export function App() {
  const activeHeroId = useMetaStore((s) => s.activeHeroId);
  const runStatus = useGameStore((s) => s.runStatus);

  // Minimal page-routing shim. A real router / scene manager replaces
  // this trivially without touching the pages themselves.
  //   - No active hero  -> hero-create
  //   - Run won         -> RunSummary (#20)
  //   - Run lost        -> GameOver   (#20)
  //   - Otherwise       -> in-game canvas + HUD
  if (!activeHeroId) return <HeroCreate />;
  if (runStatus === 'won') return <RunSummary />;
  if (runStatus === 'lost') return <GameOver />;
  return <GameLayout />;
}
