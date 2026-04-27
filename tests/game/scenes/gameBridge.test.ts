import { describe, it, expect, beforeEach } from 'vitest';
import {
  setActiveSystems,
  getActiveSystems,
  tryHeroAbility,
} from '@/game/scenes/gameBridge';
import { createSceneBootstrap } from '@/game/scenes/scene-bootstrap';
import { useGameStore } from '@/state/gameStore';
import { SimpleEventEmitter } from '@/game/components';

/**
 * gameBridge integration tests — focused on the hero-ability dispatch
 * chain (#29). Runs in jsdom against the production scene bootstrap;
 * no Phaser scene is constructed.
 */

class FakeStore {
  gold = 0;
  addGold(amount: number): void {
    if (amount <= 0) return;
    this.gold += amount;
  }
  spendGold(amount: number): boolean {
    if (this.gold < amount) return false;
    this.gold -= amount;
    return true;
  }
}

beforeEach(() => {
  setActiveSystems(null);
  useGameStore.getState().reset();
});

describe('gameBridge.tryHeroAbility (#29)', () => {
  it('returns null when no scene is active', () => {
    expect(getActiveSystems()).toBeNull();
    expect(tryHeroAbility(0)).toBeNull();
  });

  it('writes the hero cooldown into gameStore on a successful use', () => {
    const bus = new SimpleEventEmitter();
    const store = new FakeStore();
    const systems = createSceneBootstrap({
      emitter: bus,
      store,
      preplacedOrcCount: 0,
    });
    setActiveSystems(systems);

    // No live humans → ability still triggers (Clomp'uk fires at the
    // hero's position regardless of targets); the cooldown still
    // writes back. This isolates the cooldown-write contract.
    const result = tryHeroAbility(1000);
    expect(result).not.toBeNull();
    expect(result?.used).toBe(true);

    const ability = useGameStore.getState().heroAbility;
    expect(ability.cooldownMs).toBe(systems.hero.def.ability.cooldownMs);
    expect(ability.readyAtMs).toBe(1000 + systems.hero.def.ability.cooldownMs);

    setActiveSystems(null);
    systems.destroy();
  });

  it('returns { used: false, reason: cooldown } when called twice in a row', () => {
    const bus = new SimpleEventEmitter();
    const store = new FakeStore();
    const systems = createSceneBootstrap({
      emitter: bus,
      store,
      preplacedOrcCount: 0,
    });
    setActiveSystems(systems);

    const first = tryHeroAbility(0);
    expect(first?.used).toBe(true);
    const second = tryHeroAbility(100);
    expect(second?.used).toBe(false);
    if (second && !second.used) {
      expect(second.reason).toBe('cooldown');
    }

    setActiveSystems(null);
    systems.destroy();
  });
});
