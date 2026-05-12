import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { FishKind } from "../shared/protocol";

export class Fish {
  scene: Phaser.Scene;
  id: string;
  kind: FishKind;
  gx: number;
  gy: number;
  targetGx: number;
  targetGy: number;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  private body: Phaser.GameObjects.GameObject;
  private tail: Phaser.GameObjects.GameObject;
  private extras: Phaser.GameObjects.GameObject[] = [];
  private facing: 1 | -1 = 1;

  constructor(scene: Phaser.Scene, id: string, gx: number, gy: number, kind: FishKind = "small") {
    this.scene = scene;
    this.id = id;
    this.kind = kind;
    this.gx = gx;
    this.gy = gy;
    this.targetGx = gx;
    this.targetGy = gy;

    const { x, y } = gridToScreen(gx, gy);

    if (kind === "whale") {
      this.shadow = scene.add.ellipse(x, y + TILE_H / 2 + 1, 38, 12, 0x081826, 0.5);
    } else if (kind === "shark") {
      this.shadow = scene.add.ellipse(x, y + TILE_H / 2 + 1, 22, 7, 0x0c1e30, 0.5);
    } else {
      this.shadow = scene.add.ellipse(x, y + TILE_H / 2 + 1, 12, 4, 0x10283c, 0.45);
    }
    this.shadow.setDepth((gx + gy) * TILE_H - 0.5);

    const parts: Phaser.GameObjects.GameObject[] = [];

    if (kind === "whale") {
      const bodyColor = 0x394a5e;
      const bellyColor = 0xb6c2d0;
      const dark = 0x1a2331;
      this.tail = scene.add.triangle(16, 0, 0, 0, 7, -5, 7, 5, dark).setStrokeStyle(0.5, 0x0c1118);
      this.body = scene.add.ellipse(0, 0, 34, 11, bodyColor).setStrokeStyle(0.8, dark);
      const belly = scene.add.ellipse(0, 1.5, 28, 5, bellyColor, 0.7);
      const fin = scene.add.triangle(2, -5, -3, 4, 3, 4, 0, -4, dark);
      const eye = scene.add.circle(-11, -1, 0.9, 0x101010);
      const spout = scene.add.circle(-6, -6, 0.9, 0xffffff, 0.0);
      this.extras.push(belly, fin, eye, spout);
      parts.push(this.tail, this.body, belly, fin, eye, spout);
    } else if (kind === "shark") {
      const bodyColor = 0x6a7a88;
      const bellyColor = 0xd6dde2;
      const dark = 0x2a3340;
      this.tail = scene.add.triangle(11, 0, 0, -1, 5, -6, 5, 6, bodyColor).setStrokeStyle(0.6, dark);
      this.body = scene.add.ellipse(0, 0, 22, 6, bodyColor).setStrokeStyle(0.7, dark);
      const belly = scene.add.ellipse(0, 1.2, 18, 2.6, bellyColor, 0.6);
      const dorsal = scene.add.triangle(0, -3, -3, 1, 3, 1, 0, -4, dark);
      const eye = scene.add.circle(-7, -0.6, 0.7, 0x101010);
      const gills = scene.add.rectangle(-3.5, 0.3, 0.5, 2, dark, 0.6);
      this.extras.push(belly, dorsal, eye, gills);
      parts.push(this.tail, this.body, belly, dorsal, eye, gills);
    } else {
      const seed = (Math.floor(gx) * 67 + Math.floor(gy) * 29) >>> 0;
      const tone = (seed >> 3) & 0x3;
      const bodyColor =
        tone === 0 ? 0xc8b65a : tone === 1 ? 0x9aa8b8 : tone === 2 ? 0xc28a4a : 0xb0c0d0;
      const finColor = bodyColor === 0xc8b65a ? 0x6a5a20 : 0x4a5a72;
      this.body = scene.add.ellipse(0, 0, 10, 4, bodyColor).setStrokeStyle(0.6, 0x1c2a3a, 0.6);
      this.tail = scene.add.triangle(6, 0, 0, 0, 4, -3, 4, 3, finColor);
      const eye = scene.add.circle(-3, -0.5, 0.7, 0x101010);
      const hi = scene.add.ellipse(-1, -1, 4, 1.2, 0xffffff, 0.4);
      this.extras.push(eye, hi);
      parts.push(this.tail, this.body, eye, hi);
    }

    this.container = scene.add.container(x, y + TILE_H / 2, parts);
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
    this.container.scaleX = f;
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
