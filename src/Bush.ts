import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { groundHeight } from "../shared/worldgen";

export class Bush {
  scene: Phaser.Scene;
  i: number;
  j: number;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;

  constructor(scene: Phaser.Scene, i: number, j: number, worldSeed: number) {
    this.scene = scene;
    this.i = i;
    this.j = j;

    const seed = (i * 41 + j * 23) >>> 0;
    const variant = seed % 3;
    const scale = 0.9 + ((seed >> 5) % 5) / 30;
    const { x, y } = gridToScreen(i + 0.5, j + 0.5);
    const h = groundHeight(worldSeed, i + 0.5, j + 0.5);
    const wy = y - h;

    this.shadow = scene.add.ellipse(x, wy + 1, 16, 6, 0x000000, 0.3);
    this.shadow.setDepth((i + 0.5 + j + 0.5) * TILE_H - 0.5);

    const leafColor = variant === 0 ? 0x2f6b2f : variant === 1 ? 0x3a7a3a : 0x355d35;
    const leafShadow = scene.add.ellipse(1, -5, 16, 11, 0x183818, 0.6);
    const leaves = scene.add
      .ellipse(0, -6, 16, 12, leafColor)
      .setStrokeStyle(1.2, 0x183818);
    const leafHi = scene.add.ellipse(-3, -8, 7, 5, 0x6cbf6c, 0.55);

    const berries: Phaser.GameObjects.Arc[] = [];
    const berryCount = 3 + (seed % 4);
    for (let k = 0; k < berryCount; k++) {
      const ang = ((seed >> (k * 3 + 1)) & 0xff) / 255 * Math.PI * 2;
      const rr = 4 + (((seed >> (k * 2 + 2)) & 0x7) / 8) * 3;
      const bx = Math.cos(ang) * rr;
      const by = -6 + Math.sin(ang) * rr * 0.5;
      const berry = scene.add.circle(bx, by, 1.5, 0xc23a5a).setStrokeStyle(0.5, 0x6a1530);
      berries.push(berry);
    }

    this.container = scene.add.container(x, wy, [leafShadow, leaves, leafHi, ...berries]);
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
