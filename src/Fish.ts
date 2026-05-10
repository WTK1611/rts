import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";

export class Fish {
  scene: Phaser.Scene;
  id: string;
  gx: number;
  gy: number;
  targetGx: number;
  targetGy: number;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  private body: Phaser.GameObjects.Ellipse;
  private tail: Phaser.GameObjects.Triangle;
  private eye: Phaser.GameObjects.Arc;
  private hi: Phaser.GameObjects.Ellipse;
  private facing: 1 | -1 = 1;

  constructor(scene: Phaser.Scene, id: string, gx: number, gy: number) {
    this.scene = scene;
    this.id = id;
    this.gx = gx;
    this.gy = gy;
    this.targetGx = gx;
    this.targetGy = gy;

    const seed = (Math.floor(gx) * 67 + Math.floor(gy) * 29) >>> 0;
    const tone = (seed >> 3) & 0x3;
    const bodyColor =
      tone === 0 ? 0xc8b65a : tone === 1 ? 0x9aa8b8 : tone === 2 ? 0xc28a4a : 0xb0c0d0;
    const finColor = bodyColor === 0xc8b65a ? 0x6a5a20 : 0x4a5a72;
    const { x, y } = gridToScreen(gx, gy);

    this.shadow = scene.add.ellipse(x, y + TILE_H / 2 + 1, 12, 4, 0x10283c, 0.45);
    this.shadow.setDepth((gx + gy) * TILE_H - 0.5);

    this.body = scene.add.ellipse(0, 0, 10, 4, bodyColor)
      .setStrokeStyle(0.6, 0x1c2a3a, 0.6);
    this.tail = scene.add.triangle(6, 0, 0, 0, 4, -3, 4, 3, finColor);
    this.eye = scene.add.circle(-3, -0.5, 0.7, 0x101010);
    this.hi = scene.add.ellipse(-1, -1, 4, 1.2, 0xffffff, 0.4);

    this.container = scene.add.container(x, y + TILE_H / 2, [
      this.tail, this.body, this.eye, this.hi,
    ]);
    this.container.setDepth((gx + gy) * TILE_H);
  }

  setTarget(gx: number, gy: number): void {
    if (gx > this.targetGx + 0.02) this.setFacing(1);
    else if (gx < this.targetGx - 0.02) this.setFacing(-1);
    this.targetGx = gx;
    this.targetGy = gy;
  }

  private setFacing(f: 1 | -1): void {
    if (this.facing === f) return;
    this.facing = f;
    this.body.scaleX = f;
    this.tail.scaleX = f;
    this.eye.x = -3 * f;
    this.hi.x = -1 * f;
  }

  update(dtSec: number): void {
    const lerp = Math.min(1, dtSec * 6);
    this.gx += (this.targetGx - this.gx) * lerp;
    this.gy += (this.targetGy - this.gy) * lerp;
    const { x, y } = gridToScreen(this.gx, this.gy);
    this.container.x = x;
    this.container.y = y + TILE_H / 2;
    this.container.setDepth((this.gx + this.gy) * TILE_H);
    this.shadow.x = x;
    this.shadow.y = y + TILE_H / 2 + 1;
    this.shadow.setDepth((this.gx + this.gy) * TILE_H - 0.5);
  }

  remove(): void {
    this.shadow.destroy();
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      y: this.container.y + 4,
      duration: 250,
      ease: "Cubic.easeIn",
      onComplete: () => this.container.destroy(),
    });
  }
}
