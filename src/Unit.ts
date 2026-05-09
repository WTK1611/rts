import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { GameMap } from "./GameMap";
import { findPath } from "./pathfinding";
import { Tree } from "./Tree";

export type UnitState = "idle" | "moving" | "harvesting";

const HARVEST_INTERVAL = 1.2;
const HARVEST_AMOUNT = 5;

function shade(color: number, factor: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

export class Unit {
  scene: Phaser.Scene;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Ellipse;
  head: Phaser.GameObjects.Arc;
  shadow: Phaser.GameObjects.Ellipse;
  selectionRing: Phaser.GameObjects.Ellipse;
  gx: number;
  gy: number;
  speed = 3.5;
  selected = false;

  private bobPhase: number;
  private path: { gx: number; gy: number }[] = [];
  state: UnitState = "idle";
  private harvestTarget: Tree | null = null;
  private harvestTimer = 0;
  private harvestSwingTween: Phaser.Tweens.Tween | null = null;

  onWoodGained: ((amount: number) => void) | null = null;

  constructor(scene: Phaser.Scene, gx: number, gy: number, color = 0x4ea1ff) {
    this.scene = scene;
    this.gx = gx;
    this.gy = gy;
    this.bobPhase = Math.random() * Math.PI * 2;
    const { x, y } = gridToScreen(gx, gy);

    this.shadow = scene.add.ellipse(0, 1, 22, 9, 0x000000, 0.4);

    this.selectionRing = scene.add
      .ellipse(0, 0, 36, 18, 0x00ff66, 0)
      .setStrokeStyle(2, 0x00ff66);
    this.selectionRing.setVisible(false);

    const dark = shade(color, 0.7);
    const light = shade(color, 1.25);

    const bodyShadow = scene.add.ellipse(1, -12, 16, 20, dark, 0.6);
    this.body = scene.add.ellipse(0, -13, 16, 20, color).setStrokeStyle(1.5, 0x141414);
    const bodyHighlight = scene.add.ellipse(-3, -16, 6, 9, light, 0.85);

    this.head = scene.add.circle(0, -26, 6, 0xf3c79a).setStrokeStyle(1.5, 0x141414);
    const hair = scene.add.arc(0, -28, 6, 200, 340, false, 0x3a2410);

    this.container = scene.add.container(x, y, [
      this.shadow,
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

  get tileI(): number {
    return Math.floor(this.gx);
  }
  get tileJ(): number {
    return Math.floor(this.gy);
  }

  moveToTile(map: GameMap, i: number, j: number): void {
    const path = findPath(map, this.tileI, this.tileJ, i, j);
    if (!path || path.length < 2) {
      this.path = [];
      this.harvestTarget = null;
      this.setState("idle");
      return;
    }
    this.path = path.slice(1).map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }));
    this.setState("moving");
    this.harvestTarget = null;
  }

  harvestTree(map: GameMap, tree: Tree): void {
    let bestPath: ReturnType<typeof findPath> = null;
    const offsets: Array<[number, number]> = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (const [di, dj] of offsets) {
      const ni = tree.i + di;
      const nj = tree.j + dj;
      if (!map.isWalkable(ni, nj)) continue;
      const p = findPath(map, this.tileI, this.tileJ, ni, nj);
      if (p && (!bestPath || p.length < bestPath.length)) bestPath = p;
    }
    if (!bestPath) return;
    this.path =
      bestPath.length > 1
        ? bestPath.slice(1).map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }))
        : [];
    this.harvestTarget = tree;
    this.harvestTimer = 0;
    this.setState(this.path.length > 0 ? "moving" : "harvesting");
  }

  update(dtSec: number): void {
    if (this.state === "moving") {
      if (this.path.length === 0) {
        this.setState(
          this.harvestTarget && this.harvestTarget.alive ? "harvesting" : "idle",
        );
      } else {
        const wp = this.path[0];
        const dx = wp.gx - this.gx;
        const dy = wp.gy - this.gy;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.02) {
          this.gx = wp.gx;
          this.gy = wp.gy;
          this.path.shift();
        } else {
          const step = Math.min(this.speed * dtSec, dist);
          this.gx += (dx / dist) * step;
          this.gy += (dy / dist) * step;
        }
      }
    } else if (this.state === "harvesting") {
      const t = this.harvestTarget;
      if (!t || !t.alive) {
        this.harvestTarget = null;
        this.setState("idle");
      } else {
        this.harvestTimer += dtSec;
        if (this.harvestTimer >= HARVEST_INTERVAL) {
          this.harvestTimer = 0;
          t.wood -= HARVEST_AMOUNT;
          this.onWoodGained?.(HARVEST_AMOUNT);
          if (t.wood <= 0) {
            t.destroy();
            this.harvestTarget = null;
            this.setState("idle");
          }
        }
      }
    }

    const { x, y } = gridToScreen(this.gx, this.gy);
    this.bobPhase += dtSec * (this.state === "moving" ? 11 : 3);
    const bob = this.state === "moving" ? Math.sin(this.bobPhase) * 1.2 : 0;
    this.container.setPosition(x, y + bob);
    this.shadow.setScale(1, 1 - Math.abs(bob) * 0.04);
    this.updateDepth();
  }

  private setState(next: UnitState): void {
    if (this.state === next) return;
    this.state = next;
    if (next === "harvesting") {
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
