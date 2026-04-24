import type { z } from 'zod';
import type {
  unitStatsSchema,
  unitCostSchema,
  respawnCostSchema,
  unitDefSchema,
} from '@/data/schemas/unit.schema';
import type {
  wallDefSchema,
  towerDefSchema,
  buildingDefSchema,
} from '@/data/schemas/building.schema';
import type {
  waveSpawnSchema,
  waveDefSchema,
  spawnEdgeSchema,
} from '@/data/schemas/wave.schema';
import type {
  heroAbilitySchema,
  heroDefSchema,
} from '@/data/schemas/hero.schema';
import type { stringsDefSchema } from '@/data/schemas/strings.schema';

export type UnitStats = z.infer<typeof unitStatsSchema>;
export type UnitCost = z.infer<typeof unitCostSchema>;
export type RespawnCost = z.infer<typeof respawnCostSchema>;
export type UnitDef = z.infer<typeof unitDefSchema>;

export type WallDef = z.infer<typeof wallDefSchema>;
export type TowerDef = z.infer<typeof towerDefSchema>;
export type BuildingDef = z.infer<typeof buildingDefSchema>;

export type SpawnEdge = z.infer<typeof spawnEdgeSchema>;
export type WaveSpawn = z.infer<typeof waveSpawnSchema>;
export type WaveDef = z.infer<typeof waveDefSchema>;

export type HeroAbility = z.infer<typeof heroAbilitySchema>;
export type HeroDef = z.infer<typeof heroDefSchema>;

export type StringsDef = z.infer<typeof stringsDefSchema>;

export interface Resource {
  gold: number;
  wood: number;
  stone: number;
}

// Roster-level hero record: the player's *instance* of a bloodline. Distinct
// from `HeroDef` (static JSON definition — stats, sprite, ability). A roster
// entry carries identity (uuid), the player's chosen name, and a foreign key
// back into the hero JSON via `heroDefId`.
export interface Hero {
  id: string;
  name: string;
  bloodline: string;
  heroDefId: string;
  createdAt: number;
}
