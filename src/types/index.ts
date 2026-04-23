export interface UnitStats {
  hp: number;
  dps: number;
  speed: number;
  armor: number;
}

export interface UnitCost {
  gold: number;
  trainTime: number;
}

export interface RespawnCost {
  gold: number;
  time: number;
}

export interface UnitDef {
  id: string;
  name: string;
  bloodline: string;
  category: 'melee' | 'ranged' | 'caster' | 'builder' | 'siege' | 'healer' | 'fodder';
  faction: 'orc' | 'human';
  stats: UnitStats;
  cost: UnitCost;
  respawnCost?: RespawnCost;
  sprite: string;
  animations: string[];
  abilities: string[];
  unlockRequirement: string | null;
  flavor: string;
}

export interface Resource {
  gold: number;
  wood: number;
  stone: number;
}
