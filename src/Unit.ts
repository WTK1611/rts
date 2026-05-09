import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";

export class Unit {
  scene: Phaser.Scene;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Ellipse;
  selectionRing: Phaser.GameObjects.Ellipse;
  gx: number;
  gy: number;
  targetGx: number;
  targetGy: number;
  speed = 3;
  selected = false;

  constructor(scene: Phaser.Scene, gx: number, gy: number, color = 0x4ea1ff) {
    this.scene = scene;
    this.gx = gx;
    this.gy = gy;
    this.targetGx = gx;
    this.targetGy = gy;

    const { x, y } = gridToScreen(gx, gy);

    this.selectionRing = scene.add.ellipse(0, 0, 40, 20, 0x00ff66, 0).setStrokeStyle(2, 0x00ff66);
    this.selectionRing.setVisible(false);

    this.body = scene.add.ellipse(0, -14, 18, 22, color).setStrokeStyle(2, 0x000000);

    this.container = scene.add.container(x, y, [this.selectionRing, this.body]);
    this.container.setSize(28, 36);
    this.container.setInteractive(
      new Phaser.Geom.Rectangle(-14, -32, 28, 36),
      Phaser.Geom.Rectangle.Contains,
    );
    this.updateDepth();
  }

  setSelected(v: boolean) {
    this.selected = v;
    this.selectionRing.setVisible(v);
  }

  moveTo(gx: number, gy: number) {
    this.targetGx = gx;
    this.targetGy = gy;
  }

  update(dtSec: number) {
    const dx = this.targetGx - this.gx;
    const dy = this.targetGy - this.gy;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01) return;

    const step = Math.min(this.speed * dtSec, dist);
    this.gx += (dx / dist) * step;
    this.gy += (dy / dist) * step;

    const { x, y } = gridToScreen(this.gx, this.gy);
    this.container.setPosition(x, y);
    this.updateDepth();
  }

  private updateDepth() {
    this.container.setDepth((this.gx + this.gy) * TILE_H);
  }
}
