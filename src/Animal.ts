import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { AnimalKind, AnimalSnapshot } from "../shared/protocol";
import { groundHeight } from "../shared/worldgen";

interface AnimalLook {
  bodyW: number;
  bodyH: number;
  bodyColor: number;
  bellyColor: number;
  legH: number;
  shadowW: number;
  scale: number;
}

const LOOKS: Record<AnimalKind, AnimalLook> = {
  hare:        { bodyW: 9,  bodyH: 5,  bodyColor: 0xa07a52, bellyColor: 0xd6c2a0, legH: 3,  shadowW: 11, scale: 1 },
  reindeer:    { bodyW: 18, bodyH: 9,  bodyColor: 0x6e4f2c, bellyColor: 0x9c7c52, legH: 9,  shadowW: 22, scale: 1 },
  megaloceros: { bodyW: 22, bodyH: 11, bodyColor: 0x5c3a1a, bellyColor: 0x8a6238, legH: 11, shadowW: 28, scale: 1 },
  bison:       { bodyW: 22, bodyH: 13, bodyColor: 0x3a2b1c, bellyColor: 0x4d3a25, legH: 8,  shadowW: 28, scale: 1 },
  caveLion:    { bodyW: 18, bodyH: 8,  bodyColor: 0xc28a48, bellyColor: 0xe6b878, legH: 7,  shadowW: 22, scale: 1 },
  mammoth:     { bodyW: 28, bodyH: 16, bodyColor: 0x4a352a, bellyColor: 0x6a4a35, legH: 12, shadowW: 36, scale: 1 },
  alligator:   { bodyW: 24, bodyH: 6,  bodyColor: 0x3d5a2a, bellyColor: 0x6d8a48, legH: 2,  shadowW: 26, scale: 1 },
};

const KIND_LABELS: Record<AnimalKind, string> = {
  hare: "Hase",
  reindeer: "Rentier",
  megaloceros: "Riesenhirsch",
  bison: "Bison",
  caveLion: "Höhlenlöwe",
  mammoth: "Mamut",
  alligator: "Alligator",
};

export function animalLabel(kind: AnimalKind): string {
  return KIND_LABELS[kind];
}

export class Animal {
  scene: Phaser.Scene;
  id: string;
  kind: AnimalKind;
  gx: number;
  gy: number;
  targetGx: number;
  targetGy: number;
  private srcGx: number;
  private srcGy: number;
  private snapElapsed = 0;
  private static readonly SNAP_DURATION = 0.07;
  hp: number;
  hpMax: number;
  state: AnimalSnapshot["state"];
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFg: Phaser.GameObjects.Rectangle;
  worldSeed: number;
  facing: number = 1;
  maturity: number = 1;
  private bobPhase = Math.random() * Math.PI * 2;

  constructor(scene: Phaser.Scene, snap: AnimalSnapshot, worldSeed: number) {
    this.scene = scene;
    this.id = snap.id;
    this.kind = snap.kind;
    this.gx = snap.gx;
    this.gy = snap.gy;
    this.targetGx = snap.gx;
    this.targetGy = snap.gy;
    this.srcGx = snap.gx;
    this.srcGy = snap.gy;
    this.hp = snap.hp;
    this.hpMax = snap.hpMax;
    this.state = snap.state;
    this.maturity = snap.maturity ?? 1;
    this.worldSeed = worldSeed;

    const look = LOOKS[snap.kind];
    const { x, y } = gridToScreen(this.gx, this.gy);
    const h = groundHeight(worldSeed, this.gx, this.gy);

    this.shadow = scene.add.ellipse(0, 1, look.shadowW, Math.max(4, look.bodyH * 0.45), 0x000000, 0.36);

    const parts: Phaser.GameObjects.GameObject[] = [];
    parts.push(this.shadow);
    parts.push(...this.buildBody(snap.kind, look));

    this.hpBg = scene.add.rectangle(0, -look.bodyH * 1.6 - look.legH - 6, 18, 3, 0x000000, 0.6);
    this.hpFg = scene.add.rectangle(0, -look.bodyH * 1.6 - look.legH - 6, 18, 3, 0xff5050, 1);
    this.hpBg.setVisible(false);
    this.hpFg.setVisible(false);
    parts.push(this.hpBg, this.hpFg);

    this.container = scene.add.container(x, y - h, parts);
    this.updateDepth();
  }

  private buildBody(kind: AnimalKind, look: AnimalLook): Phaser.GameObjects.GameObject[] {
    const out: Phaser.GameObjects.GameObject[] = [];
    const sc = this.scene;
    const legY = -look.legH / 2;
    const bodyY = -look.legH - look.bodyH / 2;
    const dark = shade(look.bodyColor, 0.7);

    if (kind === "hare") {
      out.push(sc.add.ellipse(0, bodyY, look.bodyW, look.bodyH, look.bodyColor).setStrokeStyle(0.8, dark));
      out.push(sc.add.ellipse(0, bodyY + 1, look.bodyW * 0.7, look.bodyH * 0.6, look.bellyColor, 0.7));
      // ears
      out.push(sc.add.ellipse(2, bodyY - 5, 1.6, 5, look.bodyColor).setStrokeStyle(0.5, dark));
      out.push(sc.add.ellipse(-1, bodyY - 5, 1.6, 5, look.bodyColor).setStrokeStyle(0.5, dark));
      // head
      out.push(sc.add.circle(3, bodyY - 1, 2.2, look.bodyColor).setStrokeStyle(0.6, dark));
      // tail
      out.push(sc.add.circle(-look.bodyW * 0.45, bodyY - 0.4, 1.4, 0xffffff, 0.8));
      return out;
    }

    // legs
    for (const ox of [-look.bodyW * 0.35, -look.bodyW * 0.12, look.bodyW * 0.12, look.bodyW * 0.35]) {
      out.push(sc.add.rectangle(ox, legY, 2.2, look.legH, dark));
    }

    // body
    out.push(sc.add.ellipse(0, bodyY, look.bodyW, look.bodyH, look.bodyColor).setStrokeStyle(1, shade(look.bodyColor, 0.5)));
    out.push(sc.add.ellipse(0, bodyY + look.bodyH * 0.18, look.bodyW * 0.85, look.bodyH * 0.55, look.bellyColor, 0.7));

    // head + neck
    const headX = look.bodyW * 0.46;
    const headY = bodyY - look.bodyH * 0.25;
    out.push(sc.add.ellipse(headX, headY, look.bodyH * 0.85, look.bodyH * 0.7, look.bodyColor).setStrokeStyle(0.8, dark));

    if (kind === "reindeer" || kind === "megaloceros") {
      const antlerColor = 0xb89a6a;
      const big = kind === "megaloceros";
      const aw = big ? 12 : 7;
      const ah = big ? 8 : 5;
      // antler: branched palm
      out.push(sc.add.triangle(
        headX + 1, headY - look.bodyH * 0.6,
        -aw / 2, 0,
        aw / 2, 0,
        0, -ah,
        antlerColor,
      ).setStrokeStyle(0.7, 0x6c5230));
      out.push(sc.add.triangle(
        headX - 1, headY - look.bodyH * 0.6,
        -aw / 2, 0,
        aw / 2, 0,
        0, -ah,
        antlerColor,
      ).setStrokeStyle(0.7, 0x6c5230));
      if (big) {
        out.push(sc.add.rectangle(headX + aw * 0.4, headY - look.bodyH * 0.5, 1.2, ah * 0.7, antlerColor));
        out.push(sc.add.rectangle(headX - aw * 0.4, headY - look.bodyH * 0.5, 1.2, ah * 0.7, antlerColor));
      }
    }

    if (kind === "bison") {
      // hump
      out.push(sc.add.ellipse(-look.bodyW * 0.15, bodyY - look.bodyH * 0.45, look.bodyW * 0.5, look.bodyH * 0.7, dark));
      // beard
      out.push(sc.add.rectangle(headX - 1, headY + look.bodyH * 0.15, 4, 4, 0x2a1f12));
      // horns
      out.push(sc.add.circle(headX + 2, headY - 3, 1.3, 0xeae0c8));
      out.push(sc.add.circle(headX - 2, headY - 3, 1.3, 0xeae0c8));
    }

    if (kind === "caveLion") {
      // mane
      out.push(sc.add.circle(headX - 1, headY, look.bodyH * 0.65, shade(look.bodyColor, 0.6)));
      // tail with tuft
      out.push(sc.add.line(0, 0, -look.bodyW * 0.5, bodyY, -look.bodyW * 0.7, bodyY - 2, dark, 1).setLineWidth(1.2));
      out.push(sc.add.circle(-look.bodyW * 0.7, bodyY - 2, 1.3, dark));
    }

    if (kind === "alligator") {
      // long body
      out.push(sc.add.ellipse(0, bodyY, look.bodyW, look.bodyH, look.bodyColor).setStrokeStyle(0.8, dark));
      out.push(sc.add.ellipse(0, bodyY + 1, look.bodyW * 0.85, look.bodyH * 0.55, look.bellyColor, 0.7));
      // back ridge / scales
      for (const ox of [-look.bodyW * 0.3, -look.bodyW * 0.1, look.bodyW * 0.1]) {
        out.push(sc.add.triangle(ox, bodyY - look.bodyH * 0.5, -1.4, 1, 1.4, 1, 0, -2, dark));
      }
      // tail
      out.push(sc.add.triangle(
        -look.bodyW * 0.5 - 3, bodyY,
        0, -look.bodyH * 0.5,
        0, look.bodyH * 0.5,
        -7, 0,
        look.bodyColor,
      ).setStrokeStyle(0.6, dark));
      // snout
      out.push(sc.add.rectangle(headX + 3, headY + 1, 6, look.bodyH * 0.55, look.bodyColor).setStrokeStyle(0.6, dark));
      // eyes
      out.push(sc.add.circle(headX - 1, headY - 1.2, 0.7, 0xffd96b));
      // teeth glint
      out.push(sc.add.rectangle(headX + 5, headY + 1.5, 3, 0.6, 0xfff2c2));
      return out;
    }

    if (kind === "mammoth") {
      // dome head bigger
      out.push(sc.add.ellipse(headX - 1, headY - look.bodyH * 0.2, look.bodyH * 1.0, look.bodyH * 0.9, look.bodyColor).setStrokeStyle(0.8, dark));
      // tusks
      out.push(sc.add.line(0, 0, headX + 1, headY + 2, headX + 7, headY + 5, 0xeae0c8, 1).setLineWidth(2));
      out.push(sc.add.line(0, 0, headX + 1, headY + 2, headX + 7, headY + 7, 0xeae0c8, 1).setLineWidth(2));
      // trunk
      out.push(sc.add.line(0, 0, headX + 2, headY + 1, headX + 4, headY + 6, look.bodyColor, 1).setLineWidth(2.5));
      // shaggy fur lines
      out.push(sc.add.rectangle(0, bodyY + look.bodyH * 0.4, look.bodyW * 0.9, 1.5, dark, 0.6));
    }

    return out;
  }

  applySnapshot(snap: AnimalSnapshot): void {
    this.srcGx = this.gx;
    this.srcGy = this.gy;
    this.targetGx = snap.gx;
    this.targetGy = snap.gy;
    this.snapElapsed = 0;
    const dx = snap.gx - this.gx;
    if (Math.abs(dx) > 0.005) this.facing = dx > 0 ? 1 : -1;
    this.hp = snap.hp;
    this.hpMax = snap.hpMax;
    this.state = snap.state;
    this.maturity = snap.maturity ?? 1;
    if (this.hp < this.hpMax) {
      this.hpBg.setVisible(true);
      this.hpFg.setVisible(true);
      const w = 18 * (this.hp / this.hpMax);
      this.hpFg.setSize(w, 3);
      this.hpFg.setX(-(18 - w) / 2);
    }
  }

  update(dtSec: number): void {
    this.snapElapsed += dtSec;
    const t = Math.min(1, this.snapElapsed / Animal.SNAP_DURATION);
    this.gx = this.srcGx + (this.targetGx - this.srcGx) * t;
    this.gy = this.srcGy + (this.targetGy - this.srcGy) * t;
    const { x, y } = gridToScreen(this.gx, this.gy);
    const h = groundHeight(this.worldSeed, this.gx, this.gy);
    this.bobPhase += dtSec * (this.state === "wander" || this.state === "flee" ? 9 : 2);
    const bob = this.state !== "idle" ? Math.sin(this.bobPhase) * 0.6 : 0;
    this.container.setPosition(x, y - h + bob);
    const ageScale = 0.55 + 0.45 * this.maturity;
    this.container.setScale(this.facing * ageScale, ageScale);
    this.updateDepth();
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.container);
    this.container.destroy();
  }

  die(): void {
    this.scene.tweens.killTweensOf(this.container);
    this.hpBg.setVisible(false);
    this.hpFg.setVisible(false);
    this.scene.tweens.add({
      targets: this.container,
      angle: 80,
      y: this.container.y + 4,
      duration: 500,
      ease: "Cubic.easeIn",
    });
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      delay: 1800,
      duration: 1200,
      ease: "Cubic.easeIn",
      onComplete: () => {
        this.container.destroy();
      },
    });
  }

  private updateDepth(): void {
    this.container.setDepth((this.gx + this.gy) * TILE_H);
  }
}

function shade(color: number, factor: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}
