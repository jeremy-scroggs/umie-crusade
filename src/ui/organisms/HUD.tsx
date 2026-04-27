import { useEffect, useState } from 'react';
import { useGameStore } from '@/state/gameStore';
import { t } from '@/lib/i18n';
import { WAVE_START_BANNER_MS } from '@/lib/constants';
import { ResourcePill } from '@/ui/atoms/ResourcePill';
import { WaveBadge } from '@/ui/atoms/WaveBadge';
import { SkullCounter } from '@/ui/atoms/SkullCounter';
import { HeroStatus } from '@/ui/molecules/HeroStatus';
import { AbilityButton } from '@/ui/molecules/AbilityButton';
import { tryHeroAbility } from '@/game/scenes/gameBridge';

/**
 * Battle HUD overlay. Subscribes to `gameStore` for live values and
 * composes atoms + molecules per atomic-design rules. Mobile-first
 * layout: top row wraps on narrow viewports, ability button anchors
 * the bottom-right so it's always thumb-reachable on a phone.
 *
 * The "ISE HAI!" overlay is a transient banner: when the store's
 * `waveStartAtMs` is non-null, the overlay shows the localised wave-
 * start string and clears itself after `WAVE_START_BANNER_MS`. The
 * effect re-arms whenever the timestamp changes so wave-2 onward also
 * trigger it.
 */
export function HUD() {
  const gold = useGameStore((s) => s.gold);
  const wave = useGameStore((s) => s.wave);
  const skulls = useGameStore((s) => s.skulls);
  const heroHp = useGameStore((s) => s.heroHp);
  const heroMaxHp = useGameStore((s) => s.heroMaxHp);
  const heroAbility = useGameStore((s) => s.heroAbility);
  const waveStartAtMs = useGameStore((s) => s.waveStartAtMs);
  const clearWaveStart = useGameStore((s) => s.clearWaveStart);

  // Track a clock so the ability button countdown re-renders. Tick at
  // 250ms — fast enough for a 1s-resolution countdown to feel live,
  // slow enough to be cheap.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  // ISE HAI! transient banner.
  useEffect(() => {
    if (waveStartAtMs === null) return;
    const id = window.setTimeout(clearWaveStart, WAVE_START_BANNER_MS);
    return () => window.clearTimeout(id);
  }, [waveStartAtMs, clearWaveStart]);

  return (
    <>
      <div
        data-testid="hud-root"
        className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 p-2"
      >
        <ResourcePill label={t('hud.gold')} value={gold} />
        <WaveBadge label={t('hud.wave')} value={wave} />
        <SkullCounter ariaLabel={t('hud.skullsAria')} value={skulls} />
        <HeroStatus label={t('hud.heroHp')} hp={heroHp} maxHp={heroMaxHp} />
      </div>

      <div className="absolute bottom-3 right-3 z-10">
        <AbilityButton
          label={t('hud.ability')}
          readyLabel={t('hud.abilityReady')}
          cooldownMs={heroAbility.cooldownMs}
          readyAtMs={heroAbility.readyAtMs}
          nowMs={nowMs}
          onActivate={() => {
            // Dispatch through the game bridge — the bridge owns the
            // Phaser-side wiring (hero entity + alive humans + cooldown
            // store write-back). HUD stays React-pure; no Phaser
            // import-time side effects leak into the DOM layer.
            tryHeroAbility(Date.now());
          }}
        />
      </div>

      {waveStartAtMs !== null ? (
        <div
          role="status"
          aria-live="assertive"
          data-testid="hud-wave-banner"
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
        >
          <span className="rounded-md bg-black/70 px-6 py-3 font-mono text-3xl uppercase tracking-widest text-red-400 shadow-lg sm:text-5xl">
            {t('battle.waveStart')}
          </span>
        </div>
      ) : null}
    </>
  );
}
