import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { groundHeight } from "../shared/worldgen";
import { DropPileSnapshot, Resources, RESOURCE_KEYS } from "../shared/protocol";

const RESOURCE_COLORS: Record<keyof Resources, number> = {
  holz: 0x8a5a2b,
  wasser: 0x3a8fd4,
  beeren: 0xc23a3a,
  pilze: 0xd44a4a,
  fleisch: 0xb04a3a,
  fisch: 0x6abad6,
  stein: 0x8a8a8a,
  kreuter: 0x8fd06a,
  felle: 0x7a5a3a,
};

export class DropPile {
  scene: Phaser.Scene;
  id: string;
  gx: number;
  gy: number;
  resources: Resources;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  private bobPhase: number;
  private baseY: number;

  constructor(scene: Phaser.Scene, snap: DropPileSnapshot, worldSeed: number) {
    this.scene = scene;
    this.id = snap.id;
    this.gx = snap.gx;
    this.gy = snap.gy;
    this.resources = { ...snap.resources };
    this.bobPhase = Math.random() * Math.PI * 2;

    const { x, y } = gridToScreen(snap.gx, snap.gy);
    const h = groundHeight(worldSeed, snap.gx, snap.gy);
    const wy = y - h;

    this.shadow = scene.add.ellipse(x, wy + 2, 18, 7, 0x000000, 0.32);
    this.shadow.setDepth((snap.gx + snap.gy) * TILE_H - 0.5);

    const parts = this.buildParts();
    this.container = scene.add.container(x, wy, parts);
    this.container.setDepth((snap.gx + snap.gy) * TILE_H);
    this.baseY = wy;
  }

  private buildParts(): Phaser.GameObjects.GameObject[] {
    const parts: Phaser.GameObjects.GameObject[] = [];
    const sack = this.scene.add.ellipse(0, -4, 14, 8, 0x6b4a2b)
      .setStrokeStyle(0.8, 0x3a2510, 0.9);
    const hi = this.scene.add.ellipse(-2, -5, 6, 3, 0x9a6f44, 0.7);
    const tie = this.scene.add.rectangle(0, -8.5, 4, 2, 0x3a2510);
    parts.push(sack, hi, tie);

    const present: Array<keyof Resources> = RESOURCE_KEYS.filter(
      (k) => this.resources[k] > 0,
    );
    const N = Math.min(present.length, 4);
    for (let k = 0; k < N; k++) {
      const a = (k / Math.max(1, N)) * Math.PI * 2 - Math.PI / 2;
      const ox = Math.cos(a) * 7;
      const oy = -8 + Math.sin(a) * 3.5;
      const c = this.scene.add.circle(ox, oy, 1.6, RESOURCE_COLORS[present[k]])
        .setStrokeStyle(0.4, 0x2a1a08, 0.9);
      parts.push(c);
    }
    return parts;
  }

  applySnap(snap: DropPileSnapshot): void {
    let changed = false;
    for (const k of RESOURCE_KEYS) {
      if (snap.resources[k] !== this.resources[k]) {
        changed = true;
        break;
      }
    }
    this.resources = { ...snap.resources };
    if (changed) {
      this.container.removeAll(true);
      for (const part of this.buildParts()) this.container.add(part);
    }
  }

  update(dt: number): void {
    this.bobPhase = (this.bobPhase + dt * 2.2) % (Math.PI * 2);
    this.container.y = this.baseY + Math.sin(this.bobPhase) * 0.6;
  }

  destroy(): void {
    this.shadow.destroy();
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      scaleX: 0.5,
      scaleY: 0.5,
      duration: 260,
      ease: "Cubic.easeIn",
      onComplete: () => this.container.destroy(),
    });
  }
}
