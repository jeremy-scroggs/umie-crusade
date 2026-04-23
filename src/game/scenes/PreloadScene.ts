import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Preload' });
  }

  preload(): void {
    this.load.tilemapTiledJSON('placeholder-map', 'data/maps/placeholder.json');
  }

  create(): void {
    this.scene.start('Game');
  }
}
