import bruteJson from '@/data/heroes/brute.json';
import { heroDefSchema } from '@/data/schemas';
import { useMetaStore } from '@/state/metaStore';
import { RUN_EVENTS, runSignal, type BeginRunPayload } from '@/state/runSignal';
import type { Hero, HeroDef } from '@/types';
import {
  HeroCreateForm,
  type HeroCreateSubmit,
} from '@/ui/organisms/HeroCreateForm';

// Validate at module load — if the hero JSON ever drifts from the schema we
// want a loud failure, not a silent `as HeroDef` cast. `parse` throws on
// mismatch, which surfaces in dev + tests.
const BRUTE: HeroDef = heroDefSchema.parse(bruteJson);
const UNITS: HeroDef[] = [BRUTE];

/**
 * Generate a roster id. `crypto.randomUUID` is available in jsdom (via node's
 * webcrypto) and in every modern browser, so no polyfill shim needed.
 */
function newHeroId(): string {
  return crypto.randomUUID();
}

export function HeroCreate() {
  const addHero = useMetaStore((s) => s.addHero);
  const setActiveHero = useMetaStore((s) => s.setActiveHero);

  const handleSubmit = ({ name, heroDef }: HeroCreateSubmit) => {
    const hero: Hero = {
      id: newHeroId(),
      name,
      heroDefId: heroDef.id,
      createdAt: Date.now(),
    };
    addHero(hero);
    setActiveHero(hero.id);

    const payload: BeginRunPayload = { heroId: hero.id };
    runSignal.emit(RUN_EVENTS.BEGIN, payload);
  };

  return (
    <div className="min-h-screen w-full bg-black">
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-4">
        <HeroCreateForm units={UNITS} onSubmit={handleSubmit} />
      </main>
    </div>
  );
}
