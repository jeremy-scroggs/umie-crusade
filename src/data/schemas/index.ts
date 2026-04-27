import type { ZodTypeAny } from 'zod';
import { unitDefSchema } from './unit.schema';
import { buildingDefSchema } from './building.schema';
import {
  waveDefSchema,
  wavePatternSchema,
  waveGeneratorConfigSchema,
} from './wave.schema';
import { heroDefSchema } from './hero.schema';
import { stringsDefSchema } from './strings.schema';
import { inputGesturesSchema } from './input.schema';

export * from './unit.schema';
export * from './building.schema';
export * from './wave.schema';
export * from './hero.schema';
export * from './strings.schema';
export * from './input.schema';

export const dataRegistry: Record<string, ZodTypeAny> = {
  orcs: unitDefSchema,
  humans: unitDefSchema,
  buildings: buildingDefSchema,
  waves: waveDefSchema,
  'waves/patterns': wavePatternSchema,
  heroes: heroDefSchema,
  strings: stringsDefSchema,
  input: inputGesturesSchema,
};

// Per-file schema overrides for entries that share a directory with a
// different default schema. Path is relative to `src/data/`.
export const dataFileOverrides: Record<string, ZodTypeAny> = {
  'waves/generator.json': waveGeneratorConfigSchema,
};
