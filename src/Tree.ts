import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { GameMap } from "./GameMap";

export class Tree {
  scene: Phaser.Scene;
  map: GameMap;
  i: number;
  j: number;
  wood = 25;
  alive = true;
  container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, map: GameMap, i: number, j: number) {
    this.scene = scene;
    this.map = map;
    this.i = i;
    this.j = j;
    map.setWalkable(i, j, false);

    const { x, y } = gridToScreen(i + 0.5, j + 0.5);
    const trunk = scene.add.rectangle(0, -8, 6, 14, 0x5a3a1a);
    const leaves = scene.add
      .ellipse(0, -22, 26, 28, 0x2d6b2d)
      .setStrokeStyle(2, 0x1a4a1a);
    this.container = scene.add.container(x, y, [trunk, leaves]);
    this.container.setDepth((i + 0.5 + j + 0.5) * TILE_H);
  }

  destroy(): void {
    this.alive = false;
    this.map.setWalkable(this.i, this.j, true);
    this.container.destroy();
  }
}
