import Phaser from "phaser";
import { gridToScreen, screenToGrid, TILE_W, TILE_H } from "../iso";
import { Unit } from "../Unit";

const MAP_SIZE = 16;

export class GameScene extends Phaser.Scene {
  units: Unit[] = [];
  world!: Phaser.GameObjects.Container;
  hoverTile!: Phaser.GameObjects.Graphics;

  constructor() {
    super("GameScene");
  }

  create() {
    this.world = this.add.container(0, 0);
    this.centerCamera();
    this.scale.on("resize", () => this.centerCamera());

    this.drawTiles();

    this.hoverTile = this.add.graphics();
    this.world.add(this.hoverTile);

    const u1 = new Unit(this, 4, 4, 0x4ea1ff);
    const u2 = new Unit(this, 6, 5, 0xff6b6b);
    this.units.push(u1, u2);
    this.world.add(u1.container);
    this.world.add(u2.container);

    u1.container.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.leftButtonDown()) this.selectOnly(u1);
    });
    u2.container.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.leftButtonDown()) this.selectOnly(u2);
    });

    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const world = this.worldPointer(p);
      const { gx, gy } = screenToGrid(world.x, world.y);

      if (p.rightButtonDown()) {
        const sel = this.units.find((u) => u.selected);
        if (sel && this.inBounds(gx, gy)) {
          sel.moveTo(Math.floor(gx) + 0.5, Math.floor(gy) + 0.5);
        }
      } else if (p.leftButtonDown()) {
        const clickedUnit = this.units.some((u) =>
          u.container.getBounds().contains(p.x, p.y),
        );
        if (!clickedUnit) this.units.forEach((u) => u.setSelected(false));
      }
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      const world = this.worldPointer(p);
      const { gx, gy } = screenToGrid(world.x, world.y);
      this.drawHover(Math.floor(gx), Math.floor(gy));
    });
  }

  update(_time: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    for (const u of this.units) u.update(dt);
  }

  private centerCamera() {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2 - (MAP_SIZE * TILE_H) / 2;
    this.world.setPosition(cx, cy);
  }

  private worldPointer(p: Phaser.Input.Pointer) {
    return { x: p.x - this.world.x, y: p.y - this.world.y };
  }

  private inBounds(gx: number, gy: number) {
    return gx >= 0 && gy >= 0 && gx < MAP_SIZE && gy < MAP_SIZE;
  }

  private selectOnly(unit: Unit) {
    this.units.forEach((u) => u.setSelected(u === unit));
  }

  private drawTiles() {
    const g = this.add.graphics();
    g.lineStyle(1, 0x2a4a2a, 1);
    for (let gy = 0; gy < MAP_SIZE; gy++) {
      for (let gx = 0; gx < MAP_SIZE; gx++) {
        const { x, y } = gridToScreen(gx, gy);
        const fill = (gx + gy) % 2 === 0 ? 0x3a6b3a : 0x356635;
        g.fillStyle(fill, 1);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + TILE_W / 2, y + TILE_H / 2);
        g.lineTo(x, y + TILE_H);
        g.lineTo(x - TILE_W / 2, y + TILE_H / 2);
        g.closePath();
        g.fillPath();
        g.strokePath();
      }
    }
    g.setDepth(-100000);
    this.world.add(g);
  }

  private drawHover(gx: number, gy: number) {
    this.hoverTile.clear();
    if (!this.inBounds(gx, gy)) return;
    const { x, y } = gridToScreen(gx, gy);
    this.hoverTile.lineStyle(2, 0xffff66, 0.9);
    this.hoverTile.beginPath();
    this.hoverTile.moveTo(x, y);
    this.hoverTile.lineTo(x + TILE_W / 2, y + TILE_H / 2);
    this.hoverTile.lineTo(x, y + TILE_H);
    this.hoverTile.lineTo(x - TILE_W / 2, y + TILE_H / 2);
    this.hoverTile.closePath();
    this.hoverTile.strokePath();
    this.hoverTile.setDepth(-99999);
  }
}
