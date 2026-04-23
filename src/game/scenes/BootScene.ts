import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
    this.load.image('placeholder-tileset', 'assets/placeholder-tileset.png');
  }

  create(): void {
    this.scene.start('Preload');
  }
}
