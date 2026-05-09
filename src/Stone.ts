import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { groundHeight } from "../shared/worldgen";

export class Stone {
  scene: Phaser.Scene;
  i: number;
  j: number;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;

  constructor(scene: Phaser.Scene, i: number, j: number, worldSeed: number) {
    this.scene = scene;
    this.i = i;
    this.j = j;

    const seed = (i * 47 + j * 37) >>> 0;
    const variant = seed % 3;
    const scale = 0.9 + ((seed >> 5) % 5) / 30;
    const { x, y } = gridToScreen(i + 0.5, j + 0.5);
    const h = groundHeight(worldSeed, i + 0.5, j + 0.5);
    const wy = y - h;

    this.shadow = scene.add.ellipse(x, wy + 1, 14, 5, 0x000000, 0.32);
    this.shadow.setDepth((i + 0.5 + j + 0.5) * TILE_H - 0.5);

    const baseColor = variant === 0 ? 0x7a7a7a : variant === 1 ? 0x868686 : 0x6a6a6a;
    const dark = 0x4a4a4a;
    const light = 0xb0b0b0;

    const big = scene.add.ellipse(0, -3, 11, 7, baseColor)
      .setStrokeStyle(0.8, dark, 0.7);
    const bigHi = scene.add.ellipse(-2, -4.5, 5, 2.4, light, 0.55);

    const parts: Phaser.GameObjects.GameObject[] = [big, bigHi];

    if ((seed >> 4) % 3 === 0) {
      const small = scene.add.ellipse(4, -1, 5, 3, baseColor)
        .setStrokeStyle(0.6, dark, 0.6);
      parts.push(small);
    }
    if ((seed >> 6) % 4 === 0) {
      const small2 = scene.add.ellipse(-4, 0, 4, 2.5, dark, 0.85);
      parts.push(small2);
    }

    this.container = scene.add.container(x, wy, parts);
    this.container.setScale(scale);
    this.container.setDepth((i + 0.5 + j + 0.5) * TILE_H);
  }

  remove(): void {
    this.shadow.destroy();
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      scale: 0.4,
      duration: 250,
      ease: "Cubic.easeIn",
      onComplete: () => this.container.destroy(),
    });
  }
}
