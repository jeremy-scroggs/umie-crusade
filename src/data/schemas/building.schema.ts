import { z } from 'zod';

const buildingBase = {
  id: z.string().min(1),
  name: z.string().min(1),
  hp: z.number().positive(),
  armor: z.number().nonnegative(),
  buildCost: z.object({
    gold: z.number().nonnegative(),
  }),
  sprite: z.string().min(1),
  flavor: z.string(),
};

const damageStatesSchema = z
  .array(
    z.object({
      hpThreshold: z.number().nonnegative(),
      sprite: z.string().min(1),
    }),
  )
  .min(1);

const towerCombatSchema = z.object({
  range: z.number().positive(),
  damage: z.number().nonnegative(),
  attackRate: z.number().positive(),
  projectileSpeed: z.number().positive(),
});

export const wallDefSchema = z.object({
  ...buildingBase,
  category: z.literal('wall'),
  repairCost: z.object({
    goldPerHp: z.number().nonnegative(),
  }),
  damageStates: damageStatesSchema,
});

export const towerDefSchema = z.object({
  ...buildingBase,
  category: z.literal('tower'),
  combat: towerCombatSchema,
});

// M2 stone walls — same shape as wood walls but a different category
// discriminator so build/repair logic can branch on tier without
// scanning `id`. Stone gets its dedicated arm rather than a
// `material` field on `wall` so existing wood-wall fixtures remain
// untouched.
export const wallStoneDefSchema = z.object({
  ...buildingBase,
  category: z.literal('wall-stone'),
  repairCost: z.object({
    goldPerHp: z.number().nonnegative(),
  }),
  damageStates: damageStatesSchema,
});

// M2 gates — a wall variant that selectively allows passage. The
// `passableByTeam` enum encodes the gameplay states: open to orcs,
// open to humans (rare — sabotage), open to both, sealed.
export const gateDefSchema = z.object({
  ...buildingBase,
  category: z.literal('gate'),
  repairCost: z.object({
    goldPerHp: z.number().nonnegative(),
  }),
  damageStates: damageStatesSchema,
  passableByTeam: z.enum(['orc', 'human', 'both', 'none']),
});

// M2 watchtowers — a tower variant with a vision radius distinct from
// its weapon range. `sightRadius` reveals fog-of-war / lights up
// approaching waves; `combat.range` is the firing envelope.
export const watchtowerDefSchema = z.object({
  ...buildingBase,
  category: z.literal('watchtower'),
  combat: towerCombatSchema,
  sightRadius: z.number().positive(),
});

export const buildingDefSchema = z.discriminatedUnion('category', [
  wallDefSchema,
  towerDefSchema,
  wallStoneDefSchema,
  gateDefSchema,
  watchtowerDefSchema,
]);
