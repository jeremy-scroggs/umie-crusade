import { useEffect, useRef } from 'react';
import { t } from '@/lib/i18n';
import { useGameStore } from '@/state/gameStore';
import { useMetaStore } from '@/state/metaStore';
import { RUN_EVENTS, runSignal } from '@/state/runSignal';
import { Button } from '@/ui/atoms/Button';

/**
 * Run-end *win* page (#20). Displayed when `gameStore.runStatus === 'won'`,
 * which the wave system (#10) toggles via `winRun()` after the wave-5
 * `run:won` event.
 *
 * Responsibilities:
 *   1. Show the AC win title + run stats (wave, skulls, gold).
 *   2. On mount, commit the run's skulls into the meta-progression
 *      Hedk'nah Pile (persisted across runs).
 *   3. Provide Replay (resets gameStore -> back to running) and Main
 *      Menu (emits `RUN_EVENTS.MAIN_MENU`) actions.
 *
 * Mobile-first: full-screen black scaffold, single-column max-w-md
 * content, 44px tap targets via the existing `Button` atom.
 */
export function RunSummary() {
  const wave = useGameStore((s) => s.wave);
  const skulls = useGameStore((s) => s.skulls);
  const gold = useGameStore((s) => s.gold);
  const reset = useGameStore((s) => s.reset);

  const addToHedknahPile = useMetaStore((s) => s.addToHedknahPile);

  // StrictMode invokes effects twice in dev — guard the pile commit
  // with a ref so the player only banks the run's skulls once. The ref
  // is local to this mount; navigating away and back in to a *new* run
  // (which goes through `gameStore.reset()` and a new winRun) creates
  // a fresh component instance with a fresh ref.
  const committedRef = useRef(false);
  useEffect(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    if (skulls > 0) addToHedknahPile(skulls);
  }, [skulls, addToHedknahPile]);

  const handleReplay = () => {
    reset();
  };

  const handleMainMenu = () => {
    runSignal.emit(RUN_EVENTS.MAIN_MENU);
    reset();
  };

  return (
    <div
      data-testid="run-summary"
      className="min-h-screen w-full bg-black text-white"
    >
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-4">
        <h1 className="text-center font-mono text-3xl uppercase tracking-widest text-red-400 sm:text-4xl">
          {t('winScreen.title')}
        </h1>

        <dl
          data-testid="run-summary-stats"
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
            <dt className="text-yellow-400">{t('runEnd.statsBludgelt')}</dt>
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
