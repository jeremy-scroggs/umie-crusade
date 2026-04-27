import { z } from 'zod';

export const unitStatsSchema = z.object({
  hp: z.number().positive(),
  dps: z.number().nonnegative(),
  speed: z.number().nonnegative(),
  armor: z.number().nonnegative(),
});

export const unitCostSchema = z.object({
  gold: z.number().nonnegative(),
  trainTime: z.number().nonnegative(),
});

export const respawnCostSchema = z.object({
  gold: z.number().nonnegative(),
  time: z.number().nonnegative(),
});

export const unitDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['melee', 'ranged', 'caster', 'builder', 'siege', 'healer', 'fodder']),
  faction: z.enum(['orc', 'human']),
  stats: unitStatsSchema,
  cost: unitCostSchema,
  respawnCost: respawnCostSchema.optional(),
  sprite: z.string().min(1),
  animations: z.array(z.string()),
  abilities: z.array(z.string()),
  unlockRequirement: z.string().nullable(),
  flavor: z.string(),
  goldDrop: z.number().nonnegative().optional(),
});
