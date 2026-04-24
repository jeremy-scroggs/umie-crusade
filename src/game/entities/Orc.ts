import type { UnitDef } from '@/types';
import {
  Damageable,
  Targetable,
  CATEGORY_TARGET_PRIORITY,
  SimpleEventEmitter,
} from '@/game/components';
import type { EventEmitterLike } from '@/game/components';

/**
 * Orc — Bloodrock-faction unit entity.
 *
 * Lightweight host object: owns its own EventEmitter and components.
 * Does NOT subclass Phaser.GameObjects.Sprite — a later issue will bind a
 * sprite via a Scene helper. All stats come from the validated UnitDef;
 * no balance numbers appear in this file.
 */
export class Orc {
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

  static fromDef(def: UnitDef, emitter?: EventEmitterLike): Orc {
    if (def.faction !== 'orc') {
      throw new Error(
        `Orc.fromDef: expected faction 'orc', got '${def.faction}' (${def.id})`,
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
    return new Orc(def, ee, damageable, targetable);
  }
}
