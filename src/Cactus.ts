import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { groundHeight } from "../shared/worldgen";

export class Cactus {
  scene: Phaser.Scene;
  i: number;
  j: number;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;

  constructor(scene: Phaser.Scene, i: number, j: number, worldSeed: number) {
    this.scene = scene;
    this.i = i;
    this.j = j;

    const seed = (i * 67 + j * 29) >>> 0;
    const variant = seed % 4;
    const scale = 0.95 + ((seed >> 5) % 5) / 25;
    const { x, y } = gridToScreen(i + 0.5, j + 0.5);
    const h = groundHeight(worldSeed, i + 0.5, j + 0.5);
    const wy = y - h;

    this.shadow = scene.add.ellipse(x, wy + 1, 10, 4, 0x000000, 0.32);
    this.shadow.setDepth((i + 0.5 + j + 0.5) * TILE_H - 0.5);

    const body = 0x3f7a3a;
    const bodyDark = 0x244a22;
    const bodyHi = 0x66a85a;

    const parts: Phaser.GameObjects.GameObject[] = [];

    const trunkH = 14 + ((seed >> 7) & 0x7);
    const trunkW = 4;
    const trunk = scene.add
      .rectangle(0, -trunkH / 2, trunkW, trunkH, body)
      .setStrokeStyle(0.8, bodyDark);
    const trunkHi = scene.add.rectangle(-1.1, -trunkH / 2, 1, trunkH - 2, bodyHi, 0.7);
    const trunkTop = scene.add.ellipse(0, -trunkH, trunkW, 2.4, body)
      .setStrokeStyle(0.8, bodyDark);
    parts.push(trunk, trunkHi, trunkTop);

    const drawArm = (
      side: 1 | -1,
      attachY: number,
      armLen: number,
      armH: number,
    ): void => {
      const horiz = scene.add
        .rectangle(side * 2.2, -attachY, 4, 2.4, body)
        .setStrokeStyle(0.8, bodyDark);
      const vert = scene.add
        .rectangle(side * 3.6, -attachY - armH / 2, 2.8, armH, body)
        .setStrokeStyle(0.8, bodyDark);
      const vertHi = scene.add.rectangle(
        side * 3.6 - 0.7,
        -attachY - armH / 2,
        0.7,
        armH - 1.5,
        bodyHi,
        0.7,
      );
      const cap = scene.add.ellipse(side * 3.6, -attachY - armH, 2.8, 1.6, body)
        .setStrokeStyle(0.8, bodyDark);
      void armLen;
      parts.push(horiz, vert, vertHi, cap);
    };

    if (variant === 0 || variant === 2) {
      drawArm(1, trunkH * 0.55, 4, 6 + ((seed >> 11) & 0x3));
    }
    if (variant === 1 || variant === 2) {
      drawArm(-1, trunkH * 0.65, 4, 5 + ((seed >> 13) & 0x3));
    }
    if (variant === 3) {
      drawArm(1, trunkH * 0.45, 4, 5);
      drawArm(-1, trunkH * 0.7, 4, 4);
    }

    const spineCount = 4 + (seed % 3);
    for (let k = 0; k < spineCount; k++) {
      const t = (k + 1) / (spineCount + 1);
      const sy = -trunkH * t;
      const dot = scene.add.circle(0, sy, 0.45, 0xfff4c0, 0.85);
      parts.push(dot);
    }

    if (((seed >> 17) & 0x3) === 0) {
      const flower = scene.add.circle(0, -trunkH - 1.2, 1.5, 0xff8a7a)
        .setStrokeStyle(0.4, 0x6b1f1f);
      parts.push(flower);
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
      duration: 260,
      ease: "Cubic.easeIn",
      onComplete: () => this.container.destroy(),
    });
  }
}
