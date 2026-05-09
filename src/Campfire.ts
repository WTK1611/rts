import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { groundHeight } from "../shared/worldgen";

export class Campfire {
  scene: Phaser.Scene;
  id: string;
  gx: number;
  gy: number;
  fuel = 1;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  glow: Phaser.GameObjects.Ellipse;
  flame1: Phaser.GameObjects.Ellipse;
  flame2: Phaser.GameObjects.Ellipse;
  ember: Phaser.GameObjects.Ellipse;
  private phase = Math.random() * Math.PI * 2;
  private worldSeed: number;

  constructor(
    scene: Phaser.Scene,
    id: string,
    gx: number,
    gy: number,
    fuel: number,
    worldSeed: number,
  ) {
    this.scene = scene;
    this.id = id;
    this.gx = gx;
    this.gy = gy;
    this.fuel = fuel;
    this.worldSeed = worldSeed;

    const { x, y } = gridToScreen(gx, gy);
    const h = groundHeight(worldSeed, gx, gy);
    const wy = y - h;

    this.shadow = scene.add.ellipse(x, wy + 1, 18, 7, 0x000000, 0.4);
    this.shadow.setDepth((gx + gy) * TILE_H - 0.5);

    this.glow = scene.add.ellipse(0, -1, 26, 13, 0xff8a3a, 0.25);
    const log1 = scene.add.rectangle(-4, 0, 12, 3, 0x4a2e1a)
      .setStrokeStyle(0.6, 0x2a1a0e, 0.8);
    (log1 as Phaser.GameObjects.Rectangle).setRotation(0.25);
    const log2 = scene.add.rectangle(4, 0, 12, 3, 0x5a3a22)
      .setStrokeStyle(0.6, 0x2a1a0e, 0.8);
    (log2 as Phaser.GameObjects.Rectangle).setRotation(-0.25);
    const stones = scene.add.ellipse(0, 1, 14, 4, 0x6a6a6a, 0.9)
      .setStrokeStyle(0.5, 0x3a3a3a, 0.8);

    this.flame1 = scene.add.ellipse(0, -5, 7, 11, 0xffb24d, 0.95);
    this.flame2 = scene.add.ellipse(0, -7, 4, 7, 0xffe9a0, 1);
    this.ember = scene.add.ellipse(0, -2, 6, 3, 0xff5a1a, 0.85);

    this.container = scene.add.container(x, wy, [
      this.glow,
      stones,
      log1,
      log2,
      this.ember,
      this.flame1,
      this.flame2,
    ]);
    this.container.setDepth((gx + gy) * TILE_H);
  }

  applyState(gx: number, gy: number, fuel: number): void {
    if (this.gx !== gx || this.gy !== gy) {
      this.gx = gx;
      this.gy = gy;
      const { x, y } = gridToScreen(gx, gy);
      const h = groundHeight(this.worldSeed, gx, gy);
      const wy = y - h;
      this.container.setPosition(x, wy);
      this.shadow.setPosition(x, wy + 1);
      this.shadow.setDepth((gx + gy) * TILE_H - 0.5);
      this.container.setDepth((gx + gy) * TILE_H);
    }
    this.fuel = fuel;
  }

  update(dt: number): void {
    this.phase += dt * 9;
    const flicker = 0.85 + Math.sin(this.phase) * 0.1 + Math.sin(this.phase * 1.7) * 0.05;
    const dim = 0.5 + this.fuel * 0.5;
    this.flame1.setScale(flicker * dim, flicker * dim);
    this.flame2.setScale((1.05 - (flicker - 0.85) * 0.5) * dim, flicker * dim);
    this.ember.setAlpha(0.6 + (1 - flicker) * 0.4);
    this.glow.setAlpha((0.18 + (flicker - 0.85) * 0.4) * dim);
  }

  remove(): void {
    this.shadow.destroy();
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      scale: 0.4,
      duration: 350,
      ease: "Cubic.easeIn",
      onComplete: () => this.container.destroy(),
    });
  }
}
