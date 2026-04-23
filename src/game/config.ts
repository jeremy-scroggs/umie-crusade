import Phaser from 'phaser';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from '@/lib/constants';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { GameScene } from './scenes/GameScene';

export const createGameConfig = (
  parent: HTMLElement,
): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  parent,
  width: VIRTUAL_WIDTH,
  height: VIRTUAL_HEIGHT,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  backgroundColor: '#1a1a2e',
  scene: [BootScene, PreloadScene, GameScene],
  pixelArt: true,
  roundPixels: true,
});
