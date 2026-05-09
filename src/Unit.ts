import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { PlayerId, UnitSnapshot } from "../shared/protocol";

function shade(color: number, factor: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

export class Unit {
  scene: Phaser.Scene;
  id: string;
  owner: PlayerId;
  color: number;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Ellipse;
  head: Phaser.GameObjects.Arc;
  shadow: Phaser.GameObjects.Ellipse;
  selectionRing: Phaser.GameObjects.Ellipse;
  ownerRing: Phaser.GameObjects.Ellipse;
  gx: number;
  gy: number;
  targetGx: number;
  targetGy: number;
  selected = false;
  state: UnitSnapshot["state"] = "idle";

  private bobPhase: number;
  private harvestSwingTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, snap: UnitSnapshot, isLocal: boolean) {
    this.scene = scene;
    this.id = snap.id;
    this.owner = snap.owner;
    this.color = snap.color;
    this.gx = snap.gx;
    this.gy = snap.gy;
    this.targetGx = snap.gx;
    this.targetGy = snap.gy;
    this.bobPhase = Math.random() * Math.PI * 2;
    const { x, y } = gridToScreen(this.gx, this.gy);

    this.shadow = scene.add.ellipse(0, 1, 22, 9, 0x000000, 0.4);

    this.ownerRing = scene.add
      .ellipse(0, 0, 30, 14, isLocal ? 0xffffff : 0xff3333, 0)
      .setStrokeStyle(1.5, isLocal ? 0xffffff : 0xff3333, 0.7);

    this.selectionRing = scene.add
      .ellipse(0, 0, 36, 18, 0x00ff66, 0)
      .setStrokeStyle(2, 0x00ff66);
    this.selectionRing.setVisible(false);

    const dark = shade(snap.color, 0.7);
    const light = shade(snap.color, 1.25);

    const bodyShadow = scene.add.ellipse(1, -12, 16, 20, dark, 0.6);
    this.body = scene.add.ellipse(0, -13, 16, 20, snap.color).setStrokeStyle(1.5, 0x141414);
    const bodyHighlight = scene.add.ellipse(-3, -16, 6, 9, light, 0.85);

    this.head = scene.add.circle(0, -26, 6, 0xf3c79a).setStrokeStyle(1.5, 0x141414);
    const hair = scene.add.arc(0, -28, 6, 200, 340, false, 0x3a2410);

    this.container = scene.add.container(x, y, [
      this.shadow,
      this.ownerRing,
      this.selectionRing,
      bodyShadow,
      this.body,
      bodyHighlight,
      this.head,
      hair,
    ]);
    this.container.setSize(28, 36);
    this.container.setInteractive(
      new Phaser.Geom.Rectangle(-14, -32, 28, 36),
      Phaser.Geom.Rectangle.Contains,
    );
    this.updateDepth();
  }

  setSelected(v: boolean): void {
    this.selected = v;
    this.selectionRing.setVisible(v);
    if (v) {
      this.scene.tweens.killTweensOf(this.selectionRing);
      this.selectionRing.setScale(1);
      this.scene.tweens.add({
        targets: this.selectionRing,
        scaleX: 1.15,
        scaleY: 1.15,
        alpha: 0.6,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    } else {
      this.scene.tweens.killTweensOf(this.selectionRing);
      this.selectionRing.setScale(1);
      this.selectionRing.setAlpha(1);
    }
  }

  applySnapshot(snap: UnitSnapshot): void {
    this.targetGx = snap.gx;
    this.targetGy = snap.gy;
    if (this.state !== snap.state) {
      this.state = snap.state;
      this.updateStateAnim();
    }
  }

  update(dtSec: number): void {
    const lerp = 1 - Math.pow(0.001, dtSec * 4);
    this.gx += (this.targetGx - this.gx) * lerp;
    this.gy += (this.targetGy - this.gy) * lerp;

    const { x, y } = gridToScreen(this.gx, this.gy);
    this.bobPhase += dtSec * (this.state === "moving" ? 11 : 3);
    const bob = this.state === "moving" ? Math.sin(this.bobPhase) * 1.2 : 0;
    this.container.setPosition(x, y + bob);
    this.shadow.setScale(1, 1 - Math.abs(bob) * 0.04);
    this.updateDepth();
  }

  destroy(): void {
    this.harvestSwingTween?.stop();
    this.container.destroy();
  }

  private updateStateAnim(): void {
    if (this.state === "harvesting") {
      this.harvestSwingTween?.stop();
      this.body.setAngle(0);
      this.head.setAngle(0);
      this.harvestSwingTween = this.scene.tweens.add({
        targets: [this.body, this.head],
        angle: { from: -10, to: 10 },
        duration: 220,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    } else {
      this.harvestSwingTween?.stop();
      this.harvestSwingTween = null;
      this.body.setAngle(0);
      this.head.setAngle(0);
    }
  }

  private updateDepth(): void {
    this.container.setDepth((this.gx + this.gy) * TILE_H);
  }
}
