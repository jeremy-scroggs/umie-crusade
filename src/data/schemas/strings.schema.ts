import { z } from 'zod';

// Canonical UI string keys. Keep alphabetised within each namespace group
// so drift is easy to spot in review. Adding a new key: add it here AND
// in `src/data/strings/en.json` (plus any other locale bundles). Removing
// a key: grep for callers of `t('<key>')` first.
export const stringsDefSchema = z.object({
  'game.title': z.string().min(1),

  'hud.gold': z.string().min(1),
  'hud.wave': z.string().min(1),
  'hud.lives': z.string().min(1),
  'hud.skulls': z.string().min(1),
  'hud.heroHp': z.string().min(1),

  'menu.start': z.string().min(1),
  'menu.settings': z.string().min(1),
  'menu.credits': z.string().min(1),

  'hero.create.title': z.string().min(1),
  'hero.create.bloodlineLabel': z.string().min(1),
  'hero.create.nameLabel': z.string().min(1),
  'hero.create.namePlaceholder': z.string().min(1),
  'hero.create.beginButton': z.string().min(1),

  'build.wall': z.string().min(1),
  'build.ballista': z.string().min(1),
  'build.repair': z.string().min(1),
  'build.insufficientGold': z.string().min(1),

  'battle.waveStart': z.string().min(1),
  'battle.heroAbility': z.string().min(1),
  'battle.victory': z.string().min(1),
  'battle.defeat': z.string().min(1),
  'battle.defeatCreed': z.string().min(1),
  'battle.killConfirm': z.string().min(1),
  'battle.bossWave': z.string().min(1),
});

export type StringsDef = z.infer<typeof stringsDefSchema>;
export type StringKey = keyof StringsDef;
