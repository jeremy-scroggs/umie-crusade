import { z } from 'zod';

// Canonical UI string keys. Keep alphabetised within each namespace group
// so drift is easy to spot in review. Adding a new key: add it here AND
// in `src/data/strings/en.json` (plus any other locale bundles). Removing
// a key: grep for callers of `t('<key>')` first.
export const stringsDefSchema = z.object({
  'game.title': z.string().min(1),

  'hud.bludgelt': z.string().min(1),
  'hud.wave': z.string().min(1),
  'hud.lives': z.string().min(1),
  'hud.skulls': z.string().min(1),
  'hud.skullsAria': z.string().min(1),
  'hud.heroHp': z.string().min(1),
  'hud.ability': z.string().min(1),
  'hud.abilityReady': z.string().min(1),
  'hud.speed.pause': z.string().min(1),
  'hud.speed.pauseAria': z.string().min(1),
  'hud.speed.1x': z.string().min(1),
  'hud.speed.2x': z.string().min(1),
  'hud.speed.4x': z.string().min(1),
  'hud.speed.groupAria': z.string().min(1),

  'menu.start': z.string().min(1),
  'menu.settings': z.string().min(1),
  'menu.credits': z.string().min(1),

  'hero.create.title': z.string().min(1),
  'hero.create.unitLabel': z.string().min(1),
  'hero.create.nameLabel': z.string().min(1),
  'hero.create.namePlaceholder': z.string().min(1),
  'hero.create.beginButton': z.string().min(1),

  'build.wall': z.string().min(1),
  'build.ballista': z.string().min(1),
  'build.repair': z.string().min(1),
  'build.insufficientBludgelt': z.string().min(1),

  'battle.waveStart': z.string().min(1),
  'battle.charge': z.string().min(1),
  'battle.scoutWarn': z.string().min(1),
  'battle.heroAbility': z.string().min(1),
  'battle.victory': z.string().min(1),
  'battle.defeat': z.string().min(1),
  'battle.defeatCreed': z.string().min(1),
  'battle.creed': z.string().min(1),
  'battle.killConfirm': z.string().min(1),
  'battle.bossWave': z.string().min(1),
  'battle.mojokaTaboo': z.string().min(1),

  'runEnd.statsWave': z.string().min(1),
  'runEnd.statsSkulls': z.string().min(1),
  'runEnd.statsBludgelt': z.string().min(1),
  'runEnd.replay': z.string().min(1),
  'runEnd.mainMenu': z.string().min(1),

  'winScreen.title': z.string().min(1),
  'loseScreen.title': z.string().min(1),

  // M2 unit display strings — name + flavor per fixture id
  // (`src/data/orcs/`, `src/data/humans/`).
  'ui.unit.peon.name': z.string().min(1),
  'ui.unit.peon.flavor': z.string().min(1),
  'ui.unit.gukka.name': z.string().min(1),
  'ui.unit.gukka.flavor': z.string().min(1),
  'ui.unit.skowt.name': z.string().min(1),
  'ui.unit.skowt.flavor': z.string().min(1),
  'ui.unit.mojoka.name': z.string().min(1),
  'ui.unit.mojoka.flavor': z.string().min(1),
  'ui.unit.order-of-honor.name': z.string().min(1),
  'ui.unit.order-of-honor.flavor': z.string().min(1),
  'ui.unit.rangers-of-justice.name': z.string().min(1),
  'ui.unit.rangers-of-justice.flavor': z.string().min(1),

  // M2 hero display strings — separate namespace from base unit because
  // hero ids (e.g. `skowt-hero`) differ from grunt ids (`skowt`).
  'ui.hero.skowt-hero.name': z.string().min(1),
  'ui.hero.skowt-hero.flavor': z.string().min(1),
  'ui.hero.mojoka-hero.name': z.string().min(1),
  'ui.hero.mojoka-hero.flavor': z.string().min(1),

  // M2 building display strings — name + flavor per fixture id
  // (`src/data/buildings/`).
  'ui.building.wall-wood.name': z.string().min(1),
  'ui.building.wall-wood.flavor': z.string().min(1),
  'ui.building.ballista.name': z.string().min(1),
  'ui.building.ballista.flavor': z.string().min(1),
});

export type StringsDef = z.infer<typeof stringsDefSchema>;
export type StringKey = keyof StringsDef;
