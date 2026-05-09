import Phaser from "phaser";
import { gridToScreen, screenToGrid, TILE_W, TILE_H } from "../iso";
import { Unit } from "../Unit";
import { Tree } from "../Tree";
import { GameMap } from "../GameMap";

const MAP_SIZE = 20;
const TREE_COUNT = 28;

interface DragState {
  startX: number;
  startY: number;
  isBox: boolean;
}

export class GameScene extends Phaser.Scene {
  private map!: GameMap;
  private units: Unit[] = [];
  private trees: Tree[] = [];

  private hoverTile!: Phaser.GameObjects.Graphics;
  private selectionBox!: Phaser.GameObjects.Graphics;

  private drag: DragState | null = null;
  private wood = 0;
  private hud: HTMLElement | null = null;

  private camTargetX = 0;
  private camTargetY = 0;

  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;

  constructor() {
    super("GameScene");
  }

  create(): void {
    this.map = new GameMap(MAP_SIZE, MAP_SIZE);

    this.drawTiles();

    const startPositions: Array<[number, number]> = [
      [4, 4], [6, 5], [5, 7], [3, 6],
    ];
    this.spawnTrees(startPositions);

    for (const [i, j] of startPositions) {
      const color = [0x4ea1ff, 0xff6b6b, 0xffd24e, 0x9b6bff][this.units.length % 4];
      const u = new Unit(this, i + 0.5, j + 0.5, color);
      u.onWoodGained = (amount) => {
        this.wood += amount;
        this.updateHud();
      };
      this.units.push(u);
    }

    this.hoverTile = this.add.graphics();
    this.hoverTile.setDepth(-99999);

    this.selectionBox = this.add.graphics();
    this.selectionBox.setScrollFactor(0);
    this.selectionBox.setDepth(2_000_000);

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x1f3a1f);
    cam.centerOn(0, (MAP_SIZE * TILE_H) / 2);
    cam.setZoom(1);
    this.camTargetX = cam.scrollX;
    this.camTargetY = cam.scrollY;

    const kb = this.input.keyboard!;
    this.keyW = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.on("pointerup", this.onPointerUp, this);
    this.input.on(
      "wheel",
      (
        _p: Phaser.Input.Pointer,
        _objs: Phaser.GameObjects.GameObject[],
        _dx: number,
        dy: number,
      ) => {
        const next = cam.zoom * (dy < 0 ? 1.1 : 1 / 1.1);
        cam.setZoom(Phaser.Math.Clamp(next, 0.5, 2.5));
      },
    );

    this.hud = document.getElementById("hud");
    this.updateHud();
  }

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (const u of this.units) u.update(dt);

    const cam = this.cameras.main;
    const speed = 600 / cam.zoom;
    if (this.keyW.isDown) this.camTargetY -= speed * dt;
    if (this.keyS.isDown) this.camTargetY += speed * dt;
    if (this.keyA.isDown) this.camTargetX -= speed * dt;
    if (this.keyD.isDown) this.camTargetX += speed * dt;
    const lerp = 1 - Math.pow(0.001, dt);
    cam.scrollX += (this.camTargetX - cam.scrollX) * lerp;
    cam.scrollY += (this.camTargetY - cam.scrollY) * lerp;
  }

  private spawnTrees(reserved: Array<[number, number]>): void {
    const taken = new Set<string>();
    for (const [i, j] of reserved) {
      taken.add(`${i},${j}`);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) taken.add(`${i + di},${j + dj}`);
      }
    }
    let placed = 0;
    let tries = 0;
    while (placed < TREE_COUNT && tries < 500) {
      tries++;
      const i = Phaser.Math.Between(0, MAP_SIZE - 1);
      const j = Phaser.Math.Between(0, MAP_SIZE - 1);
      const key = `${i},${j}`;
      if (taken.has(key)) continue;
      taken.add(key);
      this.trees.push(new Tree(this, this.map, i, j));
      placed++;
    }
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (p.rightButtonDown()) {
      this.commandSelected(p);
      return;
    }
    if (!p.leftButtonDown()) return;

    const hits = this.input.hitTestPointer(p);
    const clicked = this.units.find((u) => hits.includes(u.container));
    if (clicked) {
      this.units.forEach((u) => u.setSelected(u === clicked));
      this.drag = null;
      return;
    }
    this.drag = { startX: p.x, startY: p.y, isBox: false };
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    const { gx, gy } = screenToGrid(p.worldX, p.worldY);
    this.drawHover(Math.floor(gx), Math.floor(gy));

    if (!this.drag) return;
    const dx = p.x - this.drag.startX;
    const dy = p.y - this.drag.startY;
    if (Math.hypot(dx, dy) > 8) this.drag.isBox = true;
    if (this.drag.isBox) this.drawSelectionBox(p);
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (!this.drag) return;
    if (this.drag.isBox) {
      this.commitBoxSelection(p);
    } else {
      this.units.forEach((u) => u.setSelected(false));
    }
    this.drag = null;
    this.selectionBox.clear();
  }

  private commandSelected(p: Phaser.Input.Pointer): void {
    const selected = this.units.filter((u) => u.selected);
    if (selected.length === 0) return;
    const { gx, gy } = screenToGrid(p.worldX, p.worldY);
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    if (!this.map.inBounds(i, j)) return;
    const tree = this.trees.find((t) => t.alive && t.i === i && t.j === j);
    if (tree) {
      selected.forEach((u) => u.harvestTree(this.map, tree));
    } else {
      selected.forEach((u) => u.moveToTile(this.map, i, j));
    }
  }

  private drawSelectionBox(p: Phaser.Input.Pointer): void {
    if (!this.drag) return;
    const x = Math.min(this.drag.startX, p.x);
    const y = Math.min(this.drag.startY, p.y);
    const w = Math.abs(p.x - this.drag.startX);
    const h = Math.abs(p.y - this.drag.startY);
    this.selectionBox.clear();
    this.selectionBox.fillStyle(0x00ff66, 0.15);
    this.selectionBox.fillRect(x, y, w, h);
    this.selectionBox.lineStyle(1, 0x00ff66, 1);
    this.selectionBox.strokeRect(x, y, w, h);
  }

  private commitBoxSelection(p: Phaser.Input.Pointer): void {
    if (!this.drag) return;
    const cam = this.cameras.main;
    const a = cam.getWorldPoint(
      Math.min(this.drag.startX, p.x),
      Math.min(this.drag.startY, p.y),
    );
    const b = cam.getWorldPoint(
      Math.max(this.drag.startX, p.x),
      Math.max(this.drag.startY, p.y),
    );
    this.units.forEach((u) => {
      const x = u.container.x;
      const y = u.container.y;
      u.setSelected(x >= a.x && x <= b.x && y >= a.y && y <= b.y);
    });
  }

  private drawTiles(): void {
    const palette = [0x355d35, 0x3a6b3a, 0x437a43, 0x2f5a2f, 0x4d8a4d, 0x335a33];
    const g = this.add.graphics();
    g.setDepth(-100000);
    for (let j = 0; j < MAP_SIZE; j++) {
      for (let i = 0; i < MAP_SIZE; i++) {
        const { x, y } = gridToScreen(i, j);
        const h = (i * 374761393 + j * 668265263) >>> 0;
        const fill = palette[h % palette.length];
        g.fillStyle(fill, 1);
        g.lineStyle(1, 0x244524, 0.18);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + TILE_W / 2, y + TILE_H / 2);
        g.lineTo(x, y + TILE_H);
        g.lineTo(x - TILE_W / 2, y + TILE_H / 2);
        g.closePath();
        g.fillPath();
        g.strokePath();

        if ((h >> 3) % 7 === 0) {
          const dx = (((h >> 5) & 0xff) / 255 - 0.5) * TILE_W * 0.35;
          const dy = (((h >> 13) & 0xff) / 255 - 0.5) * TILE_H * 0.35;
          g.fillStyle(0x6cbf6c, 0.45);
          g.fillCircle(x + dx, y + TILE_H / 2 + dy, 1.6);
          g.fillCircle(x + dx + 2, y + TILE_H / 2 + dy + 1, 1.2);
        } else if ((h >> 3) % 23 === 0) {
          const dx = (((h >> 5) & 0xff) / 255 - 0.5) * TILE_W * 0.4;
          const dy = (((h >> 13) & 0xff) / 255 - 0.5) * TILE_H * 0.4;
          g.fillStyle(0xf2e07a, 0.85);
          g.fillCircle(x + dx, y + TILE_H / 2 + dy, 1.4);
        } else if ((h >> 3) % 31 === 0) {
          const dx = (((h >> 5) & 0xff) / 255 - 0.5) * TILE_W * 0.4;
          const dy = (((h >> 13) & 0xff) / 255 - 0.5) * TILE_H * 0.4;
          g.fillStyle(0x7e7466, 0.8);
          g.fillCircle(x + dx, y + TILE_H / 2 + dy, 2);
          g.fillStyle(0x5a5345, 0.7);
          g.fillCircle(x + dx + 1, y + TILE_H / 2 + dy + 1, 1.2);
        }
      }
    }
  }

  private drawHover(i: number, j: number): void {
    this.hoverTile.clear();
    if (!this.map.inBounds(i, j)) return;
    const { x, y } = gridToScreen(i, j);
    const drawDiamond = () => {
      this.hoverTile.beginPath();
      this.hoverTile.moveTo(x, y);
      this.hoverTile.lineTo(x + TILE_W / 2, y + TILE_H / 2);
      this.hoverTile.lineTo(x, y + TILE_H);
      this.hoverTile.lineTo(x - TILE_W / 2, y + TILE_H / 2);
      this.hoverTile.closePath();
    };
    this.hoverTile.fillStyle(0xffff66, 0.12);
    drawDiamond();
    this.hoverTile.fillPath();
    this.hoverTile.lineStyle(1.5, 0xffff66, 0.6);
    drawDiamond();
    this.hoverTile.strokePath();
  }

  private updateHud(): void {
    if (!this.hud) return;
    this.hud.textContent =
      `Holz: ${this.wood}  ·  LMK: Auswahl  ·  LMK ziehen: Boxauswahl  ·  ` +
      `RMK: bewegen / Baum fällen  ·  WASD: Kamera  ·  Mausrad: Zoom`;
  }
}
