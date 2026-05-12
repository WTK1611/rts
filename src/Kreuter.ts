import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { groundHeight } from "../shared/worldgen";

export class Kreuter {
  scene: Phaser.Scene;
  i: number;
  j: number;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;

  constructor(scene: Phaser.Scene, i: number, j: number, worldSeed: number) {
    this.scene = scene;
    this.i = i;
    this.j = j;

    const seed = (i * 67 + j * 47) >>> 0;
    const variant = seed % 3;
    const scale = 0.9 + ((seed >> 5) % 5) / 30;
    const { x, y } = gridToScreen(i + 0.5, j + 0.5);
    const h = groundHeight(worldSeed, i + 0.5, j + 0.5);
    const wy = y - h;

    this.shadow = scene.add.ellipse(x, wy + 1, 10, 4, 0x000000, 0.25);
    this.shadow.setDepth((i + 0.5 + j + 0.5) * TILE_H - 0.5);

    const stemColor = 0x5d9a5d;
    const leafColor = variant === 0 ? 0x8fd06a : variant === 1 ? 0x9ad876 : 0x7fc05b;
    const tipColor = 0xe6f1a8;

    const parts: Phaser.GameObjects.GameObject[] = [];
    const blades = 4 + (seed % 3);
    for (let k = 0; k < blades; k++) {
      const ang = ((k / blades) * Math.PI * 2 + ((seed >> (k + 1)) & 0x7) * 0.06) - Math.PI / 2;
      const len = 5 + ((seed >> (k * 2 + 1)) & 0x3);
      const bx = Math.cos(ang) * 2.2;
      const by = Math.sin(ang) * 1.2 - 1.5;
      const stem = scene.add.rectangle(bx, by - len / 2, 1, len, stemColor);
      stem.setRotation(ang + Math.PI / 2);
      parts.push(stem);
      const tip = scene.add.ellipse(
        bx + Math.cos(ang) * (len - 1),
        by - len + Math.sin(ang) * 0.5,
        3,
        2,
        leafColor,
      ).setStrokeStyle(0.4, 0x33571f);
      parts.push(tip);
    }
    // small flower buds on top to make them visible as a rare herb
    const flower1 = scene.add.circle(-1, -6, 1.1, tipColor).setStrokeStyle(0.4, 0xa8aa3a);
    const flower2 = scene.add.circle(2, -5, 1.0, tipColor).setStrokeStyle(0.4, 0xa8aa3a);
    parts.push(flower1, flower2);

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
      duration: 220,
      ease: "Cubic.easeIn",
      onComplete: () => this.container.destroy(),
    });
  }
}
