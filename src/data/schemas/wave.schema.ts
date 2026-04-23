import { z } from 'zod';

export const spawnEdgeSchema = z.enum(['N', 'S', 'W']);

export const waveSpawnSchema = z.object({
  unitId: z.string().min(1),
  count: z.number().int().positive(),
  edge: spawnEdgeSchema,
  startDelay: z.number().nonnegative(),
  interval: z.number().nonnegative(),
});

export const waveDefSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().positive(),
  spawns: z.array(waveSpawnSchema).min(1),
  reward: z.object({
    gold: z.number().nonnegative(),
  }),
  cry: z.string().optional(),
});
