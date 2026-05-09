import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { groundHeight } from "../shared/worldgen";

export class Mushroom {
  scene: Phaser.Scene;
  i: number;
  j: number;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;

  constructor(scene: Phaser.Scene, i: number, j: number, worldSeed: number) {
    this.scene = scene;
    this.i = i;
    this.j = j;

    const seed = (i * 53 + j * 31) >>> 0;
    const cluster = 1 + (seed % 3);
    const scale = 0.95 + ((seed >> 5) % 5) / 30;
    const { x, y } = gridToScreen(i + 0.5, j + 0.5);
    const h = groundHeight(worldSeed, i + 0.5, j + 0.5);
    const wy = y - h;

    this.shadow = scene.add.ellipse(x, wy + 1, 11, 5, 0x000000, 0.28);
    this.shadow.setDepth((i + 0.5 + j + 0.5) * TILE_H - 0.5);

    const parts: Phaser.GameObjects.GameObject[] = [];
    for (let k = 0; k < cluster; k++) {
      const ox = ((((seed >> (k * 4 + 1)) & 0xf) / 15) - 0.5) * 8;
      const small = (seed >> (k * 5 + 2)) & 1;
      const stemH = small ? 4 : 6;
      const stemW = small ? 2 : 3;
      const capW = small ? 5 : 7;
      const capH = small ? 3 : 4;
      const stem = this.scene.add.rectangle(ox, -stemH / 2, stemW, stemH, 0xeae0c8)
        .setStrokeStyle(0.6, 0x4a3a20);
      const cap = this.scene.add.ellipse(ox, -stemH, capW, capH, 0xc24a3a)
        .setStrokeStyle(0.8, 0x6a1518);
      const dot1 = this.scene.add.circle(ox - 1.4, -stemH - 0.5, 0.7, 0xfff5e8);
      const dot2 = this.scene.add.circle(ox + 1.5, -stemH + 0.2, 0.6, 0xfff5e8);
      parts.push(stem, cap, dot1, dot2);
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
      scale: 0.5,
      duration: 220,
      ease: "Cubic.easeIn",
      onComplete: () => this.container.destroy(),
    });
  }
}
