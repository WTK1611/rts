import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { HuntWeapon, PlayerId, UnitGender, UnitSnapshot } from "../shared/protocol";
import { groundHeight } from "../shared/worldgen";

function shade(color: number, factor: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

const CHILD_AGE_SEC = 240;
const OLD_THRESHOLD_SEC = 720;
const MAX_AGE_SEC = 960;
const HAIR_BASE_COLOR = 0x3a2410;
const HAIR_GRAY_COLOR = 0x888888;
const HAIR_WHITE_COLOR = 0xf2f2f2;

export class Unit {
  scene: Phaser.Scene;
  id: string;
  owner: PlayerId;
  color: number;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Shape;
  head: Phaser.GameObjects.Arc;
  hair: Phaser.GameObjects.Arc;
  hairBack: Phaser.GameObjects.Ellipse | null = null;
  beard: Phaser.GameObjects.Ellipse | null = null;
  crown: Phaser.GameObjects.Graphics;
  bodyShadow: Phaser.GameObjects.Shape;
  bodyHighlight: Phaser.GameObjects.Ellipse;
  shadow: Phaser.GameObjects.Ellipse;
  ownerRing: Phaser.GameObjects.Ellipse;
  gx: number;
  gy: number;
  targetGx: number;
  targetGy: number;
  private srcGx: number;
  private srcGy: number;
  private snapElapsed = 0;
  private static readonly SNAP_DURATION = 0.07;
  state: UnitSnapshot["state"] = "idle";
  worldSeed: number;
  hp: number;
  hpMax: number;
  ageSec: number;
  gender: UnitGender;
  firstName: string;
  isChief: boolean;

  private bobPhase: number;
  private harvestSwingTween: Phaser.Tweens.Tween | null = null;
  private huntSwingTween: Phaser.Tweens.Tween | null = null;
  private huntStrikeEvent: Phaser.Time.TimerEvent | null = null;
  private weaponGfx: Phaser.GameObjects.Graphics | null = null;
  private huntWeapon: HuntWeapon | null = null;
  private huntFacing: 1 | -1 = 1;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFill: Phaser.GameObjects.Rectangle;
  private nameLabel: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, snap: UnitSnapshot, isLocal: boolean, worldSeed: number) {
    this.scene = scene;
    this.id = snap.id;
    this.owner = snap.owner;
    this.color = snap.color;
    this.gx = snap.gx;
    this.gy = snap.gy;
    this.targetGx = snap.gx;
    this.targetGy = snap.gy;
    this.srcGx = snap.gx;
    this.srcGy = snap.gy;
    this.worldSeed = worldSeed;
    this.hp = snap.hp;
    this.hpMax = snap.hpMax;
    this.ageSec = snap.ageSec;
    this.gender = snap.gender;
    this.firstName = snap.firstName;
    this.isChief = snap.isChief;
    this.bobPhase = Math.random() * Math.PI * 2;
    const { x, y } = gridToScreen(this.gx, this.gy);
    const h = groundHeight(worldSeed, this.gx, this.gy);

    this.shadow = scene.add.ellipse(0, 1, 22, 9, 0x000000, 0.4);

    this.ownerRing = scene.add
      .ellipse(0, 0, 30, 14, isLocal ? 0xffffff : 0xff3333, 0)
      .setStrokeStyle(1.5, isLocal ? 0xffffff : 0xff3333, 0.7);

    const dark = shade(snap.color, 0.7);
    const light = shade(snap.color, 1.25);

    const isFemale = snap.gender === "f";
    if (isFemale) {
      this.bodyShadow = scene.add.ellipse(1, -13, 12, 22, dark, 0.6);
      this.body = scene.add.ellipse(0, -14, 12, 22, snap.color)
        .setStrokeStyle(1.5, 0x141414);
      this.bodyHighlight = scene.add.ellipse(-2, -19, 4, 7, light, 0.85);
    } else {
      const vPoints = [-10, -10, 10, -10, 5, 10, -5, 10];
      this.bodyShadow = scene.add.polygon(1, -12, vPoints, dark, 0.6);
      this.body = scene.add.polygon(0, -13, vPoints, snap.color)
        .setStrokeStyle(1.5, 0x141414);
      this.bodyHighlight = scene.add.ellipse(-3, -18, 6, 8, light, 0.85);
    }

    if (isFemale) {
      this.hairBack = scene.add.ellipse(0, -18, 14, 16, HAIR_BASE_COLOR);
    }

    this.head = scene.add.circle(0, -26, 6, 0xf3c79a).setStrokeStyle(1.5, 0x141414);
    if (isFemale) {
      this.hair = scene.add.arc(0, -27, 7, 180, 360, false, HAIR_BASE_COLOR);
    } else {
      this.hair = scene.add.arc(0, -28, 6, 200, 340, false, HAIR_BASE_COLOR);
      this.beard = scene.add.ellipse(0, -22, 7, 3, HAIR_BASE_COLOR);
    }

    this.crown = scene.add.graphics({ x: 0, y: 0 });
    this.drawCrown();
    this.crown.setVisible(snap.isChief);

    this.hpBarBg = scene.add.rectangle(0, -38, 18, 3, 0x000000, 0.7)
      .setStrokeStyle(0.5, 0x000000, 0.9);
    this.hpBarFill = scene.add.rectangle(-9, -38, 18, 3, 0x4ed44e)
      .setOrigin(0, 0.5);

    this.nameLabel = scene.add
      .text(0, -46, snap.firstName, {
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: "10px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
        align: "center",
      })
      .setOrigin(0.5, 1);

    const layers: Phaser.GameObjects.GameObject[] = [
      this.shadow,
      this.ownerRing,
      this.bodyShadow,
      this.body,
      this.bodyHighlight,
    ];
    if (this.hairBack) layers.push(this.hairBack);
    layers.push(this.head, this.hair);
    if (this.beard) layers.push(this.beard);
    layers.push(this.crown);
    layers.push(this.hpBarBg, this.hpBarFill, this.nameLabel);
    this.container = scene.add.container(x, y - h, layers);
    this.refreshHpBar();
    this.applyLifeCycleVisuals();
    this.container.setSize(28, 36);
    this.container.setInteractive(
      new Phaser.Geom.Rectangle(-14, -32, 28, 36),
      Phaser.Geom.Rectangle.Contains,
    );
    this.updateDepth();
  }

  applySnapshot(snap: UnitSnapshot, isLocal: boolean): void {
    this.srcGx = this.gx;
    this.srcGy = this.gy;
    this.targetGx = snap.gx;
    this.targetGy = snap.gy;
    this.snapElapsed = 0;
    if (this.owner !== snap.owner || this.color !== snap.color) {
      this.owner = snap.owner;
      this.color = snap.color;
      this.refreshOwnerVisuals(isLocal);
    }
    const newWeapon = snap.huntWeapon ?? null;
    const newFacing = snap.huntFacing ?? this.huntFacing;
    const stateChanged = this.state !== snap.state;
    const weaponChanged = this.huntWeapon !== newWeapon;
    const facingChanged = this.huntFacing !== newFacing;
    if (stateChanged) this.state = snap.state;
    this.huntWeapon = newWeapon;
    this.huntFacing = newFacing;
    if (stateChanged || weaponChanged || facingChanged) {
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
    if (this.isChief !== snap.isChief) {
      this.isChief = snap.isChief;
      this.crown.setVisible(snap.isChief);
    }
  }

  private drawCrown(): void {
    const g = this.crown;
    g.clear();
    g.fillStyle(0xf4c430, 1);
    g.lineStyle(1, 0x141414, 1);
    g.beginPath();
    g.moveTo(-5, -30);
    g.lineTo(-5, -32);
    g.lineTo(-3.5, -36);
    g.lineTo(-1.5, -32);
    g.lineTo(0, -37);
    g.lineTo(1.5, -32);
    g.lineTo(3.5, -36);
    g.lineTo(5, -32);
    g.lineTo(5, -30);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.fillStyle(0xff5050, 1);
    g.fillCircle(0, -33.5, 0.9);
  }

  private refreshOwnerVisuals(isLocal: boolean): void {
    const dark = shade(this.color, 0.7);
    const light = shade(this.color, 1.25);
    this.body.setFillStyle(this.color);
    this.bodyShadow.setFillStyle(dark, 0.6);
    this.bodyHighlight.setFillStyle(light, 0.85);
    const ringColor = isLocal ? 0xffffff : 0xff3333;
    this.ownerRing.setStrokeStyle(1.5, ringColor, 0.7);
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
    const fatness = 0.55 + 0.55 * hpFrac;
    this.body.setScale(fatness, 1);
    this.bodyShadow.setScale(fatness, 1);
    this.bodyHighlight.setScale(fatness, 1);
    this.container.setScale(scale);
    if (this.state !== "harvesting" && this.state !== "hunting") {
      this.body.setAngle(lean);
      this.head.setAngle(lean);
      this.hair.setAngle(lean);
      this.hairBack?.setAngle(lean);
      this.beard?.setAngle(lean);
    }
    let hairColor = HAIR_BASE_COLOR;
    if (age > OLD_THRESHOLD_SEC) {
      const t = Math.min(1, (age - OLD_THRESHOLD_SEC) / (MAX_AGE_SEC - OLD_THRESHOLD_SEC));
      if (t < 0.5) {
        hairColor = lerpColor(HAIR_BASE_COLOR, HAIR_GRAY_COLOR, t / 0.5);
      } else {
        hairColor = lerpColor(HAIR_GRAY_COLOR, HAIR_WHITE_COLOR, (t - 0.5) / 0.5);
      }
    }
    this.hair.setFillStyle(hairColor);
    this.hairBack?.setFillStyle(hairColor);
    this.beard?.setFillStyle(hairColor);
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
    this.snapElapsed += dtSec;
    const t = Math.min(1, this.snapElapsed / Unit.SNAP_DURATION);
    this.gx = this.srcGx + (this.targetGx - this.srcGx) * t;
    this.gy = this.srcGy + (this.targetGy - this.srcGy) * t;

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
    this.huntSwingTween?.stop();
    this.huntStrikeEvent?.remove(false);
    this.container.destroy();
  }

  die(onComplete: () => void): void {
    this.harvestSwingTween?.stop();
    this.harvestSwingTween = null;
    this.huntSwingTween?.stop();
    this.huntSwingTween = null;
    this.huntStrikeEvent?.remove(false);
    this.huntStrikeEvent = null;
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
      this.stopHuntAnim();
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
    } else if (this.state === "hunting") {
      this.harvestSwingTween?.stop();
      this.harvestSwingTween = null;
      this.startHuntAnim();
    } else {
      this.harvestSwingTween?.stop();
      this.harvestSwingTween = null;
      this.stopHuntAnim();
      this.body.setAngle(0);
      this.head.setAngle(0);
      this.applyLifeCycleVisuals();
    }
  }

  private ensureWeaponGfx(): Phaser.GameObjects.Graphics {
    if (!this.weaponGfx) {
      this.weaponGfx = this.scene.add.graphics({ x: 0, y: 0 });
      const idx = this.container.list.indexOf(this.crown);
      if (idx >= 0) this.container.addAt(this.weaponGfx, idx);
      else this.container.add(this.weaponGfx);
    }
    return this.weaponGfx;
  }

  private drawWeapon(weapon: HuntWeapon): void {
    const g = this.ensureWeaponGfx();
    g.clear();
    if (weapon === "spear") {
      g.fillStyle(0x6e4a24, 1);
      g.lineStyle(0.5, 0x2a1a0a, 1);
      g.fillRect(0, -1, 16, 1.6);
      g.strokeRect(0, -1, 16, 1.6);
      g.fillStyle(0xc8c2b8, 1);
      g.fillTriangle(15, -2.8, 15, 1.4, 20, -0.7);
      g.lineStyle(0.5, 0x2a2a2a, 1);
      g.strokeTriangle(15, -2.8, 15, 1.4, 20, -0.7);
    } else if (weapon === "club") {
      g.fillStyle(0x5a3a1c, 1);
      g.lineStyle(0.5, 0x2a1a0a, 1);
      g.fillRect(0, -1.2, 9, 1.8);
      g.strokeRect(0, -1.2, 9, 1.8);
      g.fillStyle(0x4a2f16, 1);
      g.fillRoundedRect(7, -2.6, 6, 4.6, 1.8);
      g.lineStyle(0.5, 0x2a1a0a, 1);
      g.strokeRoundedRect(7, -2.6, 6, 4.6, 1.8);
    }
  }

  private startHuntAnim(): void {
    this.stopHuntAnim();
    const weapon = this.huntWeapon ?? "fists";
    const facing = this.huntFacing;
    if (this.weaponGfx) {
      this.weaponGfx.clear();
      this.weaponGfx.setVisible(false);
    }
    if (weapon === "fists") {
      this.body.setAngle(0);
      this.head.setAngle(0);
      this.huntSwingTween = this.scene.tweens.add({
        targets: [this.body, this.head],
        angle: { from: -16 * facing, to: 16 * facing },
        duration: 180,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    } else if (weapon === "club") {
      const g = this.ensureWeaponGfx();
      this.drawWeapon("club");
      g.setVisible(true);
      g.setPosition(2 * facing, -14);
      g.setScale(facing, 1);
      g.setAngle(-70 * facing);
      this.body.setAngle(0);
      this.head.setAngle(0);
      this.huntSwingTween = this.scene.tweens.add({
        targets: g,
        angle: { from: -70 * facing, to: 50 * facing },
        duration: 240,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    } else if (weapon === "spear") {
      const g = this.ensureWeaponGfx();
      this.drawWeapon("spear");
      g.setVisible(true);
      g.setScale(facing, 1);
      g.setAngle(0);
      g.setPosition(2 * facing, -14);
      this.body.setAngle(0);
      this.head.setAngle(0);
      const baseX = 2 * facing;
      this.huntSwingTween = this.scene.tweens.add({
        targets: g,
        x: { from: baseX, to: baseX + 8 * facing },
        duration: 200,
        yoyo: true,
        repeat: -1,
        ease: "Cubic.easeOut",
      });
    } else if (weapon === "stones") {
      this.body.setAngle(0);
      this.head.setAngle(0);
      this.huntSwingTween = this.scene.tweens.add({
        targets: [this.body, this.head],
        angle: { from: -8 * facing, to: 14 * facing },
        duration: 320,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.scheduleStoneThrows();
    }
  }

  private scheduleStoneThrows(): void {
    this.huntStrikeEvent?.remove(false);
    this.spawnStoneProjectile();
    this.huntStrikeEvent = this.scene.time.addEvent({
      delay: 900,
      loop: true,
      callback: () => this.spawnStoneProjectile(),
    });
  }

  private spawnStoneProjectile(): void {
    if (this.state !== "hunting" || this.huntWeapon !== "stones") return;
    const facing = this.huntFacing;
    const startX = this.container.x + 3 * facing;
    const startY = this.container.y - 16;
    const endX = startX + 32 * facing;
    const endY = startY + 4;
    const peakY = startY - 18;
    const stone = this.scene.add.circle(startX, startY, 1.8, 0x8a8580)
      .setStrokeStyle(0.5, 0x3a3833)
      .setDepth(this.container.depth + 1);
    this.scene.tweens.add({
      targets: stone,
      x: endX,
      duration: 380,
      ease: "Linear",
    });
    this.scene.tweens.add({
      targets: stone,
      y: { from: startY, to: peakY },
      duration: 190,
      ease: "Sine.easeOut",
      yoyo: false,
      onComplete: () => {
        this.scene.tweens.add({
          targets: stone,
          y: endY,
          duration: 190,
          ease: "Sine.easeIn",
          onComplete: () => stone.destroy(),
        });
      },
    });
  }

  private stopHuntAnim(): void {
    this.huntSwingTween?.stop();
    this.huntSwingTween = null;
    this.huntStrikeEvent?.remove(false);
    this.huntStrikeEvent = null;
    if (this.weaponGfx) {
      this.weaponGfx.clear();
      this.weaponGfx.setVisible(false);
      this.weaponGfx.setAngle(0);
      this.weaponGfx.setPosition(0, 0);
      this.weaponGfx.setScale(1, 1);
    }
  }

  private updateDepth(): void {
    this.container.setDepth((this.gx + this.gy) * TILE_H);
  }
}
