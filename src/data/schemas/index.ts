import type { ZodTypeAny } from 'zod';
import { unitDefSchema } from './unit.schema';
import { buildingDefSchema } from './building.schema';
import { waveDefSchema } from './wave.schema';
import { heroDefSchema } from './hero.schema';
import { stringsDefSchema } from './strings.schema';

export * from './unit.schema';
export * from './building.schema';
export * from './wave.schema';
export * from './hero.schema';
export * from './strings.schema';

export const dataRegistry: Record<string, ZodTypeAny> = {
  orcs: unitDefSchema,
  humans: unitDefSchema,
  buildings: buildingDefSchema,
  waves: waveDefSchema,
  heroes: heroDefSchema,
  strings: stringsDefSchema,
};
