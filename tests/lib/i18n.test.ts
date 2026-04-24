import { describe, it, expect } from 'vitest';
import { t } from '@/lib/i18n';
import type { StringKey } from '@/data/schemas/strings.schema';

describe('t()', () => {
  it('resolves a known key to its value', () => {
    expect(t('game.title')).toBe('Umie Crusade');
    expect(t('battle.waveStart')).toBe('ISE HAI!');
    expect(t('battle.heroAbility')).toBe('KWAT DA TRA!');
    expect(t('battle.victory')).toBe('Bludchok-hai gug!');
  });

  it('throws on an unknown key (runtime drift)', () => {
    // Simulate a programmer casting a bad string through StringKey.
    expect(() => t('nope.does-not-exist' as StringKey)).toThrow(
      /\[i18n\] missing string/,
    );
  });
});
