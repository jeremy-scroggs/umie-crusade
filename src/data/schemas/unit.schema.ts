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

// Coarse taxonomy bucket above `id`. Optional today: M1 fixtures
// (`grunt`, `brute`, `peasant-levy`) predate the field. M2 unit
// definitions (peon/gukka/skowt/mojoka) are expected to populate it,
// and `grunt`/`brute` are kept in the enum so the existing roster can
// adopt it later without a follow-up schema change.
export const unitKindSchema = z.enum([
  'grunt',
  'brute',
  'peon',
  'gukka',
  'skowt',
  'mojoka',
]);

// Functional role that systems (AI, build menu, gather) branch on.
// Distinct from `category` (which describes combat shape:
// melee/ranged/caster/...) — `role` describes what the unit DOES in
// the player's economy. Optional for the same backwards-compat reason
// as `kind`.
export const unitRoleSchema = z.enum([
  'fighter',
  'builder',
  'gatherer',
  'caster',
  'scout',
]);

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
  kind: unitKindSchema.optional(),
  role: unitRoleSchema.optional(),
});
