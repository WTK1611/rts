import Phaser from "phaser";
import { gridToScreen, TILE_H, TILE_W } from "./iso";
import { groundHeight } from "../shared/worldgen";
import { ArtifactKind } from "../shared/protocol";

export class Artifact {
  scene: Phaser.Scene;
  id: string;
  gx: number;
  gy: number;
  kind: ArtifactKind;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  glow: Phaser.GameObjects.Graphics;
  found = false;
  private glowPhase = 0;

  constructor(
    scene: Phaser.Scene,
    id: string,
    gx: number,
    gy: number,
    kind: ArtifactKind,
    foundBy: number | null,
    worldSeed: number,
  ) {
    this.scene = scene;
    this.id = id;
    this.gx = gx;
    this.gy = gy;
    this.kind = kind;
    this.found = foundBy !== null;

    const { x, y } = gridToScreen(gx, gy);
    const h = groundHeight(worldSeed, gx, gy);
    const wy = y - h;

    this.glow = scene.add.graphics();
    this.glow.setPosition(x, wy);
    this.glow.setDepth((gx + gy) * TILE_H - 0.6);

    this.shadow = scene.add.ellipse(x, wy + 2, 32, 12, 0x000000, 0.4);
    this.shadow.setDepth((gx + gy) * TILE_H - 0.5);

    const parts = this.buildParts(scene, kind);
    this.container = scene.add.container(x, wy, parts);
    this.container.setDepth((gx + gy) * TILE_H);
  }

  private buildParts(
    scene: Phaser.Scene,
    kind: ArtifactKind,
  ): Phaser.GameObjects.GameObject[] {
    const dark = 0x40463f;
    const mid = 0x6a6f63;
    const light = 0x9aa090;
    const moss = 0x4a6a3a;

    if (kind === "stonehenge") {
      const parts: Phaser.GameObjects.GameObject[] = [];
      const positions: Array<[number, number, number]> = [
        [-12, 2, 0.95],
        [0, 4, 1.0],
        [12, 2, 0.95],
      ];
      for (const [px, py, sc] of positions) {
        const base = scene.add.rectangle(px, py - 7 * sc, 6 * sc, 14 * sc, mid)
          .setStrokeStyle(0.8, dark, 0.85);
        const hi = scene.add.rectangle(px - 1.4 * sc, py - 9 * sc, 1.5 * sc, 9 * sc, light, 0.55);
        const dk = scene.add.rectangle(px + 1.6 * sc, py - 7 * sc, 1.4 * sc, 9 * sc, dark, 0.45);
        parts.push(base, hi, dk);
      }
      const lintel = scene.add.rectangle(0, -16, 30, 4, mid)
        .setStrokeStyle(0.8, dark, 0.85);
      const lintelHi = scene.add.rectangle(-7, -17.4, 14, 1.4, light, 0.55);
      parts.push(lintel, lintelHi);
      const m = scene.add.ellipse(-6, -14.3, 4.5, 1.4, moss, 0.7);
      parts.push(m);
      return parts;
    }

    if (kind === "stoneCircle") {
      const parts: Phaser.GameObjects.GameObject[] = [];
      const N = 8;
      const rx = 16;
      const ry = 8;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const px = Math.cos(a) * rx;
        const py = Math.sin(a) * ry;
        const sc = 0.85 + (i % 3) * 0.12;
        const stoneH = 9 * sc;
        const base = scene.add.rectangle(px, py - stoneH / 2, 4.5 * sc, stoneH, mid)
          .setStrokeStyle(0.6, dark, 0.85);
        const hi = scene.add.rectangle(px - 1.1 * sc, py - stoneH * 0.7, 1.1 * sc, stoneH * 0.7, light, 0.5);
        parts.push(base, hi);
        // depth-sort within container is by add order; back stones first
      }
      // sort: lower py drawn first
      parts.sort((a, b) => {
        const ay = (a as Phaser.GameObjects.Rectangle).y;
        const by = (b as Phaser.GameObjects.Rectangle).y;
        return ay - by;
      });
      return parts;
    }

    // monolith
    const base = scene.add.rectangle(0, -10, 7, 22, mid)
      .setStrokeStyle(0.9, dark, 0.9);
    const hi = scene.add.rectangle(-1.7, -14, 1.8, 16, light, 0.55);
    const dk = scene.add.rectangle(1.8, -10, 1.6, 16, dark, 0.4);
    const cap = scene.add.ellipse(0, -21, 7, 2.2, light, 0.7);
    const m = scene.add.ellipse(1.5, -3, 4, 1.2, moss, 0.7);
    return [base, hi, dk, cap, m];
  }

  update(dt: number): void {
    if (this.found) {
      this.glow.clear();
      return;
    }
    this.glowPhase = (this.glowPhase + dt * 1.6) % (Math.PI * 2);
    const pulse = 0.5 + 0.5 * Math.sin(this.glowPhase);
    const a1 = 0.18 + pulse * 0.18;
    const a2 = 0.1 * (1 - pulse);
    const r1 = TILE_W * 0.4;
    const r2 = TILE_W * 0.7;
    this.glow.clear();
    this.glow.lineStyle(2, 0xffd84d, a1);
    this.glow.strokeEllipse(0, TILE_H * 0.25, r1 * 2, r1);
    this.glow.lineStyle(2, 0xffd84d, a2);
    this.glow.strokeEllipse(0, TILE_H * 0.25, r2 * 2, r2);
  }

  markFound(): void {
    if (this.found) return;
    this.found = true;
    this.glow.clear();
    this.scene.tweens.add({
      targets: this.container,
      scaleX: 1.25,
      scaleY: 1.25,
      yoyo: true,
      duration: 280,
      ease: "Sine.easeOut",
    });
  }

  destroy(): void {
    this.glow.destroy();
    this.shadow.destroy();
    this.container.destroy();
  }
}
