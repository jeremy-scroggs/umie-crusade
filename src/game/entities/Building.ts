import type { BuildingDef, TowerDef, WallDef } from '@/types';
import {
  Breakable,
  Upgradeable,
  SimpleEventEmitter,
} from '@/game/components';
import type { EventEmitterLike } from '@/game/components';

/**
 * Building — wall or tower entity.
 *
 * Uses the discriminated BuildingDef union on `category`. Walls supply
 * `damageStates` to Breakable; towers pass an empty list and expose their
 * `combat` block via a getter for future combat systems.
 *
 * All stats (hp, armor, combat, damage thresholds) come from the def.
 */
export class Building {
  readonly def: BuildingDef;
  readonly emitter: EventEmitterLike;
  readonly breakable: Breakable;
  readonly upgradeable: Upgradeable;

  private constructor(
    def: BuildingDef,
    emitter: EventEmitterLike,
    breakable: Breakable,
    upgradeable: Upgradeable,
  ) {
    this.def = def;
    this.emitter = emitter;
    this.breakable = breakable;
    this.upgradeable = upgradeable;
  }

  get category(): BuildingDef['category'] {
    return this.def.category;
  }

  /** Tower-only: returns the combat block. Throws for walls. */
  get combat(): TowerDef['combat'] {
    if (this.def.category !== 'tower') {
      throw new Error(
        `Building.combat: '${this.def.id}' is a ${this.def.category}, not a tower`,
      );
    }
    return this.def.combat;
  }

  /** Wall-only: returns damage states. Throws for towers. */
  get damageStates(): WallDef['damageStates'] {
    if (this.def.category !== 'wall') {
      throw new Error(
        `Building.damageStates: '${this.def.id}' is a ${this.def.category}, not a wall`,
      );
    }
    return this.def.damageStates;
  }

  static fromDef(def: BuildingDef, emitter?: EventEmitterLike): Building {
    const ee: EventEmitterLike = emitter ?? new SimpleEventEmitter();
    const damageStates = def.category === 'wall' ? def.damageStates : [];
    const breakable = new Breakable({
      hp: def.hp,
      armor: def.armor,
      emitter: ee,
      damageStates,
      fallbackSprite: def.sprite,
    });
    const upgradeable = new Upgradeable({ emitter: ee });
    return new Building(def, ee, breakable, upgradeable);
  }
}
