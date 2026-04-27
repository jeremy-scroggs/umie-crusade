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

// M2 wave-pattern: a named, parameterised composition (e.g. 'rush',
// 'wedge', 'siege') that a generator rolls into a concrete `WaveDef`.
// `units` holds weighted picks; `edgeBias` lists which spawn edges the
// generator may draw from when materialising a wave.
export const wavePatternSchema = z.object({
  id: z.string().min(1),
  units: z
    .array(
      z.object({
        unitId: z.string().min(1),
        weight: z.number().positive(),
      }),
    )
    .min(1),
  edgeBias: z.array(spawnEdgeSchema).min(1),
  cry: z.string().optional(),
});

// M2 wave-generator config: top-level knobs the generator consumes to
// emit a sequence of `WaveDef`s. `patterns` references
// `WavePattern.id` values; `baseBudget` + `budgetGrowth` shape the
// difficulty curve (additive growth per wave).
export const waveGeneratorConfigSchema = z.object({
  id: z.string().min(1),
  waveCount: z.number().int().positive(),
  baseBudget: z.number().nonnegative(),
  budgetGrowth: z.number().nonnegative(),
  patterns: z.array(z.string().min(1)).min(1),
  rewardPerWave: z.object({
    gold: z.number().nonnegative(),
  }),
});
