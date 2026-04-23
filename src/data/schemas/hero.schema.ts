import { z } from 'zod';
import { unitDefSchema } from './unit.schema';

export const heroAbilitySchema = z.object({
  id: z.string().min(1),
  damage: z.number().nonnegative(),
  radius: z.number().nonnegative(),
  stunMs: z.number().nonnegative(),
  cooldownMs: z.number().nonnegative(),
  cost: z
    .object({
      souls: z.number().nonnegative().optional(),
    })
    .optional(),
});

export const heroDefSchema = unitDefSchema.extend({
  ability: heroAbilitySchema,
});
