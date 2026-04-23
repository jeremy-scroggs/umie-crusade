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

export const wallDefSchema = z.object({
  ...buildingBase,
  category: z.literal('wall'),
  repairCost: z.object({
    goldPerHp: z.number().nonnegative(),
  }),
  damageStates: z
    .array(
      z.object({
        hpThreshold: z.number().nonnegative(),
        sprite: z.string().min(1),
      }),
    )
    .min(1),
});

export const towerDefSchema = z.object({
  ...buildingBase,
  category: z.literal('tower'),
  combat: z.object({
    range: z.number().positive(),
    damage: z.number().nonnegative(),
    attackRate: z.number().positive(),
    projectileSpeed: z.number().positive(),
  }),
});

export const buildingDefSchema = z.discriminatedUnion('category', [
  wallDefSchema,
  towerDefSchema,
]);
