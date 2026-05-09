import Phaser from "phaser";
import { gridToScreen, screenToGrid, TILE_W, TILE_H } from "../iso";
import { Unit } from "../Unit";
import { Tree } from "../Tree";
import { Bush } from "../Bush";
import { Fish } from "../Fish";
import { Mushroom } from "../Mushroom";
import { Net } from "../net";
import {
  Footprint,
  FOOTPRINT_LIFETIME_TICKS,
  InitMessage,
  ObjectKind,
  PlayerId,
  RemovedObject,
  RESOURCE_KEYS,
  Resources,
  ServerMessage,
  StateMessage,
  TICK_RATE,
} from "../../shared/protocol";
import {
  biomeAt,
  Biome,
  BIOME_PALETTES,
  hasBushAt,
  hasFishAt,
  hasMushroomAt,
  hasTreeAt,
  isLandTile,
  tileVariant,
  tileDecor,
} from "../../shared/worldgen";

interface DragState {
  startX: number;
  startY: number;
  isBox: boolean;
}

interface Chunk {
  cx: number;
  cy: number;
  graphics: Phaser.GameObjects.Graphics;
  elevGraphics: Phaser.GameObjects.Graphics;
  trees: Map<string, Tree>;
  bushes: Map<string, Bush>;
  mushrooms: Map<string, Mushroom>;
  fishes: Map<string, Fish>;
}

export interface GameSceneInit {
  net: Net;
  init: InitMessage;
}

const SIGHT_RADIUS = 5.5;
const CHUNK_SIZE = 16;
const VIEW_PAD_TILES = 8;
const FELSEN_ELEV = 6;

const BIOME_MINI_COLOR: Record<Biome, string> = {
  wiesen: "#3a6b3a",
  wald: "#1e3e1e",
  savanne: "#9c8a4a",
  wueste: "#d4b878",
  lake: "#244a72",
  river: "#3a78b0",
  felsen: "#707070",
};

const MINIMAP_PX = 200;
const MINIMAP_PX_PER_TILE = 4;
const MINIMAP_RANGE = MINIMAP_PX / MINIMAP_PX_PER_TILE;

function objKey(kind: ObjectKind, i: number, j: number): string {
  const p = kind === "tree" ? "t" : kind === "bush" ? "b" : "m";
  return `${p}_${i}_${j}`;
}

export class GameScene extends Phaser.Scene {
  private net!: Net;
  private playerId: PlayerId = 0;
  private seed = 0;
  private names: string[] = [];
  private removedKeys = new Set<string>();
  private serverTick = 0;

  private units: Map<string, Unit> = new Map();
  private trees: Map<string, Tree> = new Map();
  private bushes: Map<string, Bush> = new Map();
  private mushrooms: Map<string, Mushroom> = new Map();
  private fishes: Map<string, Fish> = new Map();
  private chunks: Map<string, Chunk> = new Map();

  private hoverTile!: Phaser.GameObjects.Graphics;
  private selectionBox!: Phaser.GameObjects.Graphics;
  private fog!: Phaser.GameObjects.Graphics;
  private footprintsGfx!: Phaser.GameObjects.Graphics;

  private visible = new Set<string>();
  private explored = new Set<string>();

  private drag: DragState | null = null;
  private resources: Resources[] = [];
  private hud: HTMLElement | null = null;
  private minimapWrap: HTMLElement | null = null;
  private minimapCanvas: HTMLCanvasElement | null = null;
  private minimapCtx: CanvasRenderingContext2D | null = null;
  private minimapAccum = 0;

  private footprints: Footprint[] = [];
  private playerColors: Record<number, number> = {};

  private camTargetX = 0;
  private camTargetY = 0;

  private lastPointerScreenX = -1;
  private lastPointerScreenY = -1;

  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyM!: Phaser.Input.Keyboard.Key;
  private tribeMoveCooldown = 0;
  private minimapVisible = true;

  constructor() {
    super("GameScene");
  }

  init(data: GameSceneInit): void {
    this.net = data.net;
    this.playerId = data.init.playerId;
    this.seed = data.init.seed;
    this.serverTick = data.init.tick;
    this.resources = data.init.resources.map((r) => ({ ...r }));
    this.names = data.init.names;
    this.removedKeys = new Set(
      data.init.removedObjects.map((o) => objKey(o.kind, o.i, o.j)),
    );
    this.footprints = [...data.init.footprints];
  }

  create(): void {
    const initData = (this as Phaser.Scene).scene.settings.data as GameSceneInit;

    for (const u of initData.init.units) {
      this.units.set(u.id, new Unit(this, u, u.owner === this.playerId));
      this.playerColors[u.owner] = u.color;
    }

    this.hoverTile = this.add.graphics();
    this.hoverTile.setDepth(-99999);

    this.footprintsGfx = this.add.graphics();
    this.footprintsGfx.setDepth(1_600_000);

    this.fog = this.add.graphics();
    this.fog.setDepth(1_500_000);

    this.selectionBox = this.add.graphics();
    this.selectionBox.setScrollFactor(0);
    this.selectionBox.setDepth(2_000_000);

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x0a0e0a);
    const spawn = initData.init.spawn;
    const spawnPx = gridToScreen(spawn.cx + 0.5, spawn.cy + 0.5);
    cam.centerOn(spawnPx.x, spawnPx.y);
    cam.setZoom(1);
    this.camTargetX = cam.scrollX;
    this.camTargetY = cam.scrollY;

    const kb = this.input.keyboard!;
    this.keyW = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyM = kb.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.keyM.on("down", () => this.toggleMinimap());

    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.on("pointerup", this.onPointerUp, this);
    this.input.on("gameout", () => {
      this.lastPointerScreenX = -1;
      this.lastPointerScreenY = -1;
    });
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

    this.net.onMessage((msg) => this.onServerMessage(msg));

    this.hud = document.getElementById("hud");
    this.minimapWrap = document.getElementById("minimap-wrap");
    this.minimapCanvas = document.getElementById("minimap") as HTMLCanvasElement | null;
    if (this.minimapCanvas) this.minimapCtx = this.minimapCanvas.getContext("2d");
    if (this.minimapWrap) this.minimapWrap.style.display = "block";
    if (this.minimapCanvas) {
      this.minimapCanvas.addEventListener("mousedown", (e) =>
        this.onMinimapClick(e),
      );
    }

    this.updateChunks();
    this.updateFog();
    this.drawFootprints();
    this.updateHud();
  }

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (const u of this.units.values()) u.update(dt);

    const cam = this.cameras.main;
    const speed = 600 / cam.zoom;
    this.applyEdgePan(dt, speed);
    this.applyTribeKeys(dt);
    this.applyTribeFollow();

    const lerp = 1 - Math.pow(0.001, dt);
    cam.scrollX += (this.camTargetX - cam.scrollX) * lerp;
    cam.scrollY += (this.camTargetY - cam.scrollY) * lerp;

    this.updateChunks();
    this.updateFog();
    this.drawFootprints();

    this.minimapAccum += dt;
    if (this.minimapAccum >= 0.1) {
      this.minimapAccum = 0;
      this.drawMinimap();
    }
  }

  private toggleMinimap(): void {
    this.minimapVisible = !this.minimapVisible;
    if (this.minimapWrap) {
      this.minimapWrap.style.display = this.minimapVisible ? "block" : "none";
    }
  }

  private applyTribeKeys(dt: number): void {
    const dx = (this.keyD.isDown ? 1 : 0) - (this.keyA.isDown ? 1 : 0);
    const dy = (this.keyS.isDown ? 1 : 0) - (this.keyW.isDown ? 1 : 0);
    if (dx === 0 && dy === 0) {
      this.tribeMoveCooldown = 0;
      return;
    }
    this.tribeMoveCooldown -= dt;
    if (this.tribeMoveCooldown > 0) return;
    this.tribeMoveCooldown = 0.4;

    const gdx = dx + dy;
    const gdy = -dx + dy;
    const len = Math.hypot(gdx, gdy);
    if (len === 0) return;

    let anySelected = false;
    for (const u of this.units.values()) {
      if (u.owner === this.playerId && u.selected) {
        anySelected = true;
        break;
      }
    }

    let cx = 0;
    let cy = 0;
    let n = 0;
    const ids: string[] = [];
    for (const u of this.units.values()) {
      if (u.owner !== this.playerId) continue;
      if (anySelected && !u.selected) continue;
      cx += u.gx;
      cy += u.gy;
      n++;
      ids.push(u.id);
    }
    if (n === 0) return;
    cx /= n;
    cy /= n;

    const stepDist = 8;
    const ti = Math.floor(cx + (gdx / len) * stepDist);
    const tj = Math.floor(cy + (gdy / len) * stepDist);
    this.net.send({ type: "move", unitIds: ids, i: ti, j: tj });
  }

  private applyTribeFollow(): void {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let n = 0;
    for (const u of this.units.values()) {
      if (u.owner !== this.playerId) continue;
      const w = gridToScreen(u.gx, u.gy);
      if (w.x < minX) minX = w.x;
      if (w.x > maxX) maxX = w.x;
      if (w.y < minY) minY = w.y;
      if (w.y > maxY) maxY = w.y;
      n++;
    }
    if (n === 0) return;
    const cam = this.cameras.main;
    const margin = 180;
    const sxMin = (minX - this.camTargetX) * cam.zoom;
    const sxMax = (maxX - this.camTargetX) * cam.zoom;
    const syMin = (minY - this.camTargetY) * cam.zoom;
    const syMax = (maxY - this.camTargetY) * cam.zoom;
    let dx = 0;
    let dy = 0;
    if (sxMin < margin) dx = sxMin - margin;
    else if (sxMax > cam.width - margin) dx = sxMax - (cam.width - margin);
    if (syMin < margin) dy = syMin - margin;
    else if (syMax > cam.height - margin) dy = syMax - (cam.height - margin);
    if (dx === 0 && dy === 0) return;
    this.camTargetX += dx / cam.zoom;
    this.camTargetY += dy / cam.zoom;
  }

  private applyEdgePan(dt: number, baseSpeed: number): void {
    const cam = this.cameras.main;
    const w = cam.width;
    const h = cam.height;
    const x = this.lastPointerScreenX;
    const y = this.lastPointerScreenY;
    if (x < 0 || y < 0 || x > w || y > h) return;
    const margin = Math.max(140, Math.min(w, h) * 0.18);
    let dx = 0;
    let dy = 0;
    if (x < margin) dx = -(margin - x) / margin;
    else if (x > w - margin) dx = (x - (w - margin)) / margin;
    if (y < margin) dy = -(margin - y) / margin;
    else if (y > h - margin) dy = (y - (h - margin)) / margin;
    if (dx === 0 && dy === 0) return;
    const speed = baseSpeed * 3;
    this.camTargetX += dx * speed * dt;
    this.camTargetY += dy * speed * dt;
  }

  private viewTileBounds(): { i0: number; i1: number; j0: number; j1: number } {
    const cam = this.cameras.main;
    const corners = [
      cam.getWorldPoint(0, 0),
      cam.getWorldPoint(cam.width, 0),
      cam.getWorldPoint(0, cam.height),
      cam.getWorldPoint(cam.width, cam.height),
    ];
    let i0 = Infinity;
    let i1 = -Infinity;
    let j0 = Infinity;
    let j1 = -Infinity;
    for (const c of corners) {
      const { gx, gy } = screenToGrid(c.x, c.y);
      i0 = Math.min(i0, gx);
      i1 = Math.max(i1, gx);
      j0 = Math.min(j0, gy);
      j1 = Math.max(j1, gy);
    }
    return {
      i0: Math.floor(i0 - VIEW_PAD_TILES),
      i1: Math.ceil(i1 + VIEW_PAD_TILES),
      j0: Math.floor(j0 - VIEW_PAD_TILES),
      j1: Math.ceil(j1 + VIEW_PAD_TILES),
    };
  }

  private updateChunks(): void {
    const { i0, i1, j0, j1 } = this.viewTileBounds();
    const cx0 = Math.floor(i0 / CHUNK_SIZE);
    const cx1 = Math.floor(i1 / CHUNK_SIZE);
    const cy0 = Math.floor(j0 / CHUNK_SIZE);
    const cy1 = Math.floor(j1 / CHUNK_SIZE);

    const needed = new Set<string>();
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = `${cx},${cy}`;
        needed.add(key);
        if (!this.chunks.has(key)) this.loadChunk(cx, cy);
      }
    }
    for (const [key, chunk] of this.chunks) {
      if (!needed.has(key)) this.unloadChunk(key, chunk);
    }
  }

  private loadChunk(cx: number, cy: number): void {
    const g = this.add.graphics();
    g.setDepth(-100000);
    const elev = this.add.graphics();
    elev.setDepth(-99500);
    const trees = new Map<string, Tree>();
    const bushes = new Map<string, Bush>();
    const mushrooms = new Map<string, Mushroom>();
    const fishes = new Map<string, Fish>();
    const i0 = cx * CHUNK_SIZE;
    const j0 = cy * CHUNK_SIZE;
    for (let dj = 0; dj < CHUNK_SIZE; dj++) {
      for (let di = 0; di < CHUNK_SIZE; di++) {
        const i = i0 + di;
        const j = j0 + dj;
        this.drawTile(g, elev, i, j);
        if (hasTreeAt(this.seed, i, j)) {
          const id = objKey("tree", i, j);
          if (!this.removedKeys.has(id) && !this.trees.has(id)) {
            const t = new Tree(this, id, i, j);
            trees.set(id, t);
            this.trees.set(id, t);
          }
        } else if (hasBushAt(this.seed, i, j)) {
          const id = objKey("bush", i, j);
          if (!this.removedKeys.has(id) && !this.bushes.has(id)) {
            const b = new Bush(this, i, j);
            bushes.set(id, b);
            this.bushes.set(id, b);
          }
        } else if (hasMushroomAt(this.seed, i, j)) {
          const id = objKey("mushroom", i, j);
          if (!this.removedKeys.has(id) && !this.mushrooms.has(id)) {
            const m = new Mushroom(this, i, j);
            mushrooms.set(id, m);
            this.mushrooms.set(id, m);
          }
        } else if (hasFishAt(this.seed, i, j)) {
          const id = objKey("fish", i, j);
          if (!this.removedKeys.has(id) && !this.fishes.has(id)) {
            const f = new Fish(this, i, j);
            fishes.set(id, f);
            this.fishes.set(id, f);
          }
        }
      }
    }
    this.chunks.set(`${cx},${cy}`, {
      cx, cy, graphics: g, elevGraphics: elev, trees, bushes, mushrooms, fishes,
    });
  }

  private unloadChunk(key: string, chunk: Chunk): void {
    chunk.graphics.destroy();
    chunk.elevGraphics.destroy();
    for (const [tid, t] of chunk.trees) {
      t.container.destroy();
      t.shadow.destroy();
      this.trees.delete(tid);
    }
    for (const [bid, b] of chunk.bushes) {
      b.container.destroy();
      b.shadow.destroy();
      this.bushes.delete(bid);
    }
    for (const [mid, m] of chunk.mushrooms) {
      m.container.destroy();
      m.shadow.destroy();
      this.mushrooms.delete(mid);
    }
    for (const [fid, f] of chunk.fishes) {
      f.container.destroy();
      f.shadow.destroy();
      this.fishes.delete(fid);
    }
    this.chunks.delete(key);
  }

  private drawTile(
    g: Phaser.GameObjects.Graphics,
    elev: Phaser.GameObjects.Graphics,
    i: number,
    j: number,
  ): void {
    const { x, y } = gridToScreen(i, j);
    const biome = biomeAt(this.seed, i, j);
    const palette = BIOME_PALETTES[biome];
    const variant = tileVariant(this.seed, i, j) % palette.length;
    const fill = palette[variant];
    const isWater = biome === "lake" || biome === "river";

    if (biome === "felsen") {
      this.drawFelsenTile(elev, i, j, x, y, fill);
      return;
    }

    let tileFill = fill;
    if (isWater) {
      tileFill = this.waterShadeAt(i, j);
    }
    g.fillStyle(tileFill, 1);
    g.lineStyle(1, isWater ? 0x16304a : 0x244524, isWater ? 0.2 : 0.18);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + TILE_W / 2, y + TILE_H / 2);
    g.lineTo(x, y + TILE_H);
    g.lineTo(x - TILE_W / 2, y + TILE_H / 2);
    g.closePath();
    g.fillPath();
    g.strokePath();

    const decor = tileDecor(this.seed, i, j);
    const dx = (((decor >> 5) & 0xff) / 255 - 0.5) * TILE_W * 0.4;
    const dy = (((decor >> 13) & 0xff) / 255 - 0.5) * TILE_H * 0.4;
    const cy = y + TILE_H / 2;

    if (isWater) {
      if ((decor >> 3) % 5 === 0) {
        g.lineStyle(1, 0xb8d8f0, 0.45);
        g.beginPath();
        g.moveTo(x + dx - 4, cy + dy);
        g.lineTo(x + dx + 4, cy + dy);
        g.strokePath();
      }
      return;
    }

    if (biome === "wueste") {
      if ((decor >> 3) % 41 === 0) {
        g.fillStyle(0x4a7838, 0.9);
        g.fillRect(x + dx - 1, cy + dy - 4, 2, 6);
        g.fillStyle(0x5d8a45, 0.9);
        g.fillRect(x + dx - 3, cy + dy - 1, 2, 3);
        g.fillRect(x + dx + 2, cy + dy - 1, 2, 3);
      } else if ((decor >> 3) % 19 === 0) {
        g.fillStyle(0x9a8458, 0.7);
        g.fillCircle(x + dx, cy + dy, 1.4);
      }
    } else if (biome === "savanne") {
      if ((decor >> 3) % 9 === 0) {
        g.fillStyle(0xb89a3a, 0.7);
        g.fillCircle(x + dx, cy + dy, 1.3);
        g.fillCircle(x + dx + 2, cy + dy + 1, 1);
      } else if ((decor >> 3) % 31 === 0) {
        g.fillStyle(0x7e7466, 0.8);
        g.fillCircle(x + dx, cy + dy, 2);
        g.fillStyle(0x5a5345, 0.7);
        g.fillCircle(x + dx + 1, cy + dy + 1, 1.2);
      }
    } else if (biome === "wald") {
      if ((decor >> 3) % 5 === 0) {
        g.fillStyle(0x4d8a4d, 0.55);
        g.fillCircle(x + dx, cy + dy, 1.6);
        g.fillCircle(x + dx + 2, cy + dy + 1, 1.2);
      } else if ((decor >> 3) % 27 === 0) {
        g.fillStyle(0x6c5a30, 0.7);
        g.fillCircle(x + dx, cy + dy, 1.6);
      }
    } else {
      if ((decor >> 3) % 7 === 0) {
        g.fillStyle(0x6cbf6c, 0.45);
        g.fillCircle(x + dx, cy + dy, 1.6);
        g.fillCircle(x + dx + 2, cy + dy + 1, 1.2);
      } else if ((decor >> 3) % 23 === 0) {
        g.fillStyle(0xf2e07a, 0.85);
        g.fillCircle(x + dx, cy + dy, 1.4);
      } else if ((decor >> 3) % 31 === 0) {
        g.fillStyle(0x7e7466, 0.8);
        g.fillCircle(x + dx, cy + dy, 2);
        g.fillStyle(0x5a5345, 0.7);
        g.fillCircle(x + dx + 1, cy + dy + 1, 1.2);
      }
    }
  }

  private waterShadeAt(i: number, j: number): number {
    const max = 3;
    for (let r = 1; r <= max; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (isLandTile(this.seed, i + di, j + dj)) {
            const t = (r - 1) / max;
            return lerpColor(0x6aaad6, 0x1c3658, t);
          }
        }
      }
    }
    return 0x102540;
  }

  private drawFelsenTile(
    g: Phaser.GameObjects.Graphics,
    i: number,
    j: number,
    x: number,
    y: number,
    fill: number,
  ): void {
    const E = FELSEN_ELEV;
    const yt = y - E;
    const decor = tileDecor(this.seed, i, j);

    const dark = 0x303030;
    const darker = 0x222222;

    g.fillStyle(darker, 1);
    g.beginPath();
    g.moveTo(x - TILE_W / 2, y + TILE_H / 2 - E);
    g.lineTo(x, y + TILE_H - E);
    g.lineTo(x, y + TILE_H);
    g.lineTo(x - TILE_W / 2, y + TILE_H / 2);
    g.closePath();
    g.fillPath();

    g.fillStyle(dark, 1);
    g.beginPath();
    g.moveTo(x + TILE_W / 2, y + TILE_H / 2 - E);
    g.lineTo(x, y + TILE_H - E);
    g.lineTo(x, y + TILE_H);
    g.lineTo(x + TILE_W / 2, y + TILE_H / 2);
    g.closePath();
    g.fillPath();

    g.fillStyle(fill, 1);
    g.lineStyle(1, 0x404040, 0.35);
    g.beginPath();
    g.moveTo(x, yt);
    g.lineTo(x + TILE_W / 2, yt + TILE_H / 2);
    g.lineTo(x, yt + TILE_H);
    g.lineTo(x - TILE_W / 2, yt + TILE_H / 2);
    g.closePath();
    g.fillPath();
    g.strokePath();

    const dx = (((decor >> 5) & 0xff) / 255 - 0.5) * TILE_W * 0.4;
    const dy = (((decor >> 13) & 0xff) / 255 - 0.5) * TILE_H * 0.4;
    const cy = yt + TILE_H / 2;
    const r = ((decor >> 3) & 0xff) / 255;
    g.fillStyle(0x4a4a4a, 0.85);
    g.fillCircle(x + dx, cy + dy, 2 + r * 1.5);
    g.fillStyle(0x9a9a9a, 0.6);
    g.fillCircle(x + dx - 1.5, cy + dy - 1, 1.2);
    if ((decor >> 11) % 5 === 0) {
      g.fillStyle(0x3a3a3a, 0.8);
      g.fillCircle(x + dx + 4, cy + dy + 2, 1.4);
    }
  }

  private updateFog(): void {
    this.visible.clear();
    for (const u of this.units.values()) {
      if (u.owner !== this.playerId) continue;
      const r = SIGHT_RADIUS;
      const r2 = r * r;
      const cx = u.gx;
      const cy = u.gy;
      const i0 = Math.floor(cx - r);
      const i1 = Math.floor(cx + r);
      const j0 = Math.floor(cy - r);
      const j1 = Math.floor(cy + r);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const dx = i + 0.5 - cx;
          const dy = j + 0.5 - cy;
          if (dx * dx + dy * dy <= r2) {
            const k = `${i},${j}`;
            this.visible.add(k);
            this.explored.add(k);
          }
        }
      }
    }

    const { i0, i1, j0, j1 } = this.viewTileBounds();
    this.fog.clear();
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = `${i},${j}`;
        if (this.visible.has(k)) continue;
        const ex = this.explored.has(k);
        const { x, y } = gridToScreen(i, j);
        if (ex) {
          this.fog.fillStyle(0x808080, 0.55);
        } else {
          this.fog.fillStyle(0x000000, 1);
        }
        this.fog.beginPath();
        this.fog.moveTo(x, y);
        this.fog.lineTo(x + TILE_W / 2, y + TILE_H / 2);
        this.fog.lineTo(x, y + TILE_H);
        this.fog.lineTo(x - TILE_W / 2, y + TILE_H / 2);
        this.fog.closePath();
        this.fog.fillPath();
      }
    }

    for (const u of this.units.values()) {
      const i = Math.floor(u.gx);
      const j = Math.floor(u.gy);
      const k = `${i},${j}`;
      if (u.owner === this.playerId) {
        u.container.setVisible(true);
        continue;
      }
      u.container.setVisible(this.visible.has(k));
    }

    for (const t of this.trees.values()) {
      const k = `${t.i},${t.j}`;
      const v = this.visible.has(k);
      t.container.setVisible(v);
      t.shadow.setVisible(v);
    }
    for (const b of this.bushes.values()) {
      const k = `${b.i},${b.j}`;
      const v = this.visible.has(k);
      b.container.setVisible(v);
      b.shadow.setVisible(v);
    }
    for (const m of this.mushrooms.values()) {
      const k = `${m.i},${m.j}`;
      const v = this.visible.has(k);
      m.container.setVisible(v);
      m.shadow.setVisible(v);
    }
    for (const f of this.fishes.values()) {
      const k = `${f.i},${f.j}`;
      const v = this.visible.has(k);
      f.container.setVisible(v);
      f.shadow.setVisible(v);
    }
  }

  private drawFootprints(): void {
    this.footprintsGfx.clear();
    if (this.footprints.length === 0) return;
    const { i0, i1, j0, j1 } = this.viewTileBounds();
    const cutoff = this.serverTick - FOOTPRINT_LIFETIME_TICKS;
    let drop = 0;
    while (drop < this.footprints.length && this.footprints[drop].t < cutoff) drop++;
    if (drop > 0) this.footprints.splice(0, drop);

    for (const fp of this.footprints) {
      if (fp.i < i0 || fp.i > i1 || fp.j < j0 || fp.j > j1) continue;
      const age = this.serverTick - fp.t;
      const lifeFrac = 1 - age / FOOTPRINT_LIFETIME_TICKS;
      if (lifeFrac <= 0) continue;
      const alpha = 0.7 * lifeFrac;
      const { x, y } = gridToScreen(fp.i + 0.5, fp.j + 0.5);
      const cy = y + TILE_H / 2 - 1;
      const seed = (fp.i * 73 + fp.j * 19 + fp.t) | 0;
      const side = (seed & 1) ? 1 : -1;
      const ang = (((seed >> 1) & 0x7) / 8 - 0.5) * 0.6;
      this.drawFootprint(x - 2 * side, cy - 1, ang, alpha);
      this.drawFootprint(x + 2 * side, cy + 2, ang, alpha * 0.85);
    }
  }

  private drawFootprint(
    cx: number,
    cy: number,
    angle: number,
    alpha: number,
  ): void {
    const g = this.footprintsGfx;
    const cs = Math.cos(angle);
    const sn = Math.sin(angle);
    const rot = (px: number, py: number): { x: number; y: number } => ({
      x: cx + px * cs - py * sn,
      y: cy + px * sn + py * cs,
    });
    g.fillStyle(0x4a2f15, alpha);
    const heel = rot(0, 1.2);
    g.fillEllipse(heel.x, heel.y, 3.4, 2.4);
    const ball = rot(0, -1.4);
    g.fillEllipse(ball.x, ball.y, 2.8, 1.8);
    for (let i = 0; i < 3; i++) {
      const tx = -1.5 + i * 1.5;
      const t = rot(tx, -2.6);
      g.fillCircle(t.x, t.y, 0.55);
    }
  }

  private drawMinimap(): void {
    const ctx = this.minimapCtx;
    if (!ctx || !this.minimapCanvas) return;
    ctx.fillStyle = "#0a0e0a";
    ctx.fillRect(0, 0, MINIMAP_PX, MINIMAP_PX);

    const cam = this.cameras.main;
    const center = cam.getWorldPoint(cam.width / 2, cam.height / 2);
    const { gx: ccx, gy: ccy } = screenToGrid(center.x, center.y);
    const half = MINIMAP_RANGE / 2;
    const i0 = Math.floor(ccx - half);
    const i1 = Math.ceil(ccx + half);
    const j0 = Math.floor(ccy - half);
    const j1 = Math.ceil(ccy + half);

    const toMini = (gx: number, gy: number): { x: number; y: number } => ({
      x: (gx - ccx + half) * MINIMAP_PX_PER_TILE,
      y: (gy - ccy + half) * MINIMAP_PX_PER_TILE,
    });

    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = `${i},${j}`;
        if (!this.explored.has(k)) continue;
        const { x, y } = toMini(i + 0.5, j + 0.5);
        const biome = biomeAt(this.seed, i, j);
        if (this.visible.has(k)) {
          ctx.fillStyle = BIOME_MINI_COLOR[biome];
          if (
            hasTreeAt(this.seed, i, j) &&
            !this.removedKeys.has(objKey("tree", i, j))
          ) {
            ctx.fillStyle = biome === "wald" ? "#0f2a0f" : "#2c5520";
          }
        } else {
          ctx.fillStyle = "#3a4a3a";
        }
        ctx.fillRect(
          x - MINIMAP_PX_PER_TILE / 2,
          y - MINIMAP_PX_PER_TILE / 2,
          MINIMAP_PX_PER_TILE,
          MINIMAP_PX_PER_TILE,
        );
      }
    }

    for (const u of this.units.values()) {
      const i = Math.floor(u.gx);
      const j = Math.floor(u.gy);
      const k = `${i},${j}`;
      if (u.owner !== this.playerId && !this.visible.has(k)) continue;
      const { x, y } = toMini(u.gx, u.gy);
      ctx.fillStyle = u.owner === this.playerId ? "#7ecfff" : "#ff6b6b";
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const tl = cam.getWorldPoint(0, 0);
    const br = cam.getWorldPoint(cam.width, cam.height);
    const { gx: tlgx, gy: tlgy } = screenToGrid(tl.x, tl.y);
    const { gx: brgx, gy: brgy } = screenToGrid(br.x, br.y);
    const a = toMini(Math.min(tlgx, brgx), Math.min(tlgy, brgy));
    const b = toMini(Math.max(tlgx, brgx), Math.max(tlgy, brgy));
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }

  private onMinimapClick(e: MouseEvent): void {
    if (!this.minimapCanvas) return;
    const rect = this.minimapCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cam = this.cameras.main;
    const center = cam.getWorldPoint(cam.width / 2, cam.height / 2);
    const { gx: ccx, gy: ccy } = screenToGrid(center.x, center.y);
    const half = MINIMAP_RANGE / 2;
    const tgx = ccx + (mx / MINIMAP_PX_PER_TILE - half);
    const tgy = ccy + (my / MINIMAP_PX_PER_TILE - half);
    const target = gridToScreen(tgx, tgy);
    this.camTargetX = target.x - cam.width / (2 * cam.zoom);
    this.camTargetY = target.y - cam.height / (2 * cam.zoom);
  }

  private onServerMessage(msg: ServerMessage): void {
    if (msg.type === "state") this.applyState(msg);
    else if (msg.type === "opponentJoined") this.onOpponentJoined(msg);
    else if (msg.type === "opponentLeft") this.onOpponentLeft(msg);
  }

  private onOpponentJoined(msg: {
    playerId: PlayerId;
    name: string;
    units: import("../../shared/protocol").UnitSnapshot[];
  }): void {
    this.names[msg.playerId] = msg.name;
    for (const snap of msg.units) {
      this.playerColors[snap.owner] = snap.color;
      if (!this.units.has(snap.id)) {
        this.units.set(snap.id, new Unit(this, snap, snap.owner === this.playerId));
      }
    }
    this.updateHud();
    this.showToast(`Stamm von ${msg.name} ist beigetreten`, "join");
  }

  private onOpponentLeft(msg: {
    playerId: PlayerId;
    removedUnitIds: string[];
  }): void {
    const goneName = this.names[msg.playerId] || "Stamm";
    this.names[msg.playerId] = "";
    for (const id of msg.removedUnitIds) {
      const u = this.units.get(id);
      if (u) {
        u.destroy();
        this.units.delete(id);
      }
    }
    this.updateHud();
    this.showToast(`Stamm von ${goneName} hat das Spiel verlassen`, "leave");
  }

  private showToast(text: string, kind: "join" | "leave"): void {
    const root = document.getElementById("toasts");
    if (!root) return;
    const el = document.createElement("div");
    el.className = `toast ${kind === "leave" ? "leave" : ""}`.trim();
    el.textContent = text;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 250);
    }, 4000);
  }

  private applyState(msg: StateMessage): void {
    this.serverTick = msg.tick;
    for (const snap of msg.units) {
      const u = this.units.get(snap.id);
      if (u) u.applySnapshot(snap);
    }
    for (const ro of msg.newRemovedObjects) {
      this.applyRemoved(ro);
    }
    for (const fp of msg.newFootprints) {
      this.footprints.push(fp);
    }
    let resChanged = msg.resources.length !== this.resources.length;
    if (!resChanged) {
      outer: for (let i = 0; i < msg.resources.length; i++) {
        const a = msg.resources[i];
        const b = this.resources[i];
        if (!b) {
          resChanged = true;
          break;
        }
        for (const k of RESOURCE_KEYS) {
          if (a[k] !== b[k]) {
            resChanged = true;
            break outer;
          }
        }
      }
    }
    if (resChanged) {
      this.resources = msg.resources.map((r) => ({ ...r }));
      this.updateHud();
    }
  }

  private applyRemoved(ro: RemovedObject): void {
    const k = objKey(ro.kind, ro.i, ro.j);
    if (this.removedKeys.has(k)) return;
    this.removedKeys.add(k);
    if (ro.kind === "tree") {
      const t = this.trees.get(k);
      if (t) {
        t.fall();
        this.trees.delete(k);
        for (const c of this.chunks.values()) c.trees.delete(k);
      }
    } else if (ro.kind === "bush") {
      const b = this.bushes.get(k);
      if (b) {
        b.remove();
        this.bushes.delete(k);
        for (const c of this.chunks.values()) c.bushes.delete(k);
      }
    } else if (ro.kind === "mushroom") {
      const m = this.mushrooms.get(k);
      if (m) {
        m.remove();
        this.mushrooms.delete(k);
        for (const c of this.chunks.values()) c.mushrooms.delete(k);
      }
    } else {
      const f = this.fishes.get(k);
      if (f) {
        f.remove();
        this.fishes.delete(k);
        for (const c of this.chunks.values()) c.fishes.delete(k);
      }
    }
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (p.rightButtonDown()) {
      this.commandSelected(p);
      return;
    }
    if (!p.leftButtonDown()) return;

    const hits = this.input.hitTestPointer(p);
    const myUnits = [...this.units.values()].filter((u) => u.owner === this.playerId);
    const clicked = myUnits.find((u) => hits.includes(u.container));
    if (clicked) {
      myUnits.forEach((u) => u.setSelected(u === clicked));
      this.drag = null;
      return;
    }
    this.drag = { startX: p.x, startY: p.y, isBox: false };
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    this.lastPointerScreenX = p.x;
    this.lastPointerScreenY = p.y;
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
      for (const u of this.units.values()) {
        if (u.owner === this.playerId) u.setSelected(false);
      }
    }
    this.drag = null;
    this.selectionBox.clear();
  }

  private commandSelected(p: Phaser.Input.Pointer): void {
    const selected = [...this.units.values()].filter(
      (u) => u.owner === this.playerId && u.selected,
    );
    if (selected.length === 0) return;
    const { gx, gy } = screenToGrid(p.worldX, p.worldY);
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const k = `${i},${j}`;
    if (!this.explored.has(k)) return;
    const ids = selected.map((u) => u.id);
    if (this.visible.has(k) && this.harvestableAt(i, j)) {
      this.net.send({ type: "harvest", unitIds: ids, i, j });
    } else {
      this.net.send({ type: "move", unitIds: ids, i, j });
    }
  }

  private harvestableAt(i: number, j: number): boolean {
    if (
      hasTreeAt(this.seed, i, j) &&
      !this.removedKeys.has(objKey("tree", i, j))
    ) return true;
    if (
      hasBushAt(this.seed, i, j) &&
      !this.removedKeys.has(objKey("bush", i, j))
    ) return true;
    if (
      hasMushroomAt(this.seed, i, j) &&
      !this.removedKeys.has(objKey("mushroom", i, j))
    ) return true;
    if (
      hasFishAt(this.seed, i, j) &&
      !this.removedKeys.has(objKey("fish", i, j))
    ) return true;
    return false;
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
    for (const u of this.units.values()) {
      if (u.owner !== this.playerId) continue;
      const x = u.container.x;
      const y = u.container.y;
      u.setSelected(x >= a.x && x <= b.x && y >= a.y && y <= b.y);
    }
  }

  private drawHover(i: number, j: number): void {
    this.hoverTile.clear();
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
    const myName = this.names[this.playerId] ?? "Du";
    const myColor = this.playerColorCss(this.playerId);
    const myRes = this.resources[this.playerId] ?? {
      holz: 0, wasser: 0, beeren: 0, fleisch: 0, stein: 0,
    };
    const labels: Record<keyof Resources, string> = {
      holz: "Holz",
      wasser: "Wasser",
      beeren: "Beeren",
      fleisch: "Fleisch",
      stein: "Stein",
    };
    const resHtml = RESOURCE_KEYS.map(
      (k) =>
        `<div class="item"><span class="ico ${k}"></span>` +
        `<span class="label">${labels[k]}</span><b>${myRes[k]}</b></div>`,
    ).join("");

    const otherRows: string[] = [];
    for (let i = 0; i < this.names.length; i++) {
      if (i === this.playerId) continue;
      const n = this.names[i];
      if (!n) continue;
      const c = this.playerColorCss(i);
      const w = this.resources[i]?.holz ?? 0;
      otherRows.push(
        `<div class="row"><span class="swatch" style="background:${c}"></span>` +
          `${escapeHtml(n)}: ${w} Holz</div>`,
      );
    }
    const othersHtml = otherRows.length
      ? `<div class="others">${otherRows.join("")}</div>`
      : `<div class="others">Warte auf weitere Stämme …</div>`;

    this.hud.innerHTML =
      `<div class="me"><span class="swatch" style="background:${myColor}"></span>` +
      `Stamm von ${escapeHtml(myName)}</div>` +
      `<div class="res">${resHtml}</div>` +
      othersHtml;
  }

  private playerColorCss(p: PlayerId): string {
    const c = this.playerColors[p];
    if (c !== undefined) return "#" + c.toString(16).padStart(6, "0");
    for (const u of this.units.values()) {
      if (u.owner === p) return "#" + u.color.toString(16).padStart(6, "0");
    }
    return "#888888";
  }
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
