import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Preload' });
  }

  preload(): void {
    this.load.tilemapTiledJSON('placeholder-map', 'data/maps/placeholder.json');
    this.load.tilemapTiledJSON('m1-slice', 'data/maps/m1-slice.json');
  }

  create(): void {
    this.scene.start('Game');
  }
}
