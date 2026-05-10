import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { groundHeight, hash3 } from "../shared/worldgen";

export class Sequoia {
  scene: Phaser.Scene;
  i: number;
  j: number;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;

  constructor(scene: Phaser.Scene, i: number, j: number, worldSeed: number) {
    this.scene = scene;
    this.i = i;
    this.j = j;

    const h = hash3(worldSeed ^ 0x5e92, i, j);
    const jitter = ((h % 11) - 5) / 60;
    const scale = 1 + jitter;

    const trunkW = 12;
    const trunkH = 70;
    const baseW = 18;
    const baseH = 12;
    const barkColor = 0x6e2f1a;
    const barkDark = 0x3f1a0e;
    const foliageDark = 0x163a16;
    const foliageMid = 0x1f5022;
    const foliageHi = 0x2e7a30;

    const { x, y } = gridToScreen(i + 0.5, j + 0.5);
    const gh = groundHeight(worldSeed, i + 0.5, j + 0.5);
    const wy = y - gh;

    this.shadow = scene.add.ellipse(x, wy + 3, baseW * 1.6, baseH, 0x000000, 0.4);
    this.shadow.setDepth((i + 0.5 + j + 0.5) * TILE_H - 0.5);

    const root = scene.add.ellipse(0, -1, baseW, baseH, barkDark, 0.95);
    const trunk = scene.add.rectangle(0, -trunkH / 2, trunkW, trunkH, barkColor)
      .setStrokeStyle(1.2, barkDark);
    const trunkHi = scene.add.rectangle(-trunkW / 2 + 2, -trunkH / 2, 2, trunkH * 0.92, 0x8a4226, 0.5);
    const trunkSh = scene.add.rectangle(trunkW / 2 - 1.4, -trunkH / 2 + 2, 2, trunkH * 0.85, barkDark, 0.55);
    const bark1 = scene.add.line(0, 0, -trunkW / 2 + 1.5, -trunkH * 0.25, -trunkW / 2 + 1.5, -trunkH * 0.85, barkDark, 0.6);
    const bark2 = scene.add.line(0, 0, 0, -trunkH * 0.4, 0, -trunkH * 0.95, barkDark, 0.55);
    const bark3 = scene.add.line(0, 0, trunkW / 2 - 1.5, -trunkH * 0.3, trunkW / 2 - 1.5, -trunkH * 0.78, barkDark, 0.5);

    const foliageBaseY = -trunkH;
    const layers: Phaser.GameObjects.GameObject[] = [];
    const layerSpecs: Array<{ y: number; w: number; h: number; color: number; alpha?: number }> = [
      { y: foliageBaseY - 2, w: 46, h: 18, color: foliageDark, alpha: 0.95 },
      { y: foliageBaseY - 12, w: 42, h: 22, color: foliageMid },
      { y: foliageBaseY - 24, w: 38, h: 22, color: foliageDark, alpha: 0.95 },
      { y: foliageBaseY - 36, w: 32, h: 22, color: foliageMid },
      { y: foliageBaseY - 48, w: 26, h: 22, color: foliageDark, alpha: 0.95 },
      { y: foliageBaseY - 58, w: 20, h: 18, color: foliageMid },
      { y: foliageBaseY - 66, w: 12, h: 14, color: foliageDark, alpha: 0.95 },
    ];
    for (const ls of layerSpecs) {
      const e = scene.add.ellipse(0, ls.y, ls.w, ls.h, ls.color, ls.alpha ?? 1)
        .setStrokeStyle(1, 0x0c200c, 0.6);
      layers.push(e);
      const hi = scene.add.ellipse(-ls.w * 0.18, ls.y - ls.h * 0.18, ls.w * 0.42, ls.h * 0.34, foliageHi, 0.45);
      layers.push(hi);
    }

    this.container = scene.add.container(x, wy, [
      root, trunk, trunkHi, trunkSh, bark1, bark2, bark3, ...layers,
    ]);
    this.container.setScale(scale);
    this.container.setDepth((i + 0.5 + j + 0.5) * TILE_H + 0.1);
  }

  destroy(): void {
    this.shadow.destroy();
    this.container.destroy();
  }
}
