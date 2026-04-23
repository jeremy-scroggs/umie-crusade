import Phaser from 'phaser';
import { getGameStore } from '@/state/bridge';
import { TILE_SIZE } from '@/lib/constants';

export class GameScene extends Phaser.Scene {
  private map!: Phaser.Tilemaps.Tilemap;

  constructor() {
    super({ key: 'Game' });
  }

  create(): void {
    this.map = this.make.tilemap({ key: 'placeholder-map' });
    const tileset = this.map.addTilesetImage('placeholder', 'placeholder-tileset');

    if (tileset) {
      this.map.createLayer('Ground', tileset, 0, 0);
    }

    // Click/tap a tile to add gold (M0 proof-of-concept for bridge)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const tileX = Math.floor(pointer.worldX / TILE_SIZE);
      const tileY = Math.floor(pointer.worldY / TILE_SIZE);

      if (tileX >= 0 && tileX < this.map.width && tileY >= 0 && tileY < this.map.height) {
        getGameStore().addGold(10);
      }
    });
  }
}
