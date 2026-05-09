import Phaser from "phaser";
import { gridToScreen, screenToGrid, TILE_W, TILE_H } from "../iso";
import { Unit } from "../Unit";
import { Tree } from "../Tree";
import { Bush } from "../Bush";
import { Fish } from "../Fish";
import { Mushroom } from "../Mushroom";
import { Stone } from "../Stone";
import { Animal } from "../Animal";
import { Campfire } from "../Campfire";
import { Net } from "../net";
import {
  AnimalSnapshot,
  CampfireSnapshot,
  emptyResources,
  Footprint,
  FOOTPRINT_LIFETIME_TICKS,
  InitMessage,
  LeaderboardMessage,
  MAX_TRIBE_SIZE,
  ObjectKind,
  PlayerId,
  RemovedObject,
  RESOURCE_KEYS,
  Resources,
  ScoreEntry,
  ServerMessage,
  StateMessage,
  TICK_RATE,
} from "../../shared/protocol";
import {
  biomeAt,
  BIOME_PALETTES,
  groundHeight,
  hasBushAt,
  hasFishAt,
  hasMushroomAt,
  hasStoneAt,
  hasTreeAt,
  heightAt,
  isLandTile,
  MAX_TERRAIN_HEIGHT_PX,
  tileVariant,
  tileDecor,
} from "../../shared/worldgen";
import { LANGUAGE_FLAG, LANGUAGE_LABEL, Language } from "../../shared/names";
import { BIOME_MINI_COLOR } from "../biomeColors";

interface DragState {
  startX: number;
  startY: number;
  isBox: boolean;
}

interface Chunk {
  cx: number;
  cy: number;
  rt: Phaser.GameObjects.RenderTexture;
  trees: Map<string, Tree>;
  bushes: Map<string, Bush>;
  mushrooms: Map<string, Mushroom>;
  fishes: Map<string, Fish>;
  stones: Map<string, Stone>;
}

export interface GameSceneInit {
  net: Net;
  init: InitMessage;
}

const SIGHT_RADIUS = 5.5;
const CHUNK_SIZE = 16;
const VIEW_PAD_TILES = 8;

const MINIMAP_PX = 200;
const MINIMAP_PX_PER_TILE = 4;
const MINIMAP_RANGE = MINIMAP_PX / MINIMAP_PX_PER_TILE;

function objKey(kind: ObjectKind, i: number, j: number): string {
  const p =
    kind === "tree"
      ? "t"
      : kind === "bush"
        ? "b"
        : kind === "mushroom"
          ? "m"
          : kind === "fish"
            ? "f"
            : "s";
  return `${p}_${i}_${j}`;
}

export class GameScene extends Phaser.Scene {
  private net!: Net;
  private playerId: PlayerId = 0;
  private seed = 0;
  private names: string[] = [];
  private tribeLanguages: string[] = [];
  private botSlots: PlayerId[] = [];
  private spectatorTarget: PlayerId | null = null;
  private removedKeys = new Set<string>();
  private serverTick = 0;

  private units: Map<string, Unit> = new Map();
  private trees: Map<string, Tree> = new Map();
  private bushes: Map<string, Bush> = new Map();
  private mushrooms: Map<string, Mushroom> = new Map();
  private fishes: Map<string, Fish> = new Map();
  private stones: Map<string, Stone> = new Map();
  private animals: Map<string, Animal> = new Map();
  private campfires: Map<string, Campfire> = new Map();
  private chunks: Map<string, Chunk> = new Map();

  private hoverTile!: Phaser.GameObjects.Graphics;
  private selectionBox!: Phaser.GameObjects.Graphics;
  private fog!: Phaser.GameObjects.Graphics;
  private footprintsGfx!: Phaser.GameObjects.Graphics;

  private visible = new Set<string>();
  private explored = new Set<string>();

  private drag: DragState | null = null;
  private resources: Resources[] = [];
  private collectedTotals: Resources = emptyResources();
  private pendingScoreEntry: ScoreEntry | null = null;
  private hud: HTMLElement | null = null;
  private minimapWrap: HTMLElement | null = null;
  private minimapCanvas: HTMLCanvasElement | null = null;
  private minimapCtx: CanvasRenderingContext2D | null = null;
  private minimapAccum = 0;

  private footprints: Footprint[] = [];
  private playerColors: Record<number, number> = {};
  private pendingAnimals: AnimalSnapshot[] = [];
  private pendingCampfires: CampfireSnapshot[] = [];

  private camTargetX = 0;
  private camTargetY = 0;
  private lastZoom = 1;

  private lastPointerScreenX = -1;
  private lastPointerScreenY = -1;

  private touchPan: { lastX: number; lastY: number; startX: number; startY: number; moved: boolean } | null = null;
  private pinch: { startDist: number; startZoom: number } | null = null;
  private userPanned = false;

  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyUp!: Phaser.Input.Keyboard.Key;
  private keyDown!: Phaser.Input.Keyboard.Key;
  private keyLeft!: Phaser.Input.Keyboard.Key;
  private keyRight!: Phaser.Input.Keyboard.Key;
  private keyM!: Phaser.Input.Keyboard.Key;
  private tribeMoveCooldown = 0;
  private minimapVisible = true;

  private gameStartMs = 0;
  private initialTribeSize = 0;
  private maxTribeSize = 0;
  private isGameOver = false;

  private growthProgress: number[] = [];
  private growthActive: boolean[] = [];
  private tribeCounts: number[] = [];
  private growthBeacon!: Phaser.GameObjects.Graphics;
  private growthBeaconPhase = 0;
  private tribeRallyGfx!: Phaser.GameObjects.Graphics;
  private tribeRallyPhase = 0;

  private lastFogBoundsKey = "";
  private lastFogVisibleHash = 0;
  private lastFogExploredSize = -1;
  private lastFootprintsTick = -1;
  private lastFootprintsBoundsKey = "";
  private lastFootprintsCount = -1;

  private visSourceHash = -1;
  private visBoundsKey = "";
  private lastHoverIJ = "";
  private visObjectCache = new Map<string, boolean>();
  private chunkLoadQueue: Array<{ cx: number; cy: number; key: string }> = [];
  private chunkLoadQueued = new Set<string>();

  constructor() {
    super("GameScene");
  }

  init(data: GameSceneInit): void {
    this.net = data.net;
    this.playerId = data.init.playerId;
    this.seed = data.init.seed;
    this.serverTick = data.init.tick;
    this.resources = data.init.resources.map((r) => ({ ...r }));
    this.collectedTotals = { ...(this.resources[this.playerId] ?? emptyResources()) };
    this.names = data.init.names;
    this.tribeLanguages = data.init.languages ?? [];
    this.botSlots = data.init.botSlots ?? [];
    this.removedKeys = new Set(
      data.init.removedObjects.map((o) => objKey(o.kind, o.i, o.j)),
    );
    this.footprints = [...data.init.footprints];
    this.pendingAnimals = data.init.animals;
    this.pendingCampfires = data.init.campfires ?? [];
  }

  create(): void {
    const initData = (this as Phaser.Scene).scene.settings.data as GameSceneInit;

    for (const u of initData.init.units) {
      this.units.set(u.id, new Unit(this, u, u.owner === this.playerId, this.seed));
      this.playerColors[u.owner] = u.color;
    }

    this.gameStartMs = Date.now();
    this.initialTribeSize = [...this.units.values()].filter(
      (u) => u.owner === this.playerId,
    ).length;
    this.maxTribeSize = this.initialTribeSize;

    for (const snap of this.pendingAnimals) {
      this.spawnAnimalLocal(snap);
    }
    this.pendingAnimals = [];
    for (const snap of this.pendingCampfires) {
      this.applyCampfireSnap(snap);
    }
    this.pendingCampfires = [];

    this.hoverTile = this.add.graphics();
    this.hoverTile.setDepth(-99999);

    this.footprintsGfx = this.add.graphics();
    this.footprintsGfx.setDepth(1_600_000);

    this.fog = this.add.graphics();
    this.fog.setDepth(1_500_000);

    this.selectionBox = this.add.graphics();
    this.selectionBox.setScrollFactor(0);
    this.selectionBox.setDepth(2_000_000);

    this.growthBeacon = this.add.graphics();
    this.growthBeacon.setDepth(1_700_000);
    this.growthBeacon.setVisible(false);

    this.tribeRallyGfx = this.add.graphics();
    this.tribeRallyGfx.setDepth(1_650_000);

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
    this.keyUp = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.keyDown = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.keyLeft = kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.keyRight = kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    kb.addCapture("UP,DOWN,LEFT,RIGHT");
    this.keyM = kb.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.keyM.on("down", () => this.toggleMinimap());

    const spectateKeys: Array<[number, number]> = [
      [Phaser.Input.Keyboard.KeyCodes.ONE, 0],
      [Phaser.Input.Keyboard.KeyCodes.TWO, 1],
      [Phaser.Input.Keyboard.KeyCodes.THREE, 2],
      [Phaser.Input.Keyboard.KeyCodes.FOUR, 3],
    ];
    for (const [code, idx] of spectateKeys) {
      kb.addKey(code).on("down", () => this.spectateBot(idx));
    }
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.ZERO).on("down", () =>
      this.stopSpectating(),
    );

    this.input.mouse?.disableContextMenu();
    this.input.addPointer(1);
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
        this.applyTribeFollow();
        cam.scrollX = this.camTargetX;
        cam.scrollY = this.camTargetY;
      },
    );

    this.net.onMessage((msg) => this.onServerMessage(msg));

    this.hud = document.getElementById("hud");
    if (this.hud) {
      this.hud.addEventListener("click", (e) => this.onHudClick(e));
    }
    this.minimapWrap = document.getElementById("minimap-wrap");
    this.minimapVisible = false;
    if (this.minimapWrap) this.minimapWrap.style.display = "none";

    this.updateChunks();
    this.updateFog();
    this.drawFootprints();
    this.updateHud();
  }

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (const u of this.units.values()) u.update(dt);
    for (const a of this.animals.values()) a.update(dt);
    for (const f of this.campfires.values()) f.update(dt);

    const cam = this.cameras.main;
    const speed = 600 / cam.zoom;
    this.applyEdgePan(dt, speed);
    this.applyTribeKeys(dt);
    if (!this.userPanned) this.applyTribeFollow();

    if (cam.zoom !== this.lastZoom) {
      this.lastZoom = cam.zoom;
      cam.scrollX = this.camTargetX;
      cam.scrollY = this.camTargetY;
    } else {
      const lerp = 1 - Math.pow(0.001, dt);
      cam.scrollX += (this.camTargetX - cam.scrollX) * lerp;
      cam.scrollY += (this.camTargetY - cam.scrollY) * lerp;
    }

    this.updateChunks();
    this.updateFog();
    this.drawFootprints();
    this.updateGrowthBeacon(dt);
    this.updateTribeRally(dt);
  }

  private updateTribeRally(dt: number): void {
    this.tribeRallyPhase = (this.tribeRallyPhase + dt * 1.4) % (Math.PI * 2);
    const pulse = 0.55 + 0.35 * Math.sin(this.tribeRallyPhase);
    const g = this.tribeRallyGfx;
    g.clear();

    const centers = new Map<number, { cx: number; cy: number; n: number }>();
    for (const u of this.units.values()) {
      let c = centers.get(u.owner);
      if (!c) {
        c = { cx: 0, cy: 0, n: 0 };
        centers.set(u.owner, c);
      }
      c.cx += u.gx;
      c.cy += u.gy;
      c.n++;
    }

    for (const [owner, c] of centers) {
      if (c.n < 2) continue;
      const ax = c.cx / c.n;
      const ay = c.cy / c.n;
      const ti = Math.floor(ax);
      const tj = Math.floor(ay);
      const color = this.playerColors[owner] ?? 0xffffff;
      const { x, y } = gridToScreen(ti, tj);
      const drawDiamond = () => {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + TILE_W / 2, y + TILE_H / 2);
        g.lineTo(x, y + TILE_H);
        g.lineTo(x - TILE_W / 2, y + TILE_H / 2);
        g.closePath();
      };
      g.fillStyle(color, 0.18 * pulse + 0.1);
      drawDiamond();
      g.fillPath();
      g.lineStyle(2, color, 0.55 + 0.3 * pulse);
      drawDiamond();
      g.strokePath();
    }
  }

  private updateGrowthBeacon(dt: number): void {
    const progress = this.growthProgress[this.playerId] ?? 0;
    const active = this.growthActive[this.playerId] ?? false;
    if (!active || progress < 0.8) {
      if (this.growthBeacon.visible) {
        this.growthBeacon.clear();
        this.growthBeacon.setVisible(false);
      }
      return;
    }
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (const u of this.units.values()) {
      if (u.owner !== this.playerId) continue;
      cx += u.gx;
      cy += u.gy;
      n++;
    }
    if (n === 0) {
      if (this.growthBeacon.visible) {
        this.growthBeacon.clear();
        this.growthBeacon.setVisible(false);
      }
      return;
    }
    cx /= n;
    cy /= n;
    const center = gridToScreen(cx, cy);

    this.growthBeaconPhase += dt * 1.6;
    const phase = (Math.sin(this.growthBeaconPhase * Math.PI) + 1) / 2;
    const baseRadius = TILE_W * 0.55;
    const r1 = baseRadius * (0.9 + phase * 0.35);
    const r2 = baseRadius * (1.1 + phase * 0.6);
    const a1 = 0.45 + phase * 0.3;
    const a2 = 0.25 * (1 - phase);

    this.growthBeacon.setVisible(true);
    this.growthBeacon.clear();
    this.growthBeacon.lineStyle(2, 0xffd84d, a1);
    this.growthBeacon.strokeEllipse(center.x, center.y - 4, r1 * 2, r1);
    this.growthBeacon.lineStyle(2, 0xffd84d, a2);
    this.growthBeacon.strokeEllipse(center.x, center.y - 4, r2 * 2, r2);
  }

  private toggleMinimap(): void {
    if (!this.minimapCanvas) return;
    this.minimapVisible = !this.minimapVisible;
    if (this.minimapWrap) {
      this.minimapWrap.style.display = this.minimapVisible ? "block" : "none";
    }
  }

  private spectateBot(index: number): void {
    const slot = this.botSlots[index];
    if (slot === undefined) return;
    this.spectateSlot(slot);
  }

  private spectateSlot(slot: PlayerId): void {
    if (slot === this.playerId) {
      this.stopSpectating();
      return;
    }
    if (!this.botSlots.includes(slot)) return;
    if (this.spectatorTarget === slot) {
      this.stopSpectating();
      return;
    }
    this.spectatorTarget = slot;
    this.userPanned = false;
    this.visObjectCache.clear();
    this.visSourceHash = -1;
    const name = this.names[slot] || `Stamm ${slot}`;
    this.showToast(`Beobachte: ${name}`, "join");
    this.updateHud();
  }

  private stopSpectating(): void {
    if (this.spectatorTarget === null) return;
    this.spectatorTarget = null;
    this.userPanned = false;
    this.visObjectCache.clear();
    this.visSourceHash = -1;
    this.showToast("Zurück zu deinem Stamm", "join");
    this.updateHud();
  }

  private cameraFollowOwner(): PlayerId {
    return this.spectatorTarget ?? this.playerId;
  }

  private onHudClick(e: MouseEvent): void {
    const target = (e.target as HTMLElement | null)?.closest(
      "[data-spectate-slot]",
    ) as HTMLElement | null;
    if (!target) return;
    const raw = target.getAttribute("data-spectate-slot");
    if (raw === null) return;
    e.stopPropagation();
    const slot = Number(raw);
    if (!Number.isFinite(slot)) return;
    this.spectateSlot(slot);
  }

  private applyTribeKeys(dt: number): void {
    const right = this.keyD.isDown || this.keyRight.isDown;
    const left = this.keyA.isDown || this.keyLeft.isDown;
    const down = this.keyS.isDown || this.keyDown.isDown;
    const up = this.keyW.isDown || this.keyUp.isDown;
    const dx = (right ? 1 : 0) - (left ? 1 : 0);
    const dy = (down ? 1 : 0) - (up ? 1 : 0);
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

    let chief: Unit | null = null;
    for (const u of this.units.values()) {
      if (u.owner !== this.playerId) continue;
      if (u.isChief) {
        chief = u;
        break;
      }
    }
    if (!chief) return;

    const stepDist = 8;
    const ti = Math.floor(chief.gx + (gdx / len) * stepDist);
    const tj = Math.floor(chief.gy + (gdy / len) * stepDist);
    this.net.send({ type: "move", unitIds: [chief.id], i: ti, j: tj });
  }

  private applyTribeFollow(): void {
    const owner = this.cameraFollowOwner();
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (const u of this.units.values()) {
      if (u.owner !== owner) continue;
      cx += u.gx;
      cy += u.gy;
      n++;
    }
    if (n === 0) return;
    cx /= n;
    cy /= n;
    const w = gridToScreen(cx, cy);
    const h = groundHeight(this.seed, cx, cy);
    const cam = this.cameras.main;
    this.camTargetX = w.x - cam.width / 2;
    this.camTargetY = w.y - h - cam.height / 2;
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

    const cam = this.cameras.main;
    const centerX = cam.scrollX + cam.width / 2;
    const centerY = cam.scrollY + cam.height / 2;

    const needed = new Set<string>();
    const toQueue: Array<{ cx: number; cy: number; key: string; d: number }> = [];
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = `${cx},${cy}`;
        needed.add(key);
        if (this.chunks.has(key) || this.chunkLoadQueued.has(key)) continue;
        const chunkCx = (cx + 0.5) * CHUNK_SIZE;
        const chunkCy = (cy + 0.5) * CHUNK_SIZE;
        const sx = (chunkCx - chunkCy) * (TILE_W / 2);
        const sy = (chunkCx + chunkCy) * (TILE_H / 2);
        const dx = sx - centerX;
        const dy = sy - centerY;
        toQueue.push({ cx, cy, key, d: dx * dx + dy * dy });
      }
    }
    if (toQueue.length > 0) {
      toQueue.sort((a, b) => a.d - b.d);
      for (const c of toQueue) {
        this.chunkLoadQueue.push({ cx: c.cx, cy: c.cy, key: c.key });
        this.chunkLoadQueued.add(c.key);
      }
    }

    for (const [key, chunk] of this.chunks) {
      if (!needed.has(key)) this.unloadChunk(key, chunk);
    }

    if (this.chunkLoadQueue.length > 0) {
      const budget = this.chunks.size === 0 ? this.chunkLoadQueue.length : 1;
      for (let i = 0; i < budget && this.chunkLoadQueue.length > 0; i++) {
        const next = this.chunkLoadQueue.shift()!;
        this.chunkLoadQueued.delete(next.key);
        if (!needed.has(next.key)) continue;
        this.loadChunk(next.cx, next.cy);
      }
    }
  }

  private loadChunk(cx: number, cy: number): void {
    const S = CHUNK_SIZE;
    const PAD = 16;
    const ofx = ((cx - cy) * S - (S - 1)) * (TILE_W / 2) - TILE_W / 2 - PAD;
    const ofy = (cx + cy) * S * (TILE_H / 2) - MAX_TERRAIN_HEIGHT_PX - PAD;
    const w = TILE_W * S + 2 * PAD;
    const h = TILE_H * S + MAX_TERRAIN_HEIGHT_PX + 2 * PAD;

    const rt = this.add.renderTexture(ofx, ofy, w, h);
    rt.setOrigin(0, 0);
    rt.setDepth(-100000);

    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const trees = new Map<string, Tree>();
    const bushes = new Map<string, Bush>();
    const mushrooms = new Map<string, Mushroom>();
    const fishes = new Map<string, Fish>();
    const stones = new Map<string, Stone>();
    const i0 = cx * CHUNK_SIZE;
    const j0 = cy * CHUNK_SIZE;
    for (let dj = 0; dj < CHUNK_SIZE; dj++) {
      for (let di = 0; di < CHUNK_SIZE; di++) {
        const i = i0 + di;
        const j = j0 + dj;
        this.drawTile(g, g, i, j);
        if (hasTreeAt(this.seed, i, j)) {
          const id = objKey("tree", i, j);
          if (!this.removedKeys.has(id) && !this.trees.has(id)) {
            const t = new Tree(this, id, i, j, this.seed);
            trees.set(id, t);
            this.trees.set(id, t);
          }
        } else if (hasBushAt(this.seed, i, j)) {
          const id = objKey("bush", i, j);
          if (!this.removedKeys.has(id) && !this.bushes.has(id)) {
            const b = new Bush(this, i, j, this.seed);
            bushes.set(id, b);
            this.bushes.set(id, b);
          }
        } else if (hasMushroomAt(this.seed, i, j)) {
          const id = objKey("mushroom", i, j);
          if (!this.removedKeys.has(id) && !this.mushrooms.has(id)) {
            const m = new Mushroom(this, i, j, this.seed);
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
        } else if (hasStoneAt(this.seed, i, j)) {
          const id = objKey("stone", i, j);
          if (!this.removedKeys.has(id) && !this.stones.has(id)) {
            const s = new Stone(this, i, j, this.seed);
            stones.set(id, s);
            this.stones.set(id, s);
          }
        }
      }
    }
    rt.draw(g, -ofx, -ofy);
    g.destroy();
    this.chunks.set(`${cx},${cy}`, {
      cx, cy, rt,
      trees, bushes, mushrooms, fishes, stones,
    });
  }

  private unloadChunk(key: string, chunk: Chunk): void {
    chunk.rt.destroy();
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
    for (const [sid, s] of chunk.stones) {
      s.container.destroy();
      s.shadow.destroy();
      this.stones.delete(sid);
    }
    this.chunks.delete(key);
  }

  private drawTile(
    g: Phaser.GameObjects.Graphics,
    _elev: Phaser.GameObjects.Graphics,
    i: number,
    j: number,
  ): void {
    const { x, y } = gridToScreen(i, j);
    const biome = biomeAt(this.seed, i, j);
    const palette = BIOME_PALETTES[biome];
    const variant = tileVariant(this.seed, i, j) % palette.length;
    const fill = palette[variant];
    const isWater = biome === "lake" || biome === "river";

    const hN = isWater ? 0 : heightAt(this.seed, i, j);
    const hE = isWater ? 0 : heightAt(this.seed, i + 1, j);
    const hS = isWater ? 0 : heightAt(this.seed, i + 1, j + 1);
    const hW = isWater ? 0 : heightAt(this.seed, i, j + 1);
    const avgH = (hN + hE + hS + hW) * 0.25;

    let tileFill = fill;
    if (isWater) {
      tileFill = this.waterShadeAt(i, j);
    } else {
      const SLOPE_SCALE = 16;
      const slopeY = (hS - hN) / SLOPE_SCALE;
      const slopeX = (hE - hW) / SLOPE_SCALE;
      const light = Phaser.Math.Clamp(slopeY * 0.55 + slopeX * 0.35, -0.55, 0.55);
      const elevTint = (avgH / MAX_TERRAIN_HEIGHT_PX) * 0.15;
      const brightness = Phaser.Math.Clamp(1 + light + elevTint, 0.45, 1.45);
      tileFill = shadeColor(fill, brightness);
    }

    g.fillStyle(tileFill, 1);
    g.beginPath();
    g.moveTo(x, y - hN);
    g.lineTo(x + TILE_W / 2, y + TILE_H / 2 - hE);
    g.lineTo(x, y + TILE_H - hS);
    g.lineTo(x - TILE_W / 2, y + TILE_H / 2 - hW);
    g.closePath();
    g.fillPath();
    if (isWater) {
      g.lineStyle(1, 0x16304a, 0.2);
      g.strokePath();
    }

    const decor = tileDecor(this.seed, i, j);
    const dx = (((decor >> 5) & 0xff) / 255 - 0.5) * TILE_W * 0.4;
    const dy = (((decor >> 13) & 0xff) / 255 - 0.5) * TILE_H * 0.4;
    const cy = y + TILE_H / 2 - avgH;

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
    } else if (biome === "felsen") {
      const r = ((decor >> 3) & 0xff) / 255;
      g.fillStyle(0x4a4a4a, 0.85);
      g.fillCircle(x + dx, cy + dy, 2 + r * 1.5);
      g.fillStyle(0x9a9a9a, 0.6);
      g.fillCircle(x + dx - 1.5, cy + dy - 1, 1.2);
      if ((decor >> 11) % 5 === 0) {
        g.fillStyle(0x3a3a3a, 0.8);
        g.fillCircle(x + dx + 4, cy + dy + 2, 1.4);
      }
    } else if (biome === "gebirge") {
      const r = ((decor >> 3) & 0xff) / 255;
      g.fillStyle(0x2a2a2a, 0.9);
      g.fillTriangle(
        x + dx, cy + dy - 4 - r * 2,
        x + dx - 3, cy + dy + 1,
        x + dx + 3, cy + dy + 1,
      );
      g.fillStyle(0xb0b0b0, 0.55);
      g.fillTriangle(
        x + dx - 0.4, cy + dy - 3 - r * 2,
        x + dx - 1.4, cy + dy + 0.5,
        x + dx + 0.5, cy + dy + 0.5,
      );
    } else if (biome === "canyon") {
      g.fillStyle(0x4a2a18, 0.65);
      g.fillRect(x + dx - 4, cy + dy, 8, 1.2);
      if ((decor >> 11) % 3 === 0) {
        g.fillStyle(0x2e1a10, 0.7);
        g.fillRect(x + dx - 2, cy + dy + 2, 4, 0.8);
      }
      g.fillStyle(0xd28a58, 0.4);
      g.fillCircle(x + dx + 1, cy + dy - 1.4, 1.2);
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

  private isSightSource(owner: PlayerId): boolean {
    return owner === this.playerId || owner === this.spectatorTarget;
  }

  private updateFog(): void {
    let srcHash = 0;
    for (const u of this.units.values()) {
      if (!this.isSightSource(u.owner)) continue;
      const fi = Math.floor(u.gx);
      const fj = Math.floor(u.gy);
      srcHash = (Math.imul(srcHash, 31) + fi) | 0;
      srcHash = (Math.imul(srcHash, 31) + fj) | 0;
    }

    const { i0, i1, j0, j1 } = this.viewTileBounds();
    const boundsKey = `${i0},${i1},${j0},${j1}`;

    const sourceChanged = srcHash !== this.visSourceHash;
    const boundsChanged = boundsKey !== this.visBoundsKey;
    if (!sourceChanged && !boundsChanged) {
      this.applyDynamicVisibility();
      return;
    }

    if (sourceChanged) {
      this.visible.clear();
      for (const u of this.units.values()) {
        if (!this.isSightSource(u.owner)) continue;
        const r = SIGHT_RADIUS;
        const r2 = r * r;
        const cx = u.gx;
        const cy = u.gy;
        const ii0 = Math.floor(cx - r);
        const ii1 = Math.floor(cx + r);
        const jj0 = Math.floor(cy - r);
        const jj1 = Math.floor(cy + r);
        for (let j = jj0; j <= jj1; j++) {
          for (let i = ii0; i <= ii1; i++) {
            const dx = i + 0.5 - cx;
            const dy = j + 0.5 - cy;
            if (dx * dx + dy * dy <= r2) {
              const k = `${i},${j}`;
              if (!this.visible.has(k)) {
                this.visible.add(k);
                this.explored.add(k);
              }
            }
          }
        }
      }
      this.visSourceHash = srcHash;
    }

    const exploredSize = this.explored.size;
    const fogChanged =
      boundsChanged ||
      sourceChanged ||
      exploredSize !== this.lastFogExploredSize;

    if (fogChanged) {
      this.lastFogBoundsKey = boundsKey;
      this.lastFogVisibleHash = srcHash;
      this.lastFogExploredSize = exploredSize;
      this.fog.clear();
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const k = `${i},${j}`;
          if (this.visible.has(k)) continue;
          const ex = this.explored.has(k);
          const { x, y } = gridToScreen(i, j);
          const hN = heightAt(this.seed, i, j);
          const hE = heightAt(this.seed, i + 1, j);
          const hS = heightAt(this.seed, i + 1, j + 1);
          const hW = heightAt(this.seed, i, j + 1);
          if (ex) {
            this.fog.fillStyle(0x808080, 0.55);
          } else {
            this.fog.fillStyle(0x000000, 1);
          }
          this.fog.beginPath();
          this.fog.moveTo(x, y - hN);
          this.fog.lineTo(x + TILE_W / 2, y + TILE_H / 2 - hE);
          this.fog.lineTo(x, y + TILE_H - hS);
          this.fog.lineTo(x - TILE_W / 2, y + TILE_H / 2 - hW);
          this.fog.closePath();
          this.fog.fillPath();
        }
      }
    }

    this.visBoundsKey = boundsKey;
    this.applyStaticVisibility();
    this.applyDynamicVisibility();
  }

  private applyStaticVisibility(): void {
    const cache = this.visObjectCache;
    for (const t of this.trees.values()) {
      const key = `t:${t.i},${t.j}`;
      const v = this.visible.has(`${t.i},${t.j}`);
      if (cache.get(key) === v) continue;
      cache.set(key, v);
      t.container.setVisible(v);
      t.shadow.setVisible(v);
    }
    for (const b of this.bushes.values()) {
      const key = `b:${b.i},${b.j}`;
      const v = this.visible.has(`${b.i},${b.j}`);
      if (cache.get(key) === v) continue;
      cache.set(key, v);
      b.container.setVisible(v);
      b.shadow.setVisible(v);
    }
    for (const m of this.mushrooms.values()) {
      const key = `m:${m.i},${m.j}`;
      const v = this.visible.has(`${m.i},${m.j}`);
      if (cache.get(key) === v) continue;
      cache.set(key, v);
      m.container.setVisible(v);
      m.shadow.setVisible(v);
    }
    for (const f of this.fishes.values()) {
      const key = `f:${f.i},${f.j}`;
      const v = this.visible.has(`${f.i},${f.j}`);
      if (cache.get(key) === v) continue;
      cache.set(key, v);
      f.container.setVisible(v);
      f.shadow.setVisible(v);
    }
    for (const s of this.stones.values()) {
      const key = `s:${s.i},${s.j}`;
      const v = this.visible.has(`${s.i},${s.j}`);
      if (cache.get(key) === v) continue;
      cache.set(key, v);
      s.container.setVisible(v);
      s.shadow.setVisible(v);
    }
  }

  private applyDynamicVisibility(): void {
    const cache = this.visObjectCache;
    for (const u of this.units.values()) {
      const key = `u:${u.id}`;
      let v: boolean;
      if (this.isSightSource(u.owner)) {
        v = true;
      } else {
        const i = Math.floor(u.gx);
        const j = Math.floor(u.gy);
        v = this.visible.has(`${i},${j}`);
      }
      if (cache.get(key) === v) continue;
      cache.set(key, v);
      u.container.setVisible(v);
    }
    for (const a of this.animals.values()) {
      const key = `a:${a.id}`;
      const i = Math.floor(a.gx);
      const j = Math.floor(a.gy);
      const v = this.visible.has(`${i},${j}`);
      if (cache.get(key) === v) continue;
      cache.set(key, v);
      a.container.setVisible(v);
    }
    for (const f of this.campfires.values()) {
      const key = `cf:${f.id}`;
      const i = Math.floor(f.gx);
      const j = Math.floor(f.gy);
      const v = this.visible.has(`${i},${j}`);
      if (cache.get(key) === v) continue;
      cache.set(key, v);
      f.container.setVisible(v);
      f.shadow.setVisible(v);
    }
  }

  private drawFootprints(): void {
    const cutoff = this.serverTick - FOOTPRINT_LIFETIME_TICKS;
    let drop = 0;
    while (drop < this.footprints.length && this.footprints[drop].t < cutoff) drop++;
    if (drop > 0) this.footprints.splice(0, drop);

    const { i0, i1, j0, j1 } = this.viewTileBounds();
    const boundsKey = `${i0},${i1},${j0},${j1}`;
    const changed =
      this.serverTick !== this.lastFootprintsTick ||
      boundsKey !== this.lastFootprintsBoundsKey ||
      this.footprints.length !== this.lastFootprintsCount;
    if (!changed) return;
    this.lastFootprintsTick = this.serverTick;
    this.lastFootprintsBoundsKey = boundsKey;
    this.lastFootprintsCount = this.footprints.length;

    this.footprintsGfx.clear();
    if (this.footprints.length === 0) return;

    for (const fp of this.footprints) {
      if (fp.i < i0 || fp.i > i1 || fp.j < j0 || fp.j > j1) continue;
      const age = this.serverTick - fp.t;
      const lifeFrac = 1 - age / FOOTPRINT_LIFETIME_TICKS;
      if (lifeFrac <= 0) continue;
      const ageFrac = 1 - lifeFrac;
      const color = lerpColor(0xb8895a, 0x2a1808, ageFrac);
      const alpha = 0.55 + 0.3 * lifeFrac;
      const { x, y } = gridToScreen(fp.i + 0.5, fp.j + 0.5);
      const cy = y + TILE_H / 2 - 1;
      const seed = (fp.i * 73 + fp.j * 19 + fp.t) | 0;
      const side = (seed & 1) ? 1 : -1;
      const ang = (((seed >> 1) & 0x7) / 8 - 0.5) * 0.6;
      this.drawFootprint(x - 2 * side, cy - 1, ang, color, alpha);
      this.drawFootprint(x + 2 * side, cy + 2, ang, color, alpha * 0.85);
    }
  }

  private drawFootprint(
    cx: number,
    cy: number,
    angle: number,
    color: number,
    alpha: number,
  ): void {
    const g = this.footprintsGfx;
    const cs = Math.cos(angle);
    const sn = Math.sin(angle);
    const rot = (px: number, py: number): { x: number; y: number } => ({
      x: cx + px * cs - py * sn,
      y: cy + px * sn + py * cs,
    });
    g.fillStyle(color, alpha);
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

  private onMinimapClick(e: MouseEvent | PointerEvent): void {
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
    this.camTargetX = target.x - cam.width / 2;
    this.camTargetY = target.y - cam.height / 2;
    this.userPanned = true;
  }

  private onServerMessage(msg: ServerMessage): void {
    if (msg.type === "state") this.applyState(msg);
    else if (msg.type === "opponentJoined") this.onOpponentJoined(msg);
    else if (msg.type === "opponentLeft") this.onOpponentLeft(msg);
    else if (msg.type === "leaderboard") this.onLeaderboard(msg);
  }

  private onOpponentJoined(msg: {
    playerId: PlayerId;
    name: string;
    language?: string;
    units: import("../../shared/protocol").UnitSnapshot[];
  }): void {
    this.names[msg.playerId] = msg.name;
    if (msg.language) this.tribeLanguages[msg.playerId] = msg.language;
    for (const snap of msg.units) {
      this.playerColors[snap.owner] = snap.color;
      if (!this.units.has(snap.id)) {
        this.units.set(snap.id, new Unit(this, snap, snap.owner === this.playerId, this.seed));
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

  private showToast(
    text: string,
    kind: "join" | "leave" | "grow" | "death" | "extinct",
  ): void {
    const root = document.getElementById("toasts");
    if (!root) return;
    const el = document.createElement("div");
    const cls = kind === "join" ? "" : kind;
    el.className = `toast ${cls}`.trim();
    el.textContent = text;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    const lifetime = kind === "extinct" ? 6000 : 4000;
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 250);
    }, lifetime);
  }

  private applyState(msg: StateMessage): void {
    this.serverTick = msg.tick;
    if (msg.encounters && msg.encounters.length > 0) {
      for (const ev of msg.encounters) {
        if (ev.a !== this.playerId && ev.b !== this.playerId) continue;
        const otherId = ev.a === this.playerId ? ev.b : ev.a;
        const myGain =
          ev.a === this.playerId ? ev.transfersBtoA : ev.transfersAtoB;
        const myLoss =
          ev.a === this.playerId ? ev.transfersAtoB : ev.transfersBtoA;
        const name = this.names[otherId] || "anderem Stamm";
        const parts: string[] = [`Begegnung mit Stamm von ${name}`];
        if (myGain > 0) {
          parts.push(
            myGain === 1
              ? "eine Frau ist zu dir gewechselt"
              : `${myGain} Frauen sind zu dir gewechselt`,
          );
        }
        if (myLoss > 0) {
          parts.push(
            myLoss === 1
              ? "eine Frau hat deinen Stamm verlassen"
              : `${myLoss} Frauen haben deinen Stamm verlassen`,
          );
        }
        this.showToast(parts.join(": "), "join");
      }
    }
    if (msg.newUnits && msg.newUnits.length > 0) {
      let ownGrew = 0;
      const otherGrew: Record<number, number> = {};
      for (const snap of msg.newUnits) {
        if (this.units.has(snap.id)) continue;
        this.units.set(
          snap.id,
          new Unit(this, snap, snap.owner === this.playerId, this.seed),
        );
        if (snap.owner === this.playerId) ownGrew++;
        else otherGrew[snap.owner] = (otherGrew[snap.owner] ?? 0) + 1;
      }
      if (ownGrew > 0) {
        const txt =
          ownGrew === 1
            ? "Dein Stamm wächst: ein neues Mitglied ist dazugekommen"
            : `Dein Stamm wächst: ${ownGrew} neue Mitglieder sind dazugekommen`;
        this.showToast(txt, "grow");
      }
      for (const ownerStr of Object.keys(otherGrew)) {
        const owner = Number(ownerStr);
        const n = otherGrew[owner];
        const name = this.names[owner] || `Stamm ${owner}`;
        const txt =
          n === 1
            ? `Stamm von ${name} wächst: ein neues Mitglied`
            : `Stamm von ${name} wächst: ${n} neue Mitglieder`;
        this.showToast(txt, "grow");
      }
    }
    if (msg.outOfSightUnitIds && msg.outOfSightUnitIds.length > 0) {
      for (const id of msg.outOfSightUnitIds) {
        const u = this.units.get(id);
        if (!u) continue;
        if (u.owner === this.playerId) continue;
        u.destroy();
        this.units.delete(id);
        this.visObjectCache.delete(`u:${id}`);
      }
    }
    for (const snap of msg.units) {
      const u = this.units.get(snap.id);
      if (!u) {
        const isLocalNew = snap.owner === this.playerId;
        this.playerColors[snap.owner] = snap.color;
        this.units.set(
          snap.id,
          new Unit(this, snap, isLocalNew, this.seed),
        );
        continue;
      }
      const isLocal = snap.owner === this.playerId;
      if (u.owner === this.playerId && !isLocal && u.selected) {
        u.setSelected(false);
      }
      u.applySnapshot(snap, isLocal);
    }
    for (const ro of msg.newRemovedObjects) {
      this.applyRemoved(ro);
    }
    for (const ro of msg.respawnedObjects) {
      this.applyRespawn(ro);
    }
    for (const fp of msg.newFootprints) {
      this.footprints.push(fp);
    }
    for (const id of msg.removedAnimalIds) {
      const a = this.animals.get(id);
      if (a) {
        a.destroy();
        this.animals.delete(id);
      }
    }
    let ownDied = 0;
    const otherDied: Record<number, number> = {};
    for (const id of msg.deadUnitIds) {
      const u = this.units.get(id);
      if (!u) continue;
      if (u.owner === this.playerId) ownDied++;
      else otherDied[u.owner] = (otherDied[u.owner] ?? 0) + 1;
      this.units.delete(id);
      u.die(() => {});
    }
    const extinctSet = new Set<number>(msg.extinctTribes ?? []);
    if (ownDied > 0 && !extinctSet.has(this.playerId)) {
      const txt =
        ownDied === 1
          ? "Aus deinem Stamm ist ein Mitglied gestorben"
          : `Aus deinem Stamm sind ${ownDied} Mitglieder gestorben`;
      this.showToast(txt, "death");
    }
    for (const ownerStr of Object.keys(otherDied)) {
      const owner = Number(ownerStr);
      if (extinctSet.has(owner)) continue;
      const n = otherDied[owner];
      const name = this.names[owner] || `Stamm ${owner}`;
      const txt =
        n === 1
          ? `Im Stamm von ${name} ist ein Mitglied gestorben`
          : `Im Stamm von ${name} sind ${n} Mitglieder gestorben`;
      this.showToast(txt, "death");
    }
    if (msg.extinctTribes && msg.extinctTribes.length > 0) {
      for (const owner of msg.extinctTribes) {
        if (owner === this.playerId) continue;
        const name = this.names[owner] || `Stamm ${owner}`;
        this.showToast(`Stamm von ${name} ist ausgestorben`, "extinct");
      }
    }
    if (msg.newUnits && msg.newUnits.length > 0) {
      const myCount = [...this.units.values()].filter(
        (u) => u.owner === this.playerId,
      ).length;
      if (myCount > this.maxTribeSize) this.maxTribeSize = myCount;
    }
    if (msg.deadUnitIds.length > 0) this.checkGameOver();
    for (const snap of msg.animals) {
      const a = this.animals.get(snap.id);
      if (a) a.applySnapshot(snap);
      else this.spawnAnimalLocal(snap);
    }
    if (msg.campfires) {
      for (const snap of msg.campfires) this.applyCampfireSnap(snap);
    }
    if (msg.removedCampfireIds) {
      for (const id of msg.removedCampfireIds) {
        const f = this.campfires.get(id);
        if (!f) continue;
        f.remove();
        this.campfires.delete(id);
        this.visObjectCache.delete(`cf:${id}`);
      }
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
      const myPrev = this.resources[this.playerId];
      const myNew = msg.resources[this.playerId];
      if (myPrev && myNew) {
        for (const k of RESOURCE_KEYS) {
          const delta = myNew[k] - myPrev[k];
          if (delta > 0) this.collectedTotals[k] += delta;
        }
      }
      this.resources = msg.resources;
      this.updateHud();
    }

    const myProgPrev = this.growthProgress[this.playerId] ?? 0;
    const myActivePrev = this.growthActive[this.playerId] ?? false;
    if (msg.growthProgress) this.growthProgress = msg.growthProgress;
    if (msg.growthActive) this.growthActive = msg.growthActive;
    const myProg = this.growthProgress[this.playerId] ?? 0;
    const myActive = this.growthActive[this.playerId] ?? false;
    if (
      Math.abs(myProg - myProgPrev) > 0.005 ||
      myActive !== myActivePrev
    ) {
      this.updateHud();
    }
  }

  private spawnAnimalLocal(snap: AnimalSnapshot): void {
    const a = new Animal(this, snap, this.seed);
    this.animals.set(snap.id, a);
  }

  private applyCampfireSnap(snap: CampfireSnapshot): void {
    const existing = this.campfires.get(snap.id);
    if (existing) {
      existing.applyState(snap.gx, snap.gy, snap.fuel);
      return;
    }
    const f = new Campfire(this, snap.id, snap.gx, snap.gy, snap.fuel, this.seed);
    this.campfires.set(snap.id, f);
  }

  private animalAt(i: number, j: number): string | null {
    let best: { id: string; d: number } | null = null;
    for (const a of this.animals.values()) {
      if (Math.floor(a.gx) !== i || Math.floor(a.gy) !== j) continue;
      const dx = a.gx - (i + 0.5);
      const dy = a.gy - (j + 0.5);
      const d = dx * dx + dy * dy;
      if (!best || d < best.d) best = { id: a.id, d };
    }
    return best?.id ?? null;
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
    } else if (ro.kind === "fish") {
      const f = this.fishes.get(k);
      if (f) {
        f.remove();
        this.fishes.delete(k);
        for (const c of this.chunks.values()) c.fishes.delete(k);
      }
    } else {
      const s = this.stones.get(k);
      if (s) {
        s.remove();
        this.stones.delete(k);
        for (const c of this.chunks.values()) c.stones.delete(k);
      }
    }
  }

  private applyRespawn(ro: RemovedObject): void {
    const k = objKey(ro.kind, ro.i, ro.j);
    if (!this.removedKeys.has(k)) return;
    this.removedKeys.delete(k);
    const cx = Math.floor(ro.i / CHUNK_SIZE);
    const cy = Math.floor(ro.j / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return;
    const v = this.visible.has(`${ro.i},${ro.j}`);
    if (ro.kind === "mushroom") {
      if (this.mushrooms.has(k)) return;
      const m = new Mushroom(this, ro.i, ro.j, this.seed);
      chunk.mushrooms.set(k, m);
      this.mushrooms.set(k, m);
      m.container.setVisible(v);
      m.shadow.setVisible(v);
    } else if (ro.kind === "bush") {
      if (this.bushes.has(k)) return;
      const b = new Bush(this, ro.i, ro.j, this.seed);
      chunk.bushes.set(k, b);
      this.bushes.set(k, b);
      b.container.setVisible(v);
      b.shadow.setVisible(v);
    } else if (ro.kind === "tree") {
      if (this.trees.has(k)) return;
      const t = new Tree(this, k, ro.i, ro.j, this.seed);
      chunk.trees.set(k, t);
      this.trees.set(k, t);
      t.container.setVisible(v);
      t.shadow.setVisible(v);
    } else if (ro.kind === "stone") {
      if (this.stones.has(k)) return;
      const s = new Stone(this, ro.i, ro.j, this.seed);
      chunk.stones.set(k, s);
      this.stones.set(k, s);
      s.container.setVisible(v);
      s.shadow.setVisible(v);
    }
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (p.wasTouch) {
      this.onTouchDown(p);
      return;
    }
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

  private onTouchDown(p: Phaser.Input.Pointer): void {
    this.lastPointerScreenX = -1;
    this.lastPointerScreenY = -1;
    const p1 = this.input.pointer1;
    const p2 = this.input.pointer2;
    if (p1.isDown && p2.isDown) {
      const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
      this.pinch = { startDist: Math.max(1, dist), startZoom: this.cameras.main.zoom };
      this.touchPan = null;
      return;
    }
    this.pinch = null;
    this.touchPan = { lastX: p.x, lastY: p.y, startX: p.x, startY: p.y, moved: false };
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (p.wasTouch) {
      this.onTouchMove(p);
      return;
    }
    this.lastPointerScreenX = p.x;
    this.lastPointerScreenY = p.y;
    const { gx, gy } = screenToGrid(p.worldX, p.worldY);
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const ijKey = `${i},${j}`;
    if (ijKey !== this.lastHoverIJ) {
      this.lastHoverIJ = ijKey;
      this.drawHover(i, j);
    }

    if (!this.drag) return;
    const dx = p.x - this.drag.startX;
    const dy = p.y - this.drag.startY;
    if (Math.hypot(dx, dy) > 8) this.drag.isBox = true;
    if (this.drag.isBox) this.drawSelectionBox(p);
  }

  private onTouchMove(p: Phaser.Input.Pointer): void {
    const p1 = this.input.pointer1;
    const p2 = this.input.pointer2;

    if (this.pinch && p1.isDown && p2.isDown) {
      const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
      const cam = this.cameras.main;
      const next = this.pinch.startZoom * (dist / this.pinch.startDist);
      cam.setZoom(Phaser.Math.Clamp(next, 0.5, 2.5));
      this.userPanned = true;
      return;
    }

    if (!this.touchPan) return;
    const dxScreen = p.x - this.touchPan.lastX;
    const dyScreen = p.y - this.touchPan.lastY;
    this.touchPan.lastX = p.x;
    this.touchPan.lastY = p.y;
    if (!this.touchPan.moved) {
      const totalDx = p.x - this.touchPan.startX;
      const totalDy = p.y - this.touchPan.startY;
      if (Math.hypot(totalDx, totalDy) > 8) this.touchPan.moved = true;
    }
    if (!this.touchPan.moved) return;
    const cam = this.cameras.main;
    cam.scrollX -= dxScreen / cam.zoom;
    cam.scrollY -= dyScreen / cam.zoom;
    this.camTargetX = cam.scrollX;
    this.camTargetY = cam.scrollY;
    this.userPanned = true;
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (p.wasTouch) {
      this.onTouchUp(p);
      return;
    }
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

  private onTouchUp(p: Phaser.Input.Pointer): void {
    const p1 = this.input.pointer1;
    const p2 = this.input.pointer2;
    if (this.pinch && (!p1.isDown || !p2.isDown)) {
      this.pinch = null;
      this.touchPan = null;
      return;
    }
    if (!this.touchPan) return;
    if (!this.touchPan.moved) {
      this.commandAllUnits(p);
    }
    this.touchPan = null;
  }

  private commandAllUnits(p: Phaser.Input.Pointer): void {
    const ids = [...this.units.values()]
      .filter((u) => u.owner === this.playerId)
      .map((u) => u.id);
    if (ids.length === 0) return;
    const { gx, gy } = screenToGrid(p.worldX, p.worldY);
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const k = `${i},${j}`;
    const animalId = this.visible.has(k) ? this.animalAt(i, j) : null;
    if (animalId) {
      this.net.send({ type: "hunt", unitIds: ids, animalId });
    } else if (this.visible.has(k) && this.harvestableAt(i, j)) {
      this.net.send({ type: "harvest", unitIds: ids, i, j });
    } else {
      this.net.send({ type: "move", unitIds: ids, i, j });
    }
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
    const ids = selected.map((u) => u.id);
    const animalId = this.visible.has(k) ? this.animalAt(i, j) : null;
    if (animalId) {
      this.net.send({ type: "hunt", unitIds: ids, animalId });
    } else if (this.visible.has(k) && this.harvestableAt(i, j)) {
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
    if (
      hasStoneAt(this.seed, i, j) &&
      !this.removedKeys.has(objKey("stone", i, j))
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
      holz: 0, wasser: 0, beeren: 0, pilze: 0,
      fleisch: 0, fisch: 0, stein: 0,
    };
    const labels: Record<keyof Resources, string> = {
      holz: "Holz",
      wasser: "Wasser",
      beeren: "Beeren",
      pilze: "Pilze",
      fleisch: "Fleisch",
      fisch: "Fisch",
      stein: "Stein",
    };
    const resHtml = RESOURCE_KEYS.map(
      (k) =>
        `<div class="item"><span class="ico ${k}"></span>` +
        `<span class="label">${labels[k]}</span><b>${myRes[k]}</b></div>`,
    ).join("");

    const tribeCounts = this.tribeCounts;
    const countChip = (n: number) =>
      `<span class="count" title="Stammesmitglieder">👥 ${n}</span>`;

    const otherRows: string[] = [];
    for (let i = 0; i < this.names.length; i++) {
      if (i === this.playerId) continue;
      const n = this.names[i];
      if (!n) continue;
      const c = this.playerColorCss(i);
      const flag = this.flagFor(i);
      const isBot = this.botSlots.includes(i);
      const active = this.spectatorTarget === i;
      const cls =
        "row" +
        (isBot ? " clickable" : "") +
        (active ? " active" : "");
      const attr = isBot ? ` data-spectate-slot="${i}"` : "";
      const eye = isBot ? `<span class="eye">${active ? "◉" : "◎"}</span>` : "";
      otherRows.push(
        `<div class="${cls}"${attr}><span class="swatch" style="background:${c}"></span>` +
          `${flag ? `<span class="flag" title="${LANGUAGE_LABEL[this.tribeLanguages[i] as Language] ?? ""}">${flag}</span> ` : ""}` +
          `${escapeHtml(n)} ${countChip(tribeCounts[i] ?? 0)}${eye}</div>`,
      );
    }
    const othersHtml = otherRows.length
      ? `<div class="others">${otherRows.join("")}</div>`
      : `<div class="others">Warte auf weitere Stämme …</div>`;

    const myFlag = this.flagFor(this.playerId);
    const meActive = this.spectatorTarget === null ? " active" : "";
    this.hud.innerHTML =
      `<div class="me clickable${meActive}" data-spectate-slot="${this.playerId}">` +
      `<span class="swatch" style="background:${myColor}"></span>` +
      `Stamm von ${escapeHtml(myName)}${myFlag ? ` <span class="flag">${myFlag}</span>` : ""} ` +
      `${countChip(tribeCounts[this.playerId] ?? 0)}</div>` +
      this.growthHudHtml() +
      `<div class="res">${resHtml}</div>` +
      othersHtml;
  }

  private flagFor(playerId: PlayerId): string {
    const lang = this.tribeLanguages[playerId] as Language | undefined;
    if (!lang) return "";
    return LANGUAGE_FLAG[lang] ?? "";
  }

  private growthHudHtml(): string {
    let count = 0;
    let males = 0;
    let females = 0;
    for (const u of this.units.values()) {
      if (u.owner !== this.playerId) continue;
      count++;
      if (u.gender === "m") males++;
      else females++;
    }
    if (count === 0) return "";

    const progress = this.growthProgress[this.playerId] ?? 0;
    const active = this.growthActive[this.playerId] ?? false;

    let cls = "growth";
    let stateLabel: string;
    let stateCls = "state";
    let pct = Math.round(progress * 100);

    if (count >= MAX_TRIBE_SIZE) {
      cls += " full";
      stateCls += " full";
      stateLabel = "Stamm voll";
      pct = 100;
    } else if (count < 2) {
      cls += " paused";
      stateLabel = "zu wenig Stammesmitglieder";
    } else if (males < 1 || females < 1) {
      cls += " paused";
      stateLabel = males < 1 ? "kein Mann im Stamm" : "keine Frau im Stamm";
    } else if (active && progress >= 0.8) {
      cls += " imminent";
      stateCls += " imminent";
      stateLabel = "Geburt steht bevor";
    } else if (active) {
      stateCls += " active";
      stateLabel = `${pct}%`;
    } else {
      cls += " paused";
      stateLabel = "pausiert";
    }

    const fillPct = count >= MAX_TRIBE_SIZE ? 100 : Math.round(progress * 100);
    return (
      `<div class="${cls}">` +
      `<div class="label-row"><span class="lbl">Wachstum</span>` +
      `<span class="${stateCls}">${escapeHtml(stateLabel)}</span></div>` +
      `<div class="bar"><div class="fill" style="width:${fillPct}%"></div></div>` +
      `</div>`
    );
  }

  private checkGameOver(): void {
    if (this.isGameOver) return;
    if (this.initialTribeSize === 0) return;
    const alive = [...this.units.values()].some((u) => u.owner === this.playerId);
    if (alive) return;
    this.isGameOver = true;
    this.time.delayedCall(2400, () => this.showGameOver());
  }

  private showGameOver(): void {
    const elapsedMs = Date.now() - this.gameStartMs;
    const totalSec = Math.floor(elapsedMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const timeStr = `${m}:${s.toString().padStart(2, "0")}`;

    const collected = this.collectedTotals;
    const labels: Record<keyof Resources, string> = {
      holz: "Holz",
      wasser: "Wasser",
      beeren: "Beeren",
      pilze: "Pilze",
      fleisch: "Fleisch",
      fisch: "Fisch",
      stein: "Stein",
    };
    const totalCollected = RESOURCE_KEYS.reduce((a, k) => a + (collected[k] ?? 0), 0);
    const resHtml = RESOURCE_KEYS.map(
      (k) =>
        `<div class="go-item"><span class="go-ico ${k}"></span>` +
        `<span class="go-label">${labels[k]}</span><b>${collected[k]}</b></div>`,
    ).join("");

    const myName = this.names[this.playerId] || "Stamm";
    const entry: ScoreEntry = {
      name: myName,
      timeSec: totalSec,
      collected: totalCollected,
      tribe: this.maxTribeSize,
      score: computeScore(totalSec, totalCollected, this.maxTribeSize),
      ts: Date.now(),
    };
    this.pendingScoreEntry = entry;

    const overlay = document.createElement("div");
    overlay.id = "gameover";
    overlay.innerHTML =
      `<div id="gameover-card">` +
      `<h1>Dein Stamm ist ausgestorben</h1>` +
      `<div class="go-sub">Statistik</div>` +
      `<div class="go-stats">` +
      `<div class="go-row"><span>Überlebenszeit</span><b>${timeStr}</b></div>` +
      `<div class="go-row"><span>Stammesmitglieder (max.)</span><b>${this.maxTribeSize}</b></div>` +
      `<div class="go-row"><span>Gesammelt gesamt</span><b>${totalCollected}</b></div>` +
      `<div class="go-row"><span>Punkte</span><b>${entry.score}</b></div>` +
      `</div>` +
      `<div class="go-sub">Ressourcen</div>` +
      `<div class="go-res">${resHtml}</div>` +
      `<div class="go-sub">Bestenliste</div>` +
      `<div class="lb" id="gameover-lb">` +
      `<div class="lb-row lb-head">` +
      `<span class="lb-rank">#</span>` +
      `<span class="lb-name">Stamm</span>` +
      `<span class="lb-stat">Zeit</span>` +
      `<span class="lb-stat">Sml.</span>` +
      `<span class="lb-stat">Mitg.</span>` +
      `<span class="lb-score">Pkt.</span>` +
      `</div>` +
      `<div class="lb-loading">Bestenliste lädt …</div>` +
      `</div>` +
      `<div id="gameover-rank-note"></div>` +
      `<div class="btn-row"><button id="gameover-btn" class="btn">Neu starten</button></div>` +
      `</div>`;
    document.body.appendChild(overlay);
    const btn = document.getElementById("gameover-btn");
    btn?.addEventListener("click", () => window.location.reload());

    try {
      this.net.send({ type: "submitScore", entry });
    } catch {
      // ignore — leaderboard will simply remain in loading state
    }
  }

  private onLeaderboard(msg: LeaderboardMessage): void {
    const lb = document.getElementById("gameover-lb");
    const rankNote = document.getElementById("gameover-rank-note");
    if (!lb) return;
    const entry = this.pendingScoreEntry;
    const top = msg.entries.slice(0, 10);
    const rows = top
      .map((e, idx) => {
        const isMe = !!entry && e.ts === msg.myEntryTs && e.score === entry.score;
        const rank = idx + 1;
        const t = formatTime(e.timeSec);
        return (
          `<div class="lb-row${isMe ? " lb-me" : ""}">` +
          `<span class="lb-rank">${rank}</span>` +
          `<span class="lb-name">${escapeHtml(e.name)}</span>` +
          `<span class="lb-stat">${t}</span>` +
          `<span class="lb-stat">${e.collected}</span>` +
          `<span class="lb-stat">${e.tribe}</span>` +
          `<span class="lb-score">${e.score}</span>` +
          `</div>`
        );
      })
      .join("");
    lb.innerHTML =
      `<div class="lb-row lb-head">` +
      `<span class="lb-rank">#</span>` +
      `<span class="lb-name">Stamm</span>` +
      `<span class="lb-stat">Zeit</span>` +
      `<span class="lb-stat">Sml.</span>` +
      `<span class="lb-stat">Mitg.</span>` +
      `<span class="lb-score">Pkt.</span>` +
      `</div>` +
      (rows || `<div class="lb-loading">Noch keine Einträge.</div>`);
    if (rankNote && entry && msg.myRank > top.length) {
      rankNote.innerHTML =
        `<div class="lb-note">Dein Platz: #${msg.myRank}</div>`;
    } else if (rankNote) {
      rankNote.innerHTML = "";
    }
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

function shadeColor(color: number, factor: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
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

function computeScore(timeSec: number, collected: number, tribe: number): number {
  return Math.round(timeSec + collected * 5 + tribe * 30);
}

function formatTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
