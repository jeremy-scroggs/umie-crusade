import type { EventEmitterLike } from './EventEmitter';

/**
 * Upgradeable — placeholder component for future upgrade paths.
 *
 * M1 does not ship upgrade trees; this stub exposes the API surface so
 * later issues can flesh out without renaming or re-wiring. Entity files
 * attach an Upgradeable instance; systems can check `canUpgrade()` to
 * decide whether to offer upgrades in the UI.
 */
export interface UpgradeOption {
  id: string;
  label: string;
}

export interface UpgradeableOptions {
  emitter: EventEmitterLike;
  upgrades?: UpgradeOption[];
  level?: number;
}

const DEFAULT_LEVEL = 1;

export class Upgradeable {
  readonly emitter: EventEmitterLike;
  readonly upgrades: UpgradeOption[];
  private _level: number;

  constructor(opts: UpgradeableOptions) {
    this.emitter = opts.emitter;
    this.upgrades = opts.upgrades ?? [];
    this._level = opts.level ?? DEFAULT_LEVEL;
  }

  get level(): number {
    return this._level;
  }

  canUpgrade(): boolean {
    return this.upgrades.length > 0;
  }

  applyUpgrade(id: string): void {
    if (!this.canUpgrade()) {
      throw new Error(`Upgradeable: no upgrades defined (tried '${id}')`);
    }
    const found = this.upgrades.find((u) => u.id === id);
    if (!found) {
      throw new Error(`Upgradeable: unknown upgrade id '${id}'`);
    }
    this._level += 1;
    this.emitter.emit('upgraded', { id, level: this._level });
  }
}
