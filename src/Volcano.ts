import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { groundHeight, hash3 } from "../shared/worldgen";

interface LavaBomb {
  obj: Phaser.GameObjects.Ellipse;
  trail: Phaser.GameObjects.Ellipse;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

export class Volcano {
  scene: Phaser.Scene;
  i: number;
  j: number;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  private lavaGlow: Phaser.GameObjects.Ellipse;
  private craterFire: Phaser.GameObjects.Ellipse;
  private halo: Phaser.GameObjects.Ellipse;
  private smoke: Phaser.GameObjects.Ellipse;
  private bombs: LavaBomb[] = [];
  private craterY: number;
  private phase: number;
  private nextEruptionAt: number;
  private now = 0;
  private rng: () => number;

  constructor(scene: Phaser.Scene, i: number, j: number, worldSeed: number) {
    this.scene = scene;
    this.i = i;
    this.j = j;

    const seed = hash3(worldSeed ^ 0x0c4c, i, j);
    this.phase = ((seed % 1000) / 1000) * Math.PI * 2;
    this.nextEruptionAt = 0.4 + (((seed >> 8) % 1000) / 1000) * 1.6;

    let rngS = (seed ^ 0xa1b2c3d4) >>> 0;
    this.rng = () => {
      rngS = (rngS + 0x6d2b79f5) >>> 0;
      let t = rngS;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const { x, y } = gridToScreen(i + 0.5, j + 0.5);
    const gh = groundHeight(worldSeed, i + 0.5, j + 0.5);
    const wy = y - gh;
    const scale = 1 + (((seed >> 12) % 11) - 5) / 50;

    const baseW = 64;
    const midW = 44;
    const rimW = 22;
    const rimH = 8;
    const coneH = 60;
    const midY = -coneH * 0.55;
    const rimY = -coneH;

    const rockBase = 0x3a3530;
    const rockMid = 0x554b42;
    const rockHi = 0x6d6053;
    const rockShadow = 0x221d19;
    const lavaCore = 0xff5a1a;
    const lavaHot = 0xffd24a;
    const lavaDeep = 0xa22408;
    const smokeColor = 0x3d3a36;

    this.shadow = scene.add.ellipse(x, wy + 5, 84, 34, 0x000000, 0.45);
    this.shadow.setDepth((i + 0.5 + j + 0.5) * TILE_H - 0.5);

    const coneBody = scene.add.polygon(0, 0, [
      -baseW / 2, 3,
      baseW / 2, 3,
      midW / 2, midY,
      rimW / 2 + 2, rimY + 3,
      -rimW / 2 - 2, rimY + 3,
      -midW / 2, midY,
    ], rockBase, 1);
    coneBody.setStrokeStyle(1.4, rockShadow, 0.85);

    const rightHi = scene.add.polygon(0, 0, [
      2, 3,
      baseW / 2 - 4, 3,
      midW / 2 - 3, midY,
      rimW / 2 + 1, rimY + 3,
      2, rimY + 3,
    ], rockMid, 0.9);

    const leftSh = scene.add.polygon(0, 0, [
      -baseW / 2, 3,
      -baseW / 2 + 9, 3,
      -midW / 2 + 4, midY,
      -rimW / 2 - 1, rimY + 3,
      -rimW / 2 - 2, rimY + 3,
      -midW / 2, midY,
    ], rockShadow, 0.55);

    const ridge = scene.add.line(0, 0,
      -midW / 2 + 6, midY + 1,
      -3, midY * 0.45,
      rockHi, 0.7);
    const ridge2 = scene.add.line(0, 0,
      midW / 2 - 8, midY + 2,
      6, midY * 0.45,
      rockHi, 0.5);

    const streak1 = scene.add.line(0, 0,
      -4, rimY + 5,
      -12, midY + 2,
      lavaDeep, 0.85);
    streak1.setLineWidth(1.6);
    const streak2 = scene.add.line(0, 0,
      5, rimY + 6,
      14, midY + 4,
      lavaCore, 0.9);
    streak2.setLineWidth(1.6);
    const streak2b = scene.add.line(0, 0,
      14, midY + 4,
      22, -6,
      lavaDeep, 0.7);
    streak2b.setLineWidth(1.4);

    const rubble1 = scene.add.ellipse(-baseW / 2 + 9, 5, 10, 4, rockMid, 0.95)
      .setStrokeStyle(0.6, rockShadow, 0.7);
    const rubble2 = scene.add.ellipse(baseW / 2 - 7, 6, 12, 5, rockBase, 0.95)
      .setStrokeStyle(0.6, rockShadow, 0.7);
    const rubble3 = scene.add.ellipse(-baseW / 4, 7, 8, 3, rockHi, 0.85);
    const rubble4 = scene.add.ellipse(baseW / 4 + 4, 7, 7, 3, rockMid, 0.85);

    const craterBack = scene.add.ellipse(0, rimY + 1, rimW, rimH, lavaDeep, 1);
    this.lavaGlow = scene.add.ellipse(0, rimY + 1, rimW - 3, rimH - 2, lavaCore, 1);
    this.halo = scene.add.ellipse(0, rimY + 1, 70, 28, lavaCore, 0.2);
    const craterRim = scene.add.ellipse(0, rimY + 2, rimW + 4, rimH + 2, rockBase, 0)
      .setStrokeStyle(1.4, rockShadow, 0.95);
    const craterRimHi = scene.add.ellipse(0, rimY + 1, rimW + 2, rimH, rockHi, 0)
      .setStrokeStyle(1, rockHi, 0.6);
    this.craterFire = scene.add.ellipse(0, rimY - 3, rimW * 0.55, rimH + 3, lavaHot, 0.95);

    this.smoke = scene.add.ellipse(0, rimY - 16, 26, 18, smokeColor, 0.55);
    const smoke2 = scene.add.ellipse(-3, rimY - 26, 18, 12, smokeColor, 0.4);

    this.craterY = rimY + 1;

    this.container = scene.add.container(x, wy, [
      smoke2,
      this.smoke,
      coneBody,
      leftSh,
      rightHi,
      ridge,
      ridge2,
      streak1,
      streak2,
      streak2b,
      rubble1,
      rubble2,
      rubble3,
      rubble4,
      craterBack,
      this.lavaGlow,
      this.halo,
      craterRim,
      craterRimHi,
      this.craterFire,
    ]);
    this.container.setScale(scale);
    this.container.setDepth((i + 0.5 + j + 0.5) * TILE_H + 0.05);
  }

  update(dt: number): void {
    this.now += dt;
    this.phase += dt * 6;

    const pulse = 0.86 + Math.sin(this.phase) * 0.12 + Math.sin(this.phase * 2.3) * 0.06;
    this.lavaGlow.setScale(pulse, pulse);
    this.lavaGlow.setAlpha(0.85 + Math.sin(this.phase * 1.3) * 0.12);
    this.craterFire.setScale(
      0.85 + Math.sin(this.phase * 1.7) * 0.2,
      0.9 + Math.sin(this.phase) * 0.3,
    );
    this.craterFire.setAlpha(0.8 + Math.sin(this.phase * 0.9) * 0.15);
    this.halo.setAlpha(0.16 + Math.sin(this.phase * 1.1) * 0.06);

    this.smoke.x = Math.sin(this.now * 0.4) * 4;
    this.smoke.y = -76 + Math.sin(this.now * 0.7) * 1.6;
    this.smoke.setScale(1 + Math.sin(this.now * 0.5) * 0.08);
    this.smoke.setAlpha(0.45 + Math.sin(this.now * 0.6) * 0.1);

    if (this.now >= this.nextEruptionAt) {
      this.erupt();
      this.nextEruptionAt = this.now + 1.6 + this.rng() * 2.6;
    }

    for (let k = this.bombs.length - 1; k >= 0; k--) {
      const b = this.bombs[k];
      b.age += dt;
      b.vy += 130 * dt;
      b.obj.x += b.vx * dt;
      b.obj.y += b.vy * dt;
      b.trail.x = b.obj.x - b.vx * 0.025;
      b.trail.y = b.obj.y - b.vy * 0.025;
      b.trail.setAlpha(Math.max(0, 0.55 - b.age * 0.7));
      const fade = Math.max(0, 1 - b.age / b.life);
      b.obj.setAlpha(fade);
      if (b.age >= b.life || b.obj.y > 8) {
        b.obj.destroy();
        b.trail.destroy();
        this.bombs.splice(k, 1);
      }
    }
  }

  private erupt(): void {
    const count = 4 + Math.floor(this.rng() * 4);
    const lavaCore = 0xff5a1a;
    const lavaHot = 0xffd24a;
    for (let k = 0; k < count; k++) {
      const angle = -Math.PI / 2 + (this.rng() - 0.5) * 1.4;
      const speed = 60 + this.rng() * 70;
      const sz = 2.6 + this.rng() * 2.2;
      const trail = this.scene.add.ellipse(0, this.craterY - 2, sz * 1.6, sz * 0.9, lavaCore, 0.55);
      const bomb = this.scene.add.ellipse(0, this.craterY - 2, sz, sz, lavaHot, 1)
        .setStrokeStyle(0.6, lavaCore, 0.9);
      this.container.add(trail);
      this.container.add(bomb);
      this.bombs.push({
        obj: bomb,
        trail,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        life: 1.4 + this.rng() * 0.6,
      });
    }
  }

  destroy(): void {
    for (const b of this.bombs) {
      b.obj.destroy();
      b.trail.destroy();
    }
    this.bombs.length = 0;
    this.shadow.destroy();
    this.container.destroy();
  }
}
