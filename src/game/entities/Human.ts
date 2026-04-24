import type { UnitDef } from '@/types';
import {
  Damageable,
  Targetable,
  CATEGORY_TARGET_PRIORITY,
  SimpleEventEmitter,
} from '@/game/components';
import type { EventEmitterLike } from '@/game/components';

/**
 * Human — Umie Crusade attacker entity.
 *
 * Structurally identical to Orc but asserted against `faction: 'human'`.
 * All stats come from the validated UnitDef.
 */
export class Human {
  readonly def: UnitDef;
  readonly emitter: EventEmitterLike;
  readonly damageable: Damageable;
  readonly targetable: Targetable;

  private constructor(
    def: UnitDef,
    emitter: EventEmitterLike,
    damageable: Damageable,
    targetable: Targetable,
  ) {
    this.def = def;
    this.emitter = emitter;
    this.damageable = damageable;
    this.targetable = targetable;
  }

  static fromDef(def: UnitDef, emitter?: EventEmitterLike): Human {
    if (def.faction !== 'human') {
      throw new Error(
        `Human.fromDef: expected faction 'human', got '${def.faction}' (${def.id})`,
      );
    }
    const ee: EventEmitterLike = emitter ?? new SimpleEventEmitter();
    const damageable = new Damageable({
      hp: def.stats.hp,
      armor: def.stats.armor,
      emitter: ee,
    });
    const targetable = new Targetable({
      priority: CATEGORY_TARGET_PRIORITY[def.category],
      emitter: ee,
    });
    return new Human(def, ee, damageable, targetable);
  }
}
