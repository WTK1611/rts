import Phaser from "phaser";
import { gridToScreen, TILE_H, TILE_W } from "./iso";
import { groundHeight } from "../shared/worldgen";
import { CAMPFIRE_RANGE } from "../shared/protocol";

const FOG_DEPTH_OVERLAY = 1_550_000;

export class Campfire {
  scene: Phaser.Scene;
  id: string;
  owner: number;
  gx: number;
  gy: number;
  fuel = 1;
  size = 1;
  hasTent = false;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  rangeRing: Phaser.GameObjects.Graphics;
  glow: Phaser.GameObjects.Ellipse;
  flame1: Phaser.GameObjects.Ellipse;
  flame2: Phaser.GameObjects.Ellipse;
  ember: Phaser.GameObjects.Ellipse;
  tent: Phaser.GameObjects.Container | null = null;
  tentShadow: Phaser.GameObjects.Ellipse | null = null;
  private phase = Math.random() * Math.PI * 2;
  private worldSeed: number;
  private aboveFog = false;

  constructor(
    scene: Phaser.Scene,
    id: string,
    owner: number,
    gx: number,
    gy: number,
    fuel: number,
    size: number,
    worldSeed: number,
  ) {
    this.scene = scene;
    this.id = id;
    this.owner = owner;
    this.gx = gx;
    this.gy = gy;
    this.fuel = fuel;
    this.size = Math.max(1, size);
    this.worldSeed = worldSeed;

    const { x, y } = gridToScreen(gx, gy);
    const h = groundHeight(worldSeed, gx, gy);
    const wy = y - h;

    this.shadow = scene.add.ellipse(x, wy + 1, 18, 7, 0x000000, 0.4);
    this.shadow.setDepth((gx + gy) * TILE_H - 0.5);

    this.rangeRing = scene.add.graphics();
    this.rangeRing.setDepth((gx + gy) * TILE_H - 0.6);
    this.drawRangeRing(x, wy);

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

  applyState(gx: number, gy: number, fuel: number, size: number, hasTent: boolean): void {
    if (this.gx !== gx || this.gy !== gy) {
      this.gx = gx;
      this.gy = gy;
      const { x, y } = gridToScreen(gx, gy);
      const h = groundHeight(this.worldSeed, gx, gy);
      const wy = y - h;
      this.container.setPosition(x, wy);
      this.shadow.setPosition(x, wy + 1);
      this.shadow.setDepth((gx + gy) * TILE_H - 0.5);
      this.rangeRing.setDepth((gx + gy) * TILE_H - 0.6);
      this.drawRangeRing(x, wy);
      this.applyDepth();
      if (this.tent) this.repositionTent();
    }
    this.fuel = fuel;
    this.size = Math.max(1, size);
    this.setTent(hasTent);
  }

  private repositionTent(): void {
    if (!this.tent) return;
    const { x, y } = gridToScreen(this.gx, this.gy);
    const h = groundHeight(this.worldSeed, this.gx, this.gy);
    const wy = y - h;
    // Tent offset to the side of the fire so the flame stays visible.
    this.tent.setPosition(x + 32, wy + 2);
    if (this.tentShadow) {
      this.tentShadow.setPosition(x + 32, wy + 12);
      this.tentShadow.setDepth((this.gx + this.gy) * TILE_H - 0.45);
    }
    this.tent.setDepth((this.gx + this.gy) * TILE_H + 0.1);
  }

  private setTent(on: boolean): void {
    if (this.hasTent === on && (!on || this.tent)) return;
    this.hasTent = on;
    if (on && !this.tent) {
      // Simple skin-tent silhouette: triangular cover, two support poles, dark
      // entrance flap.
      const cover = this.scene.add.triangle(0, 0,
        -16, 4,
         16, 4,
          0, -22,
        0x8a6a40,
      ).setStrokeStyle(1, 0x4a2e1a);
      const darkSide = this.scene.add.triangle(0, 0,
         0, -22,
        16,  4,
         3,  4,
        0x6a4a26,
      ).setStrokeStyle(1, 0x4a2e1a);
      darkSide.setAlpha(0.85);
      const pole1 = this.scene.add.rectangle(-16, -1, 1.5, 8, 0x3a2410);
      const pole2 = this.scene.add.rectangle( 16, -1, 1.5, 8, 0x3a2410);
      const entrance = this.scene.add.triangle(-2, 2,
         0, -10,
         6, 4,
        -6, 4,
        0x1a0e08,
      );
      entrance.setAlpha(0.65);
      const { x, y } = gridToScreen(this.gx, this.gy);
      const h = groundHeight(this.worldSeed, this.gx, this.gy);
      const wy = y - h;
      this.tentShadow = this.scene.add.ellipse(x + 32, wy + 12, 36, 6, 0x000000, 0.32);
      this.tent = this.scene.add.container(x + 32, wy + 2, [cover, darkSide, pole1, pole2, entrance]);
      this.repositionTent();
    } else if (!on && this.tent) {
      this.tent.destroy();
      this.tent = null;
      if (this.tentShadow) {
        this.tentShadow.destroy();
        this.tentShadow = null;
      }
    }
  }

  setAboveFog(above: boolean): void {
    if (this.aboveFog === above) return;
    this.aboveFog = above;
    this.applyDepth();
  }

  private applyDepth(): void {
    const base = (this.gx + this.gy) * TILE_H;
    this.container.setDepth(this.aboveFog ? FOG_DEPTH_OVERLAY : base);
  }

  private drawRangeRing(cx: number, cy: number): void {
    const w = CAMPFIRE_RANGE * TILE_W;
    const h = CAMPFIRE_RANGE * TILE_H;
    const g = this.rangeRing;
    g.clear();
    g.fillStyle(0xff2a2a, 0.08);
    g.fillEllipse(cx, cy + 1, w, h);
    g.lineStyle(1.5, 0xff2a2a, 0.7);
    g.strokeEllipse(cx, cy + 1, w, h);
  }

  update(dt: number): void {
    this.phase += dt * 9;
    const flicker = 0.85 + Math.sin(this.phase) * 0.1 + Math.sin(this.phase * 1.7) * 0.05;
    const dim = 0.5 + this.fuel * 0.5;
    const grow = 1 + (this.size - 1) * 0.35;
    this.flame1.setScale(flicker * dim * grow, flicker * dim * grow);
    this.flame2.setScale((1.05 - (flicker - 0.85) * 0.5) * dim * grow, flicker * dim * grow);
    this.ember.setAlpha(0.6 + (1 - flicker) * 0.4);
    this.ember.setScale(grow, grow);
    this.glow.setAlpha((0.18 + (flicker - 0.85) * 0.4) * dim);
    this.glow.setScale(grow, grow);
  }

  remove(): void {
    this.shadow.destroy();
    this.rangeRing.destroy();
    if (this.tent) {
      const tent = this.tent;
      this.scene.tweens.add({
        targets: tent,
        alpha: 0,
        scale: 0.6,
        duration: 350,
        ease: "Cubic.easeIn",
        onComplete: () => tent.destroy(),
      });
      this.tent = null;
    }
    if (this.tentShadow) {
      this.tentShadow.destroy();
      this.tentShadow = null;
    }
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
