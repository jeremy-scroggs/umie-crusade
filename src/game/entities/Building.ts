import type { BuildingDef, TowerDef, WallDef } from '@/types';
import {
  Breakable,
  Upgradeable,
  SimpleEventEmitter,
} from '@/game/components';
import type { EventEmitterLike } from '@/game/components';
import { GameEvents, type WallEventPayload } from '@/game/systems/events';

/**
 * Building — wall or tower entity.
 *
 * Uses the discriminated BuildingDef union on `category`. Walls supply
 * `damageStates` to Breakable; towers pass an empty list and expose their
 * `combat` block via a getter for future combat systems.
 *
 * All stats (hp, armor, combat, damage thresholds) come from the def.
 *
 * Grid cell binding (#15): when constructed with a `cell`, the entity
 * subscribes to its Breakable's `'destroyed'` event and re-emits the
 * system-level `wall:destroyed` event with `{x,y}` on its own emitter
 * so the surrounding system (BuildingSystem / Pathfinding) can react.
 * Walls instantiated without a cell (older tests, towers) skip the
 * re-emit. Each Building owns its own emitter by default to keep
 * per-wall `'damaged'` events from bleeding across instances.
 */
/** Grid cell — duplicated locally to avoid a Pathfinding import here. */
export interface BuildingCell {
  x: number;
  y: number;
}

export class Building {
  readonly def: BuildingDef;
  readonly emitter: EventEmitterLike;
  readonly breakable: Breakable;
  readonly upgradeable: Upgradeable;
  readonly cell?: BuildingCell;

  private constructor(
    def: BuildingDef,
    emitter: EventEmitterLike,
    breakable: Breakable,
    upgradeable: Upgradeable,
    cell?: BuildingCell,
  ) {
    this.def = def;
    this.emitter = emitter;
    this.breakable = breakable;
    this.upgradeable = upgradeable;
    this.cell = cell;

    if (cell) {
      const payload: WallEventPayload = { x: cell.x, y: cell.y };
      this.emitter.on('destroyed', () => {
        this.emitter.emit(GameEvents.WallDestroyed, payload);
      });
    }
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

  static fromDef(
    def: BuildingDef,
    emitter?: EventEmitterLike,
    cell?: BuildingCell,
  ): Building {
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
    return new Building(def, ee, breakable, upgradeable, cell);
  }
}
