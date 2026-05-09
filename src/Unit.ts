import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { PlayerId, UnitSnapshot } from "../shared/protocol";
import { groundHeight } from "../shared/worldgen";

function shade(color: number, factor: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

const CHILD_AGE_SEC = 60;
const OLD_THRESHOLD_SEC = 360;
const MAX_AGE_SEC = 420;

export class Unit {
  scene: Phaser.Scene;
  id: string;
  owner: PlayerId;
  color: number;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Ellipse;
  head: Phaser.GameObjects.Arc;
  hair: Phaser.GameObjects.Arc;
  bodyShadow: Phaser.GameObjects.Ellipse;
  bodyHighlight: Phaser.GameObjects.Ellipse;
  shadow: Phaser.GameObjects.Ellipse;
  selectionRing: Phaser.GameObjects.Ellipse;
  ownerRing: Phaser.GameObjects.Ellipse;
  gx: number;
  gy: number;
  targetGx: number;
  targetGy: number;
  selected = false;
  state: UnitSnapshot["state"] = "idle";
  worldSeed: number;
  hp: number;
  hpMax: number;
  ageSec: number;

  private bobPhase: number;
  private harvestSwingTween: Phaser.Tweens.Tween | null = null;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, snap: UnitSnapshot, isLocal: boolean, worldSeed: number) {
    this.scene = scene;
    this.id = snap.id;
    this.owner = snap.owner;
    this.color = snap.color;
    this.gx = snap.gx;
    this.gy = snap.gy;
    this.targetGx = snap.gx;
    this.targetGy = snap.gy;
    this.worldSeed = worldSeed;
    this.hp = snap.hp;
    this.hpMax = snap.hpMax;
    this.ageSec = snap.ageSec;
    this.bobPhase = Math.random() * Math.PI * 2;
    const { x, y } = gridToScreen(this.gx, this.gy);
    const h = groundHeight(worldSeed, this.gx, this.gy);

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

    this.bodyShadow = scene.add.ellipse(1, -12, 16, 20, dark, 0.6);
    this.body = scene.add.ellipse(0, -13, 16, 20, snap.color).setStrokeStyle(1.5, 0x141414);
    this.bodyHighlight = scene.add.ellipse(-3, -16, 6, 9, light, 0.85);

    this.head = scene.add.circle(0, -26, 6, 0xf3c79a).setStrokeStyle(1.5, 0x141414);
    this.hair = scene.add.arc(0, -28, 6, 200, 340, false, 0x3a2410);

    this.hpBarBg = scene.add.rectangle(0, -38, 18, 3, 0x000000, 0.7)
      .setStrokeStyle(0.5, 0x000000, 0.9);
    this.hpBarFill = scene.add.rectangle(-9, -38, 18, 3, 0x4ed44e)
      .setOrigin(0, 0.5);

    this.container = scene.add.container(x, y - h, [
      this.shadow,
      this.ownerRing,
      this.selectionRing,
      this.bodyShadow,
      this.body,
      this.bodyHighlight,
      this.head,
      this.hair,
      this.hpBarBg,
      this.hpBarFill,
    ]);
    this.refreshHpBar();
    this.applyLifeCycleVisuals();
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
    const hpChanged = this.hp !== snap.hp || this.hpMax !== snap.hpMax;
    if (hpChanged) {
      this.hp = snap.hp;
      this.hpMax = snap.hpMax;
      this.refreshHpBar();
    }
    if (hpChanged || this.ageSec !== snap.ageSec) {
      this.ageSec = snap.ageSec;
      this.applyLifeCycleVisuals();
    }
  }

  private applyLifeCycleVisuals(): void {
    const age = this.ageSec;
    let scale: number;
    let lean: number;
    if (age < CHILD_AGE_SEC) {
      const t = Math.max(0, age / CHILD_AGE_SEC);
      scale = 0.55 + 0.45 * t;
      lean = 0;
    } else if (age < OLD_THRESHOLD_SEC) {
      scale = 1.0;
      lean = 0;
    } else {
      const t = Math.min(1, (age - OLD_THRESHOLD_SEC) / (MAX_AGE_SEC - OLD_THRESHOLD_SEC));
      scale = 1.0 - 0.18 * t;
      lean = 8 * t;
    }
    const hpFrac = this.hpMax > 0 ? Math.max(0, Math.min(1, this.hp / this.hpMax)) : 0;
    const fatness = 0.78 + 0.34 * hpFrac;
    this.body.setScale(fatness, 1);
    this.bodyShadow.setScale(fatness, 1);
    this.bodyHighlight.setScale(fatness, 1);
    this.container.setScale(scale);
    if (this.state !== "harvesting") {
      this.body.setAngle(lean);
      this.head.setAngle(lean);
      this.hair.setAngle(lean);
    }
    const hairAlpha = age > OLD_THRESHOLD_SEC
      ? 0.4 + 0.6 * (1 - Math.min(1, (age - OLD_THRESHOLD_SEC) / (MAX_AGE_SEC - OLD_THRESHOLD_SEC)))
      : 1;
    this.hair.setAlpha(hairAlpha);
  }

  private refreshHpBar(): void {
    const frac = this.hpMax > 0 ? Math.max(0, Math.min(1, this.hp / this.hpMax)) : 0;
    this.hpBarFill.width = 18 * frac;
    let color = 0x4ed44e;
    if (frac < 0.33) color = 0xff5050;
    else if (frac < 0.66) color = 0xf0c040;
    this.hpBarFill.fillColor = color;
  }

  update(dtSec: number): void {
    const lerp = 1 - Math.pow(0.001, dtSec * 4);
    this.gx += (this.targetGx - this.gx) * lerp;
    this.gy += (this.targetGy - this.gy) * lerp;

    const { x, y } = gridToScreen(this.gx, this.gy);
    const h = groundHeight(this.worldSeed, this.gx, this.gy);
    this.bobPhase += dtSec * (this.state === "moving" ? 11 : 3);
    const bob = this.state === "moving" ? Math.sin(this.bobPhase) * 1.2 : 0;
    this.container.setPosition(x, y - h + bob);
    this.shadow.setScale(1, 1 - Math.abs(bob) * 0.04);
    this.updateDepth();
  }

  destroy(): void {
    this.harvestSwingTween?.stop();
    this.container.destroy();
  }

  die(onComplete: () => void): void {
    this.harvestSwingTween?.stop();
    this.harvestSwingTween = null;
    this.scene.tweens.killTweensOf(this.selectionRing);
    this.selectionRing.setVisible(false);
    this.hpBarBg.setVisible(false);
    this.hpBarFill.setVisible(false);
    this.scene.tweens.add({
      targets: this.container,
      angle: 80,
      y: this.container.y + 4,
      duration: 600,
      ease: "Cubic.easeIn",
    });
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      delay: 2200,
      duration: 1200,
      ease: "Cubic.easeIn",
      onComplete: () => {
        this.container.destroy();
        onComplete();
      },
    });
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
      this.applyLifeCycleVisuals();
    }
  }

  private updateDepth(): void {
    this.container.setDepth((this.gx + this.gy) * TILE_H);
  }
}
