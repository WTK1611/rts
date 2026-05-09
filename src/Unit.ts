import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { GameMap } from "./GameMap";
import { findPath } from "./pathfinding";
import { Tree } from "./Tree";

export type UnitState = "idle" | "moving" | "harvesting";

const HARVEST_INTERVAL = 1.2;
const HARVEST_AMOUNT = 5;

export class Unit {
  scene: Phaser.Scene;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Ellipse;
  selectionRing: Phaser.GameObjects.Ellipse;
  gx: number;
  gy: number;
  speed = 3.5;
  selected = false;

  private path: { gx: number; gy: number }[] = [];
  state: UnitState = "idle";
  private harvestTarget: Tree | null = null;
  private harvestTimer = 0;

  onWoodGained: ((amount: number) => void) | null = null;

  constructor(scene: Phaser.Scene, gx: number, gy: number, color = 0x4ea1ff) {
    this.scene = scene;
    this.gx = gx;
    this.gy = gy;
    const { x, y } = gridToScreen(gx, gy);

    this.selectionRing = scene.add
      .ellipse(0, 0, 40, 20, 0x00ff66, 0)
      .setStrokeStyle(2, 0x00ff66);
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

  setSelected(v: boolean): void {
    this.selected = v;
    this.selectionRing.setVisible(v);
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
      this.state = "idle";
      return;
    }
    this.path = path.slice(1).map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }));
    this.state = "moving";
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
    this.state = this.path.length > 0 ? "moving" : "harvesting";
  }

  update(dtSec: number): void {
    if (this.state === "moving") {
      if (this.path.length === 0) {
        this.state =
          this.harvestTarget && this.harvestTarget.alive ? "harvesting" : "idle";
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
        this.state = "idle";
      } else {
        this.harvestTimer += dtSec;
        if (this.harvestTimer >= HARVEST_INTERVAL) {
          this.harvestTimer = 0;
          t.wood -= HARVEST_AMOUNT;
          this.onWoodGained?.(HARVEST_AMOUNT);
          if (t.wood <= 0) {
            t.destroy();
            this.harvestTarget = null;
            this.state = "idle";
          }
        }
      }
    }

    const { x, y } = gridToScreen(this.gx, this.gy);
    this.container.setPosition(x, y);
    this.updateDepth();
  }

  private updateDepth(): void {
    this.container.setDepth((this.gx + this.gy) * TILE_H);
  }
}
