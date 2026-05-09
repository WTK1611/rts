import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";

const VARIANTS = [
  { trunkW: 5, trunkH: 12, leafW: 22, leafH: 24, leafColor: 0x2e7a2e },
  { trunkW: 7, trunkH: 16, leafW: 30, leafH: 32, leafColor: 0x276b27 },
  { trunkW: 6, trunkH: 14, leafW: 26, leafH: 28, leafColor: 0x3a8a3a },
  { trunkW: 6, trunkH: 18, leafW: 24, leafH: 34, leafColor: 0x205820 },
];

export class Tree {
  scene: Phaser.Scene;
  id: string;
  i: number;
  j: number;
  alive = true;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;

  constructor(scene: Phaser.Scene, id: string, i: number, j: number) {
    this.scene = scene;
    this.id = id;
    this.i = i;
    this.j = j;

    const vIdx = ((i * 31 + j * 17) % VARIANTS.length + VARIANTS.length) % VARIANTS.length;
    const v = VARIANTS[vIdx];
    const jitter = ((((i * 73 + j * 19) % 7) + 7) % 7 - 3) / 30;
    const scale = 1 + jitter;

    const { x, y } = gridToScreen(i + 0.5, j + 0.5);

    this.shadow = scene.add.ellipse(x, y + 2, v.leafW * 0.9, v.leafH * 0.35, 0x000000, 0.32);
    this.shadow.setDepth((i + 0.5 + j + 0.5) * TILE_H - 0.5);

    const trunk = scene.add.rectangle(0, -v.trunkH / 2, v.trunkW, v.trunkH, 0x5a3a1a);
    trunk.setStrokeStyle(1, 0x3a2410);
    const leavesShadow = scene.add.ellipse(2, -v.trunkH - v.leafH / 2 + 2, v.leafW, v.leafH, 0x000000, 0.18);
    const leaves = scene.add
      .ellipse(0, -v.trunkH - v.leafH / 2, v.leafW, v.leafH, v.leafColor)
      .setStrokeStyle(2, 0x183818);
    const highlight = scene.add.ellipse(
      -v.leafW * 0.18,
      -v.trunkH - v.leafH * 0.62,
      v.leafW * 0.45,
      v.leafH * 0.35,
      0x6cbf6c,
      0.55,
    );

    this.container = scene.add.container(x, y, [trunk, leavesShadow, leaves, highlight]);
    this.container.setScale(scale);
    this.container.setDepth((i + 0.5 + j + 0.5) * TILE_H);
  }

  fall(): void {
    this.alive = false;
    this.shadow.destroy();
    this.scene.tweens.add({
      targets: this.container,
      angle: 70,
      alpha: 0,
      y: this.container.y + 6,
      duration: 350,
      ease: "Cubic.easeIn",
      onComplete: () => this.container.destroy(),
    });
  }
}
