import { t } from '@/lib/i18n';
import { useGameStore } from '@/state/gameStore';
import { RUN_EVENTS, runSignal } from '@/state/runSignal';
import { Button } from '@/ui/atoms/Button';

/**
 * Run-end *lose* page (#20). Displayed when `gameStore.runStatus === 'lost'`,
 * which the wave system (#10) toggles via `loseRun()` after the
 * `run:lost` event (fort destroyed).
 *
 * Mirrors `RunSummary` in shape (stats + Replay + Main Menu) but does
 * NOT commit skulls to the Hedk'nah Pile — a defeat earns no tribute.
 *
 * Mobile-first: full-screen black scaffold, single-column max-w-md
 * content, 44px tap targets via the existing `Button` atom.
 */
export function GameOver() {
  const wave = useGameStore((s) => s.wave);
  const skulls = useGameStore((s) => s.skulls);
  const gold = useGameStore((s) => s.gold);
  const reset = useGameStore((s) => s.reset);

  const handleReplay = () => {
    reset();
  };

  const handleMainMenu = () => {
    runSignal.emit(RUN_EVENTS.MAIN_MENU);
    reset();
  };

  return (
    <div
      data-testid="game-over"
      className="min-h-screen w-full bg-black text-white"
    >
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-4">
        <h1 className="text-center font-mono text-2xl uppercase tracking-wider text-red-500 sm:text-3xl">
          {t('loseScreen.title')}
        </h1>

        <dl
          data-testid="game-over-stats"
          className="flex flex-col gap-2 rounded-md border border-white/10 bg-black/60 p-4 font-mono text-base"
        >
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-yellow-400">{t('runEnd.statsWave')}</dt>
            <dd className="tabular-nums">{wave}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-yellow-400">{t('runEnd.statsSkulls')}</dt>
            <dd className="tabular-nums">{skulls}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-yellow-400">{t('runEnd.statsGold')}</dt>
            <dd className="tabular-nums">{gold}</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-3">
          <Button variant="primary" onClick={handleReplay}>
            {t('runEnd.replay')}
          </Button>
          <Button variant="ghost" onClick={handleMainMenu}>
            {t('runEnd.mainMenu')}
          </Button>
        </div>
      </main>
    </div>
  );
}
