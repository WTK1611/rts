import Phaser from "phaser";
import { gridToScreen, screenToGrid, TILE_W, TILE_H } from "../iso";
import { Unit } from "../Unit";
import { Tree, TreeStage } from "../Tree";
import { Bush } from "../Bush";
import { Fish } from "../Fish";
import { Mushroom } from "../Mushroom";
import { Stone } from "../Stone";
import { Sequoia } from "../Sequoia";
import { Volcano } from "../Volcano";
import { Animal } from "../Animal";
import { Campfire } from "../Campfire";
import { Artifact } from "../Artifact";
import { Net } from "../net";
import {
  AFTERNOON_LEN_SEC,
  AnimalSnapshot,
  ArtifactFindEvent,
  ArtifactReward,
  ArtifactSnapshot,
  CampfireSnapshot,
  CAMPFIRE_RANGE,
  DAY_LENGTH_SEC,
  DayPhase,
  emptyResources,
  FishSnapshot,
  Footprint,
  FOOTPRINT_LIFETIME_TICKS,
  InitMessage,
  LeaderboardMessage,
  MAX_TRIBE_SIZE,
  MORNING_LEN_SEC,
  NIGHT_LEN_SEC,
  NOON_LEN_SEC,
  ObjectKind,
  PlayerId,
  phaseAt,
  RemovedObject,
  RESOURCE_KEYS,
  Resources,
  ScoreEntry,
  ServerMessage,
  StateMessage,
  SUNSET_AT_SEC,
  TICK_RATE,
  TreeGrowthEvent,
} from "../../shared/protocol";
import {
  biomeAt,
  BIOME_PALETTES,
  groundHeight,
  hasBushAt,
  hasFishAt,
  hasMushroomAt,
  hasSequoiaAt,
  hasStoneAt,
  hasVolcanoAt,
  hasTreeAt,
  heightAt,
  isLandTile,
  MAX_TERRAIN_HEIGHT_PX,
  rand01,
  tileVariant,
  tileDecor,
} from "../../shared/worldgen";
import { LANGUAGE_FLAG, LANGUAGE_LABEL, NameLanguage } from "../../shared/names";
import { BIOME_MINI_COLOR } from "../biomeColors";
import { t } from "../i18n";

interface ClickState {
  startX: number;
  startY: number;
  moved: boolean;
}

interface SurfSeg {
  pts: Array<{ x: number; y: number }>;
  phase: number;
}

interface WaterfallSeg {
  topX: number;
  topY: number;
  botX: number;
  botY: number;
  width: number;
  phase: number;
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
  sequoias: Map<string, Sequoia>;
  volcanoes: Map<string, Volcano>;
  surfSegments: SurfSeg[];
  waterfalls: WaterfallSeg[];
  bbox: { x: number; y: number; w: number; h: number };
}

export interface GameSceneInit {
  net: Net;
  init: InitMessage;
}

const SIGHT_RADIUS = 5.5;
const NIGHT_SIGHT_RADIUS = 2.5;
const CAMPFIRE_SIGHT_BONUS = 4.5;
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
  private treeGrowthMap: Map<string, TreeStage> = new Map();
  private bushes: Map<string, Bush> = new Map();
  private mushrooms: Map<string, Mushroom> = new Map();
  private fishes: Map<string, Fish> = new Map();
  private stones: Map<string, Stone> = new Map();
  private sequoias: Map<string, Sequoia> = new Map();
  private volcanoes: Map<string, Volcano> = new Map();
  private animals: Map<string, Animal> = new Map();
  private campfires: Map<string, Campfire> = new Map();
  private artifacts: Map<string, Artifact> = new Map();
  private pendingArtifacts: ArtifactSnapshot[] = [];
  private chunks: Map<string, Chunk> = new Map();

  private hoverTile!: Phaser.GameObjects.Graphics;
  private fog!: Phaser.GameObjects.Graphics;
  private footprintsGfx!: Phaser.GameObjects.Graphics;

  private visible = new Set<string>();
  private explored = new Set<string>();

  private click: ClickState | null = null;
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
  private pendingFishes: FishSnapshot[] = [];
  private pendingCampfires: CampfireSnapshot[] = [];

  private camTargetX = 0;
  private camTargetY = 0;
  private lastZoom = 1;

  private lastPointerScreenX = -1;
  private lastPointerScreenY = -1;

  private touchPan: { lastX: number; lastY: number; startX: number; startY: number; moved: boolean } | null = null;
  private pinch: { startDist: number; startZoom: number } | null = null;
  private userPanned = false;

  private lastClickMs = 0;
  private lastClickI = -99999;
  private lastClickJ = -99999;
  private static readonly DOUBLE_CLICK_MS = 400;

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
  private isGameWon = false;
  private tribeOrigin: PlayerId[] = [];

  private growthProgress: number[] = [];
  private growthActive: boolean[] = [];
  private tribeCounts: number[] = [];
  private growthBeacon!: Phaser.GameObjects.Graphics;
  private growthBeaconPhase = 0;
  private tribeRallyGfx!: Phaser.GameObjects.Graphics;
  private tribeRallyPhase = 0;
  private moveTargetGfx!: Phaser.GameObjects.Graphics;
  private surfGfx!: Phaser.GameObjects.Graphics;
  private lastSurfMs = -1000;
  private waterfallGfx!: Phaser.GameObjects.Graphics;
  private lastWaterfallMs = -1000;
  private moveTarget: {
    i: number;
    j: number;
    kind: "move" | "hunt" | "harvest";
    age: number;
  } | null = null;
  private static readonly MOVE_TARGET_TTL = 0.8;

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

  private perfEl: HTMLElement | null = null;
  private perfFrameTimeMs = 16.7;
  private perfLastDomUpdateMs = 0;
  private perfServerTickMs = 0;
  private perfAnimalCount = 0;
  private perfUnitCount = 0;
  private perfFishCount = 0;
  private perfVisible = true;

  private gameTimeSec = 0;
  private nightOverlay!: Phaser.GameObjects.RenderTexture;
  private nightEraser!: Phaser.GameObjects.Graphics;
  private celestialGfx!: Phaser.GameObjects.Graphics;
  private lastPhase: DayPhase = "morning";
  private nightDeathOwn = 0;
  private nightDeathOther: Record<number, number> = {};
  private nightExtinctOthers: number[] = [];
  private clockEl: HTMLElement | null = null;

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
    this.pendingFishes = data.init.fishes ?? [];
    this.pendingCampfires = data.init.campfires ?? [];
    this.pendingArtifacts = data.init.artifacts ?? [];
    this.tribeCounts = data.init.tribeCounts ?? [];
    this.gameTimeSec = data.init.gameTimeSec ?? 0;
    this.lastPhase = phaseAt(this.gameTimeSec);
    this.tribeOrigin = data.init.tribeOrigin ?? [];
    if (data.init.treeGrowth) {
      for (const ev of data.init.treeGrowth) {
        if (ev.stage >= 1 && ev.stage <= 3) {
          this.treeGrowthMap.set(`${ev.i},${ev.j}`, ev.stage as TreeStage);
        }
      }
    }
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
    for (const snap of this.pendingFishes) {
      this.fishes.set(snap.id, new Fish(this, snap.id, snap.gx, snap.gy));
    }
    this.pendingFishes = [];
    for (const snap of this.pendingCampfires) {
      this.applyCampfireSnap(snap, false);
    }
    this.pendingCampfires = [];
    for (const snap of this.pendingArtifacts) {
      this.spawnArtifactLocal(snap);
    }
    this.pendingArtifacts = [];

    this.hoverTile = this.add.graphics();
    this.hoverTile.setDepth(-99999);

    this.footprintsGfx = this.add.graphics();
    this.footprintsGfx.setDepth(1_600_000);

    this.fog = this.add.graphics();
    this.fog.setDepth(1_500_000);

    this.growthBeacon = this.add.graphics();
    this.growthBeacon.setDepth(1_700_000);
    this.growthBeacon.setVisible(false);

    this.tribeRallyGfx = this.add.graphics();
    this.tribeRallyGfx.setDepth(1_650_000);

    this.moveTargetGfx = this.add.graphics();
    this.moveTargetGfx.setDepth(1_680_000);
    this.moveTargetGfx.setVisible(false);

    this.surfGfx = this.add.graphics();
    this.surfGfx.setDepth(-50000);

    this.waterfallGfx = this.add.graphics();
    this.waterfallGfx.setDepth(-45000);

    const screenW = this.scale.width;
    const screenH = this.scale.height;
    this.nightOverlay = this.add.renderTexture(0, 0, screenW, screenH)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1_810_000);
    this.nightEraser = this.make.graphics({ x: 0, y: 0 }, false);
    this.celestialGfx = this.add.graphics()
      .setScrollFactor(0)
      .setDepth(1_820_000);
    this.scale.on("resize", (size: Phaser.Structs.Size) => {
      this.nightOverlay.setSize(size.width, size.height);
    });

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x6aaad6);
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
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.P).on("down", () => this.togglePerf());

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
      this.setupHudDrag(this.hud);
    }
    this.minimapWrap = document.getElementById("minimap-wrap");
    this.minimapVisible = false;
    if (this.minimapWrap) this.minimapWrap.style.display = "none";
    this.perfEl = document.getElementById("perf");
    const storedPerf = localStorage.getItem("rts.perfVisible");
    if (storedPerf !== null) this.perfVisible = storedPerf === "1";
    if (this.perfEl) this.perfEl.style.display = this.perfVisible ? "" : "none";

    this.updateChunks();
    this.updateFog();
    this.drawFootprints();
    this.updateHud();
  }

  update(time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.perfFrameTimeMs = this.perfFrameTimeMs * 0.92 + deltaMs * 0.08;
    if (time - this.perfLastDomUpdateMs > 500) {
      this.perfLastDomUpdateMs = time;
      this.updatePerf();
    }
    for (const u of this.units.values()) u.update(dt);
    for (const a of this.animals.values()) a.update(dt);
    for (const f of this.campfires.values()) f.update(dt);
    for (const ar of this.artifacts.values()) ar.update(dt);
    for (const v of this.volcanoes.values()) v.update(dt);
    this.updateSurf(time);
    this.updateWaterfalls(time);

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

    const prevPhase = this.lastPhase;
    this.gameTimeSec += dt;
    this.lastPhase = phaseAt(this.gameTimeSec);
    if (prevPhase !== this.lastPhase) this.onPhaseChange(prevPhase);

    this.updateChunks();
    this.updateFog();
    this.drawFootprints();
    this.updateGrowthBeacon(dt);
    this.updateTribeRally(dt);
    this.updateMoveTarget(dt);
    this.updateDayNight();
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
      const color = this.playerColors[owner] ?? 0xffffff;
      const { x: tx, y: ty } = gridToScreen(ax, ay);
      const cx = tx;
      const cy = ty + TILE_H / 2;
      const rw = TILE_W;
      const rh = TILE_H;
      g.fillStyle(color, 0.18 * pulse + 0.1);
      g.fillEllipse(cx, cy, rw, rh);
      g.lineStyle(2, color, 0.55 + 0.3 * pulse);
      g.strokeEllipse(cx, cy, rw, rh);
      g.fillStyle(color, 0.9);
      g.fillCircle(cx, cy, 2.5);
    }
  }

  private setMoveTarget(i: number, j: number, kind: "move" | "hunt" | "harvest"): void {
    this.moveTarget = { i, j, kind, age: 0 };
  }

  private updateMoveTarget(dt: number): void {
    const g = this.moveTargetGfx;
    if (!this.moveTarget) {
      if (g.visible) {
        g.clear();
        g.setVisible(false);
      }
      return;
    }
    this.moveTarget.age += dt;
    const ttl = GameScene.MOVE_TARGET_TTL;
    if (this.moveTarget.age >= ttl) {
      this.moveTarget = null;
      g.clear();
      g.setVisible(false);
      return;
    }
    const t = this.moveTarget.age / ttl;
    const alpha = 1 - t;
    const scale = 1 + t * 0.45;
    const color =
      this.moveTarget.kind === "hunt"
        ? 0xff7e3a
        : this.moveTarget.kind === "harvest"
          ? 0x6cdf6c
          : 0xffffff;
    const { x, y } = gridToScreen(this.moveTarget.i, this.moveTarget.j);
    const cx = x;
    const cy = y + TILE_H / 2;
    const hw = (TILE_W / 2) * scale;
    const hh = (TILE_H / 2) * scale;
    g.setVisible(true);
    g.clear();
    g.fillStyle(color, 0.18 * alpha);
    g.beginPath();
    g.moveTo(cx, cy - hh);
    g.lineTo(cx + hw, cy);
    g.lineTo(cx, cy + hh);
    g.lineTo(cx - hw, cy);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, color, 0.9 * alpha);
    g.beginPath();
    g.moveTo(cx, cy - hh);
    g.lineTo(cx + hw, cy);
    g.lineTo(cx, cy + hh);
    g.lineTo(cx - hw, cy);
    g.closePath();
    g.strokePath();
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
    const name = this.names[slot] || t().hudTribeFallback(slot);
    this.showToast(t().toastSpectating(name), "join");
    this.updateHud();
  }

  private stopSpectating(): void {
    if (this.spectatorTarget === null) return;
    this.spectatorTarget = null;
    this.userPanned = false;
    this.visObjectCache.clear();
    this.visSourceHash = -1;
    this.showToast(t().toastBackToTribe, "join");
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
    this.tribeMoveCooldown = 0.18;

    let chief: Unit | null = null;
    for (const u of this.units.values()) {
      if (u.owner !== this.playerId) continue;
      if (u.isChief) {
        chief = u;
        break;
      }
    }
    if (!chief) return;

    const gdi = dx + dy;
    const gdj = -dx + dy;
    const stepDist = 3;
    const ci = Math.round(chief.gx);
    const cj = Math.round(chief.gy);
    let ti = ci;
    let tj = cj;
    for (let s = 1; s <= stepDist; s++) {
      const ni = ci + gdi * s;
      const nj = cj + gdj * s;
      if (!isLandTile(this.seed, ni, nj)) break;
      ti = ni;
      tj = nj;
    }
    if (ti === ci && tj === cj) return;
    this.net.send({ type: "move", unitIds: [chief.id], i: ti, j: tj });
    this.setMoveTarget(ti, tj, "move");
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
    const sequoias = new Map<string, Sequoia>();
    const volcanoes = new Map<string, Volcano>();
    const i0 = cx * CHUNK_SIZE;
    const j0 = cy * CHUNK_SIZE;
    // Pass 1: draw water tiles first so land tiles can carve a jagged shoreline over them.
    for (let dj = 0; dj < CHUNK_SIZE; dj++) {
      for (let di = 0; di < CHUNK_SIZE; di++) {
        const i = i0 + di;
        const j = j0 + dj;
        if (this.isWaterAt(i, j)) this.drawTile(g, g, i, j);
      }
    }
    // Pass 2: draw land tiles (with wavy water edges + beach band) and spawn entities.
    for (let dj = 0; dj < CHUNK_SIZE; dj++) {
      for (let di = 0; di < CHUNK_SIZE; di++) {
        const i = i0 + di;
        const j = j0 + dj;
        if (!this.isWaterAt(i, j)) this.drawTile(g, g, i, j);
        if (hasVolcanoAt(this.seed, i, j)) {
          const vid = `v_${i}_${j}`;
          if (!this.volcanoes.has(vid)) {
            const v = new Volcano(this, i, j, this.seed);
            volcanoes.set(vid, v);
            this.volcanoes.set(vid, v);
          }
        } else if (hasSequoiaAt(this.seed, i, j)) {
          const sid = `q_${i}_${j}`;
          if (!this.sequoias.has(sid)) {
            const s = new Sequoia(this, i, j, this.seed);
            sequoias.set(sid, s);
            this.sequoias.set(sid, s);
          }
        } else if (hasTreeAt(this.seed, i, j)) {
          const id = objKey("tree", i, j);
          if (!this.trees.has(id)) {
            if (!this.removedKeys.has(id)) {
              const t = new Tree(this, id, i, j, this.seed);
              trees.set(id, t);
              this.trees.set(id, t);
            } else {
              const stage = this.treeGrowthMap.get(`${i},${j}`);
              if (stage !== undefined) {
                const t = new Tree(this, id, i, j, this.seed, stage);
                trees.set(id, t);
                this.trees.set(id, t);
              }
            }
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
    const surfSegments: SurfSeg[] = [];
    const waterfalls: WaterfallSeg[] = [];
    for (let dj = 0; dj < CHUNK_SIZE; dj++) {
      for (let di = 0; di < CHUNK_SIZE; di++) {
        this.collectSurfSegmentsForTile(i0 + di, j0 + dj, surfSegments);
        this.collectWaterfallsForTile(i0 + di, j0 + dj, waterfalls);
      }
    }
    this.chunks.set(`${cx},${cy}`, {
      cx, cy, rt,
      trees, bushes, mushrooms, fishes, stones, sequoias, volcanoes,
      surfSegments,
      waterfalls,
      bbox: { x: ofx, y: ofy, w, h },
    });
  }

  private collectSurfSegmentsForTile(i: number, j: number, out: SurfSeg[]): void {
    if (this.isWaterAt(i, j)) return;
    const cornerTouchesWater = (ci: number, cj: number): boolean =>
      this.isWaterAt(ci - 1, cj - 1) ||
      this.isWaterAt(ci, cj - 1) ||
      this.isWaterAt(ci - 1, cj) ||
      this.isWaterAt(ci, cj);
    const NB_DELTA: Array<[number, number]> = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    let anyWaterNb = false;
    for (const [di, dj] of NB_DELTA) {
      if (this.isWaterAt(i + di, j + dj)) { anyWaterNb = true; break; }
    }
    if (!anyWaterNb) return;
    const hN = cornerTouchesWater(i, j) ? 0 : heightAt(this.seed, i, j);
    const hE = cornerTouchesWater(i + 1, j) ? 0 : heightAt(this.seed, i + 1, j);
    const hS = cornerTouchesWater(i + 1, j + 1) ? 0 : heightAt(this.seed, i + 1, j + 1);
    const hW = cornerTouchesWater(i, j + 1) ? 0 : heightAt(this.seed, i, j + 1);
    const { x, y } = gridToScreen(i, j);
    const corners = [
      { x: x, y: y - hN },
      { x: x + TILE_W / 2, y: y + TILE_H / 2 - hE },
      { x: x, y: y + TILE_H - hS },
      { x: x - TILE_W / 2, y: y + TILE_H / 2 - hW },
    ];
    for (let e = 0; e < 4; e++) {
      const [di, dj] = NB_DELTA[e];
      if (!this.isWaterAt(i + di, j + dj)) continue;
      const a = corners[e];
      const b = corners[(e + 1) % 4];
      const wave = this.edgeWavePoints(i, j, e, a.x, a.y, b.x, b.y);
      const pts = [{ x: a.x, y: a.y }, ...wave, { x: b.x, y: b.y }];
      const phase = (i * 0.37 + j * 0.71 + e * 1.13) % (Math.PI * 2);
      out.push({ pts, phase });
    }
  }

  private collectWaterfallsForTile(i: number, j: number, out: WaterfallSeg[]): void {
    const b = biomeAt(this.seed, i, j);
    if (b !== "felsen" && b !== "gebirge") return;
    const NB_DELTA: Array<[number, number]> = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    const riverEdges: number[] = [];
    for (let e = 0; e < 4; e++) {
      const [di, dj] = NB_DELTA[e];
      if (biomeAt(this.seed, i + di, j + dj) === "river") riverEdges.push(e);
    }
    if (!riverEdges.length) return;
    const cornerTouchesWater = (ci: number, cj: number): boolean =>
      this.isWaterAt(ci - 1, cj - 1) ||
      this.isWaterAt(ci, cj - 1) ||
      this.isWaterAt(ci - 1, cj) ||
      this.isWaterAt(ci, cj);
    const hN = cornerTouchesWater(i, j) ? 0 : heightAt(this.seed, i, j);
    const hE = cornerTouchesWater(i + 1, j) ? 0 : heightAt(this.seed, i + 1, j);
    const hS = cornerTouchesWater(i + 1, j + 1) ? 0 : heightAt(this.seed, i + 1, j + 1);
    const hW = cornerTouchesWater(i, j + 1) ? 0 : heightAt(this.seed, i, j + 1);
    const drawnH = [hN, hE, hS, hW];
    const { x, y } = gridToScreen(i, j);
    const corners = [
      { x: x, y: y - hN },
      { x: x + TILE_W / 2, y: y + TILE_H / 2 - hE },
      { x: x, y: y + TILE_H - hS },
      { x: x - TILE_W / 2, y: y + TILE_H / 2 - hW },
    ];
    for (const e of riverEdges) {
      const fa = corners[e];
      const fb = corners[(e + 1) % 4];
      const ba = corners[(e + 2) % 4];
      const bb = corners[(e + 3) % 4];
      const backH = (drawnH[(e + 2) % 4] + drawnH[(e + 3) % 4]) * 0.5;
      if (backH < 12) continue;
      const botX = (fa.x + fb.x) * 0.5;
      const botY = (fa.y + fb.y) * 0.5;
      const topX = (ba.x + bb.x) * 0.5;
      const topY = (ba.y + bb.y) * 0.5;
      const edgeLen = Math.hypot(fb.x - fa.x, fb.y - fa.y);
      const width = edgeLen * 0.55;
      const phase = (i * 0.51 + j * 0.83 + e * 1.7) % (Math.PI * 2);
      out.push({ topX, topY, botX, botY, width, phase });
    }
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
    for (const [qid, q] of chunk.sequoias) {
      q.destroy();
      this.sequoias.delete(qid);
    }
    for (const [vid, v] of chunk.volcanoes) {
      v.destroy();
      this.volcanoes.delete(vid);
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

    const cornerTouchesWater = (ci: number, cj: number): boolean =>
      this.isWaterAt(ci - 1, cj - 1) ||
      this.isWaterAt(ci, cj - 1) ||
      this.isWaterAt(ci - 1, cj) ||
      this.isWaterAt(ci, cj);
    const hN = isWater || cornerTouchesWater(i, j) ? 0 : heightAt(this.seed, i, j);
    const hE = isWater || cornerTouchesWater(i + 1, j) ? 0 : heightAt(this.seed, i + 1, j);
    const hS = isWater || cornerTouchesWater(i + 1, j + 1) ? 0 : heightAt(this.seed, i + 1, j + 1);
    const hW = isWater || cornerTouchesWater(i, j + 1) ? 0 : heightAt(this.seed, i, j + 1);
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

    const corners = [
      { x: x, y: y - hN },
      { x: x + TILE_W / 2, y: y + TILE_H / 2 - hE },
      { x: x, y: y + TILE_H - hS },
      { x: x - TILE_W / 2, y: y + TILE_H / 2 - hW },
    ];
    const NB_DELTA: Array<[number, number]> = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    const nbWater = isWater
      ? [false, false, false, false]
      : NB_DELTA.map(([di, dj]) => this.isWaterAt(i + di, j + dj));

    g.fillStyle(tileFill, 1);
    g.beginPath();
    g.moveTo(corners[0].x, corners[0].y);
    for (let e = 0; e < 4; e++) {
      const a = corners[e];
      const b = corners[(e + 1) % 4];
      if (nbWater[e]) {
        const wave = this.edgeWavePoints(i, j, e, a.x, a.y, b.x, b.y);
        for (const p of wave) g.lineTo(p.x, p.y);
      }
      g.lineTo(b.x, b.y);
    }
    g.closePath();
    g.fillPath();
    if (isWater) {
      g.lineStyle(1, 0x16304a, 0.2);
      g.strokePath();
    }

    if (!isWater) {
      for (let e = 0; e < 4; e++) {
        if (!nbWater[e]) continue;
        const a = corners[e];
        const b = corners[(e + 1) % 4];
        this.drawBeachBand(g, i, j, e, a.x, a.y, b.x, b.y);
      }
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

  private isWaterAt(i: number, j: number): boolean {
    const b = biomeAt(this.seed, i, j);
    return b === "lake" || b === "river";
  }

  private edgeWavePoints(
    i: number,
    j: number,
    edgeIdx: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ): Array<{ x: number; y: number }> {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1) return [];
    const nx = -dy / len;
    const ny = dx / len;
    const tx = dx / len;
    const ty = dy / len;
    const SEGMENTS = 7;
    const pts: Array<{ x: number; y: number }> = [];
    for (let k = 1; k < SEGMENTS; k++) {
      const t = k / SEGMENTS;
      const taper = Math.sin(t * Math.PI);
      const r1 = rand01(this.seed ^ 0x517a17, i * 17 + edgeIdx * 257 + k, j * 31 + edgeIdx * 113);
      const r2 = rand01(this.seed ^ 0x91537d, i * 11 + edgeIdx * 199 + k * 7, j * 13 + edgeIdx * 71);
      const inward = (1.5 + r1 * 5) * taper;
      const along = (r2 - 0.5) * 4 * taper;
      const baseX = ax + dx * t + tx * along;
      const baseY = ay + dy * t + ty * along;
      pts.push({ x: baseX + nx * inward, y: baseY + ny * inward });
    }
    return pts;
  }

  private drawBeachBand(
    g: Phaser.GameObjects.Graphics,
    i: number,
    j: number,
    edgeIdx: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ): void {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const nx = -dy / len;
    const ny = dx / len;
    const SAND = 5;
    const wave = this.edgeWavePoints(i, j, edgeIdx, ax, ay, bx, by);
    const outer = [{ x: ax, y: ay }, ...wave, { x: bx, y: by }];
    g.fillStyle(0xe8d28a, 1);
    g.beginPath();
    g.moveTo(outer[0].x, outer[0].y);
    for (let k = 1; k < outer.length; k++) g.lineTo(outer[k].x, outer[k].y);
    for (let k = outer.length - 1; k >= 0; k--) {
      g.lineTo(outer[k].x + nx * SAND, outer[k].y + ny * SAND);
    }
    g.closePath();
    g.fillPath();
  }

  private updateSurf(timeMs: number): void {
    if (timeMs - this.lastSurfMs < 70) return;
    this.lastSurfMs = timeMs;
    const g = this.surfGfx;
    g.clear();
    const view = this.cameras.main.worldView;
    const t = timeMs * 0.0022;
    const buckets: SurfSeg[][] = [[], [], [], []];
    for (const ch of this.chunks.values()) {
      const bb = ch.bbox;
      if (bb.x + bb.w < view.x || bb.x > view.right) continue;
      if (bb.y + bb.h < view.y || bb.y > view.bottom) continue;
      for (const seg of ch.surfSegments) {
        const a = 0.5 + 0.5 * Math.sin(t + seg.phase);
        const b = Math.min(3, Math.floor(a * 4));
        buckets[b].push(seg);
      }
    }
    const alphas = [0.18, 0.32, 0.5, 0.7];
    for (let b = 0; b < 4; b++) {
      const segs = buckets[b];
      if (!segs.length) continue;
      g.lineStyle(2, 0xffffff, alphas[b]);
      for (const seg of segs) {
        g.beginPath();
        g.moveTo(seg.pts[0].x, seg.pts[0].y);
        for (let k = 1; k < seg.pts.length; k++) g.lineTo(seg.pts[k].x, seg.pts[k].y);
        g.strokePath();
      }
    }
  }

  private updateWaterfalls(timeMs: number): void {
    if (timeMs - this.lastWaterfallMs < 50) return;
    this.lastWaterfallMs = timeMs;
    const g = this.waterfallGfx;
    g.clear();
    const view = this.cameras.main.worldView;
    const t = timeMs * 0.001;
    for (const ch of this.chunks.values()) {
      const bb = ch.bbox;
      if (bb.x + bb.w < view.x || bb.x > view.right) continue;
      if (bb.y + bb.h < view.y || bb.y > view.bottom) continue;
      for (const wf of ch.waterfalls) this.drawWaterfall(g, wf, t);
    }
  }

  private drawWaterfall(
    g: Phaser.GameObjects.Graphics,
    wf: WaterfallSeg,
    t: number,
  ): void {
    const dx = wf.botX - wf.topX;
    const dy = wf.botY - wf.topY;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const dirX = dx / len;
    const dirY = dy / len;
    const perpX = -dirY;
    const perpY = dirX;
    const halfW = wf.width * 0.5;

    g.fillStyle(0xc4dcef, 0.5);
    g.beginPath();
    g.moveTo(wf.topX - perpX * halfW, wf.topY - perpY * halfW);
    g.lineTo(wf.topX + perpX * halfW, wf.topY + perpY * halfW);
    g.lineTo(wf.botX + perpX * halfW * 1.05, wf.botY + perpY * halfW * 1.05);
    g.lineTo(wf.botX - perpX * halfW * 1.05, wf.botY - perpY * halfW * 1.05);
    g.closePath();
    g.fillPath();

    const innerW = halfW * 0.65;
    g.fillStyle(0xeaf2fa, 0.55);
    g.beginPath();
    g.moveTo(wf.topX - perpX * innerW, wf.topY - perpY * innerW);
    g.lineTo(wf.topX + perpX * innerW, wf.topY + perpY * innerW);
    g.lineTo(wf.botX + perpX * innerW, wf.botY + perpY * innerW);
    g.lineTo(wf.botX - perpX * innerW, wf.botY - perpY * innerW);
    g.closePath();
    g.fillPath();

    const streakCount = Math.max(3, Math.floor(wf.width / 2.4));
    g.lineStyle(1.4, 0xffffff, 0.85);
    for (let s = 0; s < streakCount; s++) {
      const sFrac = (s + 0.5) / streakCount - 0.5;
      const offsetW = sFrac * wf.width;
      const sBaseX = wf.topX + perpX * offsetW;
      const sBaseY = wf.topY + perpY * offsetW;
      const eBaseX = wf.botX + perpX * offsetW;
      const eBaseY = wf.botY + perpY * offsetW;
      const cycle = 0.6 + ((s * 7) % 5) * 0.07;
      const speed = 0.55 + ((s * 13) % 30) * 0.012;
      const offFrac = ((t * speed + s * 0.13 + wf.phase * 0.16) % cycle) / cycle;
      const segFracLen = 0.18 + (s % 3) * 0.05;
      const c1 = offFrac;
      const c2 = Math.min(1, offFrac + segFracLen);
      if (c2 <= c1) continue;
      const x1 = sBaseX + (eBaseX - sBaseX) * c1;
      const y1 = sBaseY + (eBaseY - sBaseY) * c1;
      const x2 = sBaseX + (eBaseX - sBaseX) * c2;
      const y2 = sBaseY + (eBaseY - sBaseY) * c2;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.strokePath();
    }

    const foamPhase = 0.5 + 0.5 * Math.sin(t * 4 + wf.phase);
    g.fillStyle(0xc4dcef, 0.55);
    g.fillEllipse(wf.botX, wf.botY + 2, wf.width * 1.25, 4);
    g.fillStyle(0xffffff, 0.45 + foamPhase * 0.35);
    g.fillEllipse(wf.botX, wf.botY + 1, wf.width * 0.95, 3);
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
    const isNight = this.lastPhase === "night";
    srcHash = (Math.imul(srcHash, 31) + (isNight ? 1 : 0)) | 0;
    if (isNight) {
      const ownerCam = this.cameraFollowOwner();
      for (const f of this.campfires.values()) {
        if (f.owner !== ownerCam) continue;
        const fi = Math.floor(f.gx);
        const fj = Math.floor(f.gy);
        srcHash = (Math.imul(srcHash, 31) + 7919 + fi) | 0;
        srcHash = (Math.imul(srcHash, 31) + 6761 + fj) | 0;
      }
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
      const isNight = this.lastPhase === "night";
      const unitR = isNight ? NIGHT_SIGHT_RADIUS : SIGHT_RADIUS;
      for (const u of this.units.values()) {
        if (!this.isSightSource(u.owner)) continue;
        const r = unitR;
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
      if (isNight) {
        for (const f of this.campfires.values()) {
          if (f.owner !== this.cameraFollowOwner()) continue;
          const r = CAMPFIRE_RANGE + CAMPFIRE_SIGHT_BONUS;
          const r2 = r * r;
          const cx = f.gx;
          const cy = f.gy;
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
      const fi = Math.floor(f.gx);
      const fj = Math.floor(f.gy);
      const key = `f:${f.id}:${fi},${fj}`;
      const v = this.visible.has(`${fi},${fj}`);
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
    for (const a of this.artifacts.values()) {
      const key = `ar:${a.id}`;
      const i = Math.floor(a.gx);
      const j = Math.floor(a.gy);
      const tileVis = this.visible.has(`${i},${j}`);
      const tileExplored = this.explored.has(`${i},${j}`);
      const v = a.found ? tileExplored : tileVis;
      if (cache.get(key) === v) continue;
      cache.set(key, v);
      a.container.setVisible(v);
      a.shadow.setVisible(v);
      a.glow.setVisible(v && !a.found);
    }
    for (const q of this.sequoias.values()) {
      const key = `q:${q.i},${q.j}`;
      const v = this.explored.has(`${q.i},${q.j}`);
      if (cache.get(key) === v) continue;
      cache.set(key, v);
      q.container.setVisible(v);
      q.shadow.setVisible(v);
    }
    for (const vol of this.volcanoes.values()) {
      const key = `v:${vol.i},${vol.j}`;
      const v = this.explored.has(`${vol.i},${vol.j}`);
      if (cache.get(key) === v) continue;
      cache.set(key, v);
      vol.container.setVisible(v);
      vol.shadow.setVisible(v);
    }
    this.updateVolcanoRangeRings();
  }

  private updateVolcanoRangeRings(): void {
    const showRings = this.lastPhase === "night" || this.lastPhase === "afternoon";
    for (const vol of this.volcanoes.values()) {
      const visible =
        showRings && this.visible.has(`${vol.i},${vol.j}`);
      vol.rangeRing.setVisible(visible);
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
      const tileVis = this.visible.has(`${i},${j}`);
      f.container.setVisible(true);
      f.setAboveFog(!tileVis);
      f.shadow.setVisible(tileVis);
      f.rangeRing.setVisible(tileVis && f.owner === this.playerId);
      if (cache.get(key) === tileVis) continue;
      cache.set(key, tileVis);
    }
  }

  private timeOfDay(): number {
    const t = this.gameTimeSec % DAY_LENGTH_SEC;
    return t < 0 ? t + DAY_LENGTH_SEC : t;
  }

  private clockString(): string {
    const tt = this.timeOfDay();
    let hour: number;
    if (tt < MORNING_LEN_SEC) {
      hour = 7 + (tt / MORNING_LEN_SEC) * 5;
    } else if (tt < MORNING_LEN_SEC + NOON_LEN_SEC) {
      hour = 12 + ((tt - MORNING_LEN_SEC) / NOON_LEN_SEC) * 3;
    } else if (tt < SUNSET_AT_SEC) {
      hour = 15 + ((tt - MORNING_LEN_SEC - NOON_LEN_SEC) / AFTERNOON_LEN_SEC) * 4;
    } else {
      hour = 19 + ((tt - SUNSET_AT_SEC) / NIGHT_LEN_SEC) * 12;
    }
    if (hour >= 24) hour -= 24;
    const h = Math.floor(hour);
    const m = Math.floor((hour - h) * 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  private overlayTintFor(t: number): { color: number; alpha: number } {
    const noonStart = MORNING_LEN_SEC;
    const afterStart = MORNING_LEN_SEC + NOON_LEN_SEC;
    if (t < noonStart) {
      const k = t / MORNING_LEN_SEC;
      return {
        color: lerpColor(0x2a3a5a, 0xffd0a0, Math.min(1, k * 1.5)),
        alpha: 0.45 * (1 - k),
      };
    }
    if (t < afterStart) {
      return { color: 0xffffff, alpha: 0 };
    }
    if (t < SUNSET_AT_SEC) {
      const k = (t - afterStart) / AFTERNOON_LEN_SEC;
      return {
        color: lerpColor(0xffffff, 0xff7a3a, k),
        alpha: 0.4 * k,
      };
    }
    const k = (t - SUNSET_AT_SEC) / NIGHT_LEN_SEC;
    if (k < 0.15) {
      return {
        color: lerpColor(0xff7a3a, 0x0a1a30, k / 0.15),
        alpha: 0.4 + 0.3 * (k / 0.15),
      };
    }
    if (k > 0.85) {
      return {
        color: lerpColor(0x0a1a30, 0x2a3a5a, (k - 0.85) / 0.15),
        alpha: 0.7 - 0.25 * ((k - 0.85) / 0.15),
      };
    }
    return { color: 0x0a1a30, alpha: 0.7 };
  }

  private updateDayNight(): void {
    const t = this.timeOfDay();
    const { color, alpha } = this.overlayTintFor(t);
    const w = this.scale.width;
    const h = this.scale.height;
    const rt = this.nightOverlay;
    rt.clear();
    if (alpha > 0.01) {
      rt.fill(color, alpha, 0, 0, w, h);
    }

    if (this.lastPhase === "night" || this.lastPhase === "afternoon") {
      this.eraseFireGlows(t);
      this.eraseVolcanoGlows(t);
    }

    this.drawCelestial(t, w, h);
    this.updateVolcanoRangeRings();
  }

  private eraseVolcanoGlows(t: number): void {
    const cam = this.cameras.main;
    const er = this.nightEraser;
    for (const vol of this.volcanoes.values()) {
      const wx = vol.container.x;
      const wy = vol.container.y - 30;
      const sx = (wx - cam.scrollX) * cam.zoom + (cam.width * (1 - cam.zoom)) / 2;
      const sy = (wy - cam.scrollY) * cam.zoom + (cam.height * (1 - cam.zoom)) / 2;
      const flicker = 0.85 + 0.15 * Math.sin(t * 7 + (wx + wy) * 0.011);
      const baseR = 70 * cam.zoom * flicker;
      er.clear();
      er.fillStyle(0xffffff, 1);
      er.fillCircle(sx, sy, baseR * 0.45);
      this.nightOverlay.erase(er);
      er.clear();
      er.fillStyle(0xffffff, 0.55);
      er.fillCircle(sx, sy, baseR);
      this.nightOverlay.erase(er);
      er.clear();
      er.fillStyle(0xffffff, 0.25);
      er.fillCircle(sx, sy, baseR * 1.5);
      this.nightOverlay.erase(er);
    }
  }

  private eraseFireGlows(t: number): void {
    const cam = this.cameras.main;
    const er = this.nightEraser;
    const isNight = this.lastPhase === "night";
    const nightK = isNight ? Math.min(1, (t - SUNSET_AT_SEC) / (NIGHT_LEN_SEC * 0.15)) : 0;
    for (const f of this.campfires.values()) {
      const wx = f.container.x;
      const wy = f.container.y;
      const sx = (wx - cam.scrollX) * cam.zoom + (cam.width * (1 - cam.zoom)) / 2;
      const sy = (wy - cam.scrollY) * cam.zoom + (cam.height * (1 - cam.zoom)) / 2;
      const flicker = 0.85 + 0.15 * Math.sin(t * 9 + (wx + wy) * 0.013);
      const baseR = (40 + f.size * 12) * cam.zoom * flicker;
      const innerR = baseR * 0.5;
      er.clear();
      er.fillStyle(0xffffff, 1);
      er.fillCircle(sx, sy, innerR);
      this.nightOverlay.erase(er);
      er.clear();
      er.fillStyle(0xffffff, 0.55);
      er.fillCircle(sx, sy, baseR);
      this.nightOverlay.erase(er);
      er.clear();
      er.fillStyle(0xffffff, 0.25);
      er.fillCircle(sx, sy, baseR * 1.6);
      this.nightOverlay.erase(er);
    }
    if (isNight) {
      const moonAlpha = 0.18 + 0.12 * nightK;
      const moonPos = this.celestialScreenPos(t, this.scale.width, this.scale.height);
      if (moonPos) {
        er.clear();
        er.fillStyle(0xffffff, moonAlpha);
        er.fillCircle(moonPos.x, moonPos.y, 90);
        this.nightOverlay.erase(er);
      }
    }
  }

  private celestialScreenPos(t: number, w: number, _h: number):
    | { x: number; y: number; isNight: boolean }
    | null {
    const margin = 60;
    const arcTop = 60;
    if (t >= SUNSET_AT_SEC) {
      const k = (t - SUNSET_AT_SEC) / NIGHT_LEN_SEC;
      const x = margin + (w - margin * 2) * k;
      const y = arcTop + 40 + (1 - Math.sin(k * Math.PI)) * 80;
      return { x, y, isNight: true };
    }
    const dayK = t / SUNSET_AT_SEC;
    const x = margin + (w - margin * 2) * dayK;
    const y = arcTop + (1 - Math.sin(dayK * Math.PI)) * 90;
    return { x, y, isNight: false };
  }

  private drawCelestial(t: number, w: number, h: number): void {
    const g = this.celestialGfx;
    g.clear();
    const pos = this.celestialScreenPos(t, w, h);
    if (!pos) return;
    if (pos.isNight) {
      g.fillStyle(0xfff4d6, 0.35);
      g.fillCircle(pos.x, pos.y, 26);
      g.fillStyle(0xfff4d6, 0.55);
      g.fillCircle(pos.x, pos.y, 18);
      g.fillStyle(0xfffae8, 1);
      g.fillCircle(pos.x, pos.y, 14);
      g.fillStyle(0xc8c0a0, 0.8);
      g.fillCircle(pos.x - 4, pos.y - 3, 3);
      g.fillCircle(pos.x + 3, pos.y + 4, 2);
      g.fillCircle(pos.x + 5, pos.y - 4, 1.5);
    } else {
      const sunriseEnd = MORNING_LEN_SEC * 0.5;
      const sunsetStart = SUNSET_AT_SEC - AFTERNOON_LEN_SEC * 0.5;
      let sunColor = 0xffe27a;
      if (t < sunriseEnd) sunColor = lerpColor(0xff7a3a, 0xffe27a, t / sunriseEnd);
      else if (t > sunsetStart) {
        sunColor = lerpColor(
          0xffe27a, 0xff5a1a,
          (t - sunsetStart) / (SUNSET_AT_SEC - sunsetStart),
        );
      }
      g.fillStyle(sunColor, 0.18);
      g.fillCircle(pos.x, pos.y, 50);
      g.fillStyle(sunColor, 0.4);
      g.fillCircle(pos.x, pos.y, 32);
      g.fillStyle(sunColor, 1);
      g.fillCircle(pos.x, pos.y, 20);
      g.fillStyle(0xfff8d0, 1);
      g.fillCircle(pos.x, pos.y, 13);
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

    for (const q of this.sequoias.values()) {
      const k = `${q.i},${q.j}`;
      if (!this.explored.has(k)) continue;
      const { x, y } = toMini(q.i + 0.5, q.j + 0.5);
      ctx.fillStyle = "#1f5022";
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      ctx.fillStyle = "#5fa860";
      ctx.fillRect(x - 0.5, y - 1.5, 1, 1);
    }
    for (const vol of this.volcanoes.values()) {
      const k = `${vol.i},${vol.j}`;
      if (!this.explored.has(k)) continue;
      const { x, y } = toMini(vol.i + 0.5, vol.j + 0.5);
      ctx.fillStyle = "#3a2418";
      ctx.beginPath();
      ctx.moveTo(x, y - 2.4);
      ctx.lineTo(x + 2.4, y + 1.6);
      ctx.lineTo(x - 2.4, y + 1.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ff6a1f";
      ctx.fillRect(x - 0.8, y - 1.4, 1.6, 1.2);
    }
    for (const a of this.artifacts.values()) {
      const i = Math.floor(a.gx);
      const j = Math.floor(a.gy);
      const k = `${i},${j}`;
      if (!this.explored.has(k)) continue;
      const { x, y } = toMini(a.gx, a.gy);
      ctx.fillStyle = a.found ? "#9a8a4a" : "#ffd84d";
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      if (!a.found) {
        ctx.strokeStyle = "rgba(255, 216, 77, 0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.stroke();
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
    isBot?: boolean;
    splitFrom?: PlayerId;
  }): void {
    this.names[msg.playerId] = msg.name;
    if (msg.language) this.tribeLanguages[msg.playerId] = msg.language;
    if (msg.isBot && !this.botSlots.includes(msg.playerId)) {
      this.botSlots.push(msg.playerId);
    }
    for (const snap of msg.units) {
      this.playerColors[snap.owner] = snap.color;
      if (!this.units.has(snap.id)) {
        this.units.set(snap.id, new Unit(this, snap, snap.owner === this.playerId, this.seed));
      } else {
        const u = this.units.get(snap.id);
        if (u) u.applySnapshot(snap, snap.owner === this.playerId);
      }
    }
    this.updateHud();
    if (msg.splitFrom !== undefined) {
      const parentName =
        this.names[msg.splitFrom] || t().hudTribeFallback(msg.splitFrom);
      this.showToast(
        t().toastTribeSplit(parentName, msg.name),
        "join",
        [msg.splitFrom, msg.playerId],
      );
    } else {
      this.showToast(t().toastJoinedTribe(msg.name), "join");
    }
  }

  private onOpponentLeft(msg: {
    playerId: PlayerId;
    removedUnitIds: string[];
  }): void {
    const goneName =
      this.names[msg.playerId] || t().hudTribeFallback(msg.playerId);
    this.names[msg.playerId] = "";
    for (const id of msg.removedUnitIds) {
      const u = this.units.get(id);
      if (u) {
        u.destroy();
        this.units.delete(id);
      }
    }
    this.updateHud();
    this.showToast(t().toastLeftGame(goneName), "leave");
  }

  private showToast(
    text: string,
    kind: "join" | "leave" | "grow" | "death" | "extinct" | "artifact" | "campfire",
    tintOwner?: PlayerId | PlayerId[],
  ): void {
    const root = document.getElementById("toasts");
    if (!root) return;
    const el = document.createElement("div");
    const cls = kind === "join" ? "" : kind;
    el.className = `toast ${cls}`.trim();
    el.textContent = text;
    if (tintOwner !== undefined) {
      const owners = Array.isArray(tintOwner) ? tintOwner : [tintOwner];
      const colors = owners.map((o) => this.playerColorCss(o));
      if (colors.length === 1) {
        el.style.borderColor = colors[0];
        el.style.boxShadow = `0 6px 20px rgba(0,0,0,0.5), 0 0 12px ${colors[0]}88`;
      } else if (colors.length >= 2) {
        el.style.borderImage = `linear-gradient(90deg, ${colors[0]}, ${colors[1]}) 1`;
        el.style.borderImageSlice = "1";
        el.style.borderStyle = "solid";
        el.style.boxShadow = `0 6px 20px rgba(0,0,0,0.5), 0 0 10px ${colors[0]}66, 0 0 10px ${colors[1]}66`;
      }
    }
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    const lifetime = kind === "extinct" || kind === "artifact" ? 6000 : 4000;
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 250);
    }, lifetime);
  }

  private applyState(msg: StateMessage): void {
    this.serverTick = msg.tick;
    if (typeof msg.gameTimeSec === "number") {
      const drift = msg.gameTimeSec - this.gameTimeSec;
      if (Math.abs(drift) > 0.5) this.gameTimeSec = msg.gameTimeSec;
      else this.gameTimeSec += drift * 0.2;
      this.lastPhase = phaseAt(this.gameTimeSec);
    }
    if (typeof msg.serverTickMs === "number") this.perfServerTickMs = msg.serverTickMs;
    if (typeof msg.animalCount === "number") this.perfAnimalCount = msg.animalCount;
    if (typeof msg.unitCount === "number") this.perfUnitCount = msg.unitCount;
    if (typeof msg.fishCount === "number") this.perfFishCount = msg.fishCount;
    if (msg.encounters && msg.encounters.length > 0) {
      for (const ev of msg.encounters) {
        if (ev.a === this.playerId || ev.b === this.playerId) {
          const otherId = ev.a === this.playerId ? ev.b : ev.a;
          const myGain =
            ev.a === this.playerId ? ev.transfersBtoA : ev.transfersAtoB;
          const myLoss =
            ev.a === this.playerId ? ev.transfersAtoB : ev.transfersBtoA;
          const s = t();
          const name = this.names[otherId] || s.hudTribeFallback(otherId);
          const parts: string[] = [s.toastEncounterWith(name)];
          if (myGain > 0) {
            parts.push(
              myGain === 1
                ? s.toastWomenJoinedYouSing
                : s.toastWomenJoinedYou(myGain),
            );
          }
          if (myLoss > 0) {
            parts.push(
              myLoss === 1
                ? s.toastWomenLeftYouSing
                : s.toastWomenLeftYou(myLoss),
            );
          }
          this.showToast(parts.join(": "), "join", [this.playerId, otherId]);
          continue;
        }
        const s = t();
        const aName = this.names[ev.a] || s.hudTribeFallback(ev.a);
        const bName = this.names[ev.b] || s.hudTribeFallback(ev.b);
        const moves: string[] = [];
        if (ev.transfersAtoB > 0) {
          moves.push(
            ev.transfersAtoB === 1
              ? s.toastWomenMovedToSing(bName)
              : s.toastWomenMovedTo(ev.transfersAtoB, bName),
          );
        }
        if (ev.transfersBtoA > 0) {
          moves.push(
            ev.transfersBtoA === 1
              ? s.toastWomenMovedToSing(aName)
              : s.toastWomenMovedTo(ev.transfersBtoA, aName),
          );
        }
        const text =
          moves.length > 0
            ? s.toastEncounterTribes(aName, bName, moves.join(", "))
            : s.toastEncounterTribesMet(aName, bName);
        this.showToast(text, "join", [ev.a, ev.b]);
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
        const s = t();
        const txt =
          ownGrew === 1 ? s.toastOwnGrewSing : s.toastOwnGrew(ownGrew);
        this.showToast(txt, "grow");
      }
      for (const ownerStr of Object.keys(otherGrew)) {
        const owner = Number(ownerStr);
        const n = otherGrew[owner];
        const s = t();
        const name = this.names[owner] || s.hudTribeFallback(owner);
        const txt =
          n === 1 ? s.toastOtherGrewSing(name) : s.toastOtherGrew(name, n);
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
      u.applySnapshot(snap, isLocal);
    }
    for (const ro of msg.newRemovedObjects) {
      this.applyRemoved(ro);
    }
    for (const ro of msg.respawnedObjects) {
      this.applyRespawn(ro);
    }
    if (msg.treeGrowthEvents) {
      for (const ev of msg.treeGrowthEvents) {
        this.applyTreeGrowthEvent(ev);
      }
    }
    if (msg.tribeOrigin) {
      this.tribeOrigin = msg.tribeOrigin;
    }
    if (
      typeof msg.winnerOrigin === "number" &&
      msg.winnerOrigin >= 0 &&
      !this.isGameWon &&
      !this.isGameOver
    ) {
      this.handleVictory(msg.winnerOrigin);
    }
    for (const fp of msg.newFootprints) {
      this.footprints.push(fp);
    }
    for (const id of msg.removedAnimalIds) {
      const a = this.animals.get(id);
      if (a) {
        this.animals.delete(id);
        a.die();
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
    const isNight = this.lastPhase === "night";
    if (ownDied > 0 && !extinctSet.has(this.playerId)) {
      if (isNight) {
        this.nightDeathOwn += ownDied;
      } else {
        const s = t();
        const txt =
          ownDied === 1 ? s.toastOwnDiedSing : s.toastOwnDied(ownDied);
        this.showToast(txt, "death");
      }
    }
    for (const ownerStr of Object.keys(otherDied)) {
      const owner = Number(ownerStr);
      if (extinctSet.has(owner)) continue;
      const n = otherDied[owner];
      if (isNight) {
        this.nightDeathOther[owner] = (this.nightDeathOther[owner] ?? 0) + n;
        continue;
      }
      const s = t();
      const name = this.names[owner] || s.hudTribeFallback(owner);
      const txt =
        n === 1 ? s.toastOtherDiedSing(name) : s.toastOtherDied(name, n);
      this.showToast(txt, "death");
    }
    if (msg.extinctTribes && msg.extinctTribes.length > 0) {
      const s = t();
      for (const owner of msg.extinctTribes) {
        if (owner === this.playerId) continue;
        if (isNight) {
          this.nightExtinctOthers.push(owner);
          continue;
        }
        const name = this.names[owner] || s.hudTribeFallback(owner);
        this.showToast(s.toastExtinct(name), "extinct");
      }
    }
    if (msg.respawnedTribes && msg.respawnedTribes.length > 0) {
      const s = t();
      for (const owner of msg.respawnedTribes) {
        if (owner === this.playerId) continue;
        const name = this.names[owner] || s.hudTribeFallback(owner);
        this.showToast(s.toastTribeFounded(name), "join", owner);
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
    if (msg.removedFishIds) {
      for (const id of msg.removedFishIds) {
        const f = this.fishes.get(id);
        if (f) {
          this.fishes.delete(id);
          f.remove();
        }
      }
    }
    if (msg.fishes) {
      for (const snap of msg.fishes) {
        const f = this.fishes.get(snap.id);
        if (f) f.setTarget(snap.gx, snap.gy);
        else this.fishes.set(snap.id, new Fish(this, snap.id, snap.gx, snap.gy));
      }
    }
    if (msg.campfires) {
      for (const snap of msg.campfires) this.applyCampfireSnap(snap, true);
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
    if (msg.artifactFinds && msg.artifactFinds.length > 0) {
      this.handleArtifactFinds(msg.artifactFinds);
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

    let countsChanged = false;
    if (msg.tribeCounts) {
      const prev = this.tribeCounts;
      const next = msg.tribeCounts;
      if (prev.length !== next.length) {
        countsChanged = true;
      } else {
        for (let i = 0; i < next.length; i++) {
          if ((prev[i] ?? 0) !== (next[i] ?? 0)) {
            countsChanged = true;
            break;
          }
        }
      }
      this.tribeCounts = next;
    }

    if (
      countsChanged ||
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

  private applyCampfireSnap(snap: CampfireSnapshot, notify: boolean): void {
    const existing = this.campfires.get(snap.id);
    if (existing) {
      if (existing.owner !== snap.owner) {
        existing.remove();
        this.campfires.delete(snap.id);
        this.visObjectCache.delete(`cf:${snap.id}`);
      } else {
        existing.applyState(snap.gx, snap.gy, snap.fuel, snap.size);
        return;
      }
    }
    const f = new Campfire(
      this,
      snap.id,
      snap.owner,
      snap.gx,
      snap.gy,
      snap.fuel,
      snap.size,
      this.seed,
    );
    this.campfires.set(snap.id, f);
    if (notify) {
      const s = t();
      const name = this.names[snap.owner] || s.hudTribeFallback(snap.owner);
      const text =
        snap.owner === this.playerId
          ? s.toastOwnCampfire
          : s.toastOtherCampfire(name);
      this.showToast(text, "campfire", snap.owner);
    }
  }

  private spawnArtifactLocal(snap: ArtifactSnapshot): void {
    if (this.artifacts.has(snap.id)) return;
    const a = new Artifact(
      this,
      snap.id,
      snap.gx,
      snap.gy,
      snap.kind,
      snap.foundBy,
      this.seed,
    );
    this.artifacts.set(snap.id, a);
  }

  private describeReward(reward: ArtifactReward): string {
    const s = t();
    if (reward.kind === "newMember") return s.rewardNewMember;
    if (reward.kind === "fleisch") return s.rewardAmount(s.resFleisch, reward.amount);
    if (reward.kind === "fisch") return s.rewardAmount(s.resFisch, reward.amount);
    if (reward.kind === "beeren") return s.rewardAmount(s.resBeeren, reward.amount);
    if (reward.kind === "pilze") return s.rewardAmount(s.resPilze, reward.amount);
    return `${reward.amount}`;
  }

  private handleArtifactFinds(events: ArtifactFindEvent[]): void {
    for (const ev of events) {
      const art = this.artifacts.get(ev.id);
      if (art) art.markFound();
      const rewardText = this.describeReward(ev.reward);
      const s = t();
      if (ev.finder === this.playerId) {
        this.showToast(s.toastArtifactOwn(rewardText), "artifact", ev.finder);
      } else {
        const name = this.names[ev.finder] || s.hudTribeFallback(ev.finder);
        this.showToast(
          s.toastArtifactOther(name, rewardText),
          "artifact",
          ev.finder,
        );
      }
    }
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

  private applyTreeGrowthEvent(ev: TreeGrowthEvent): void {
    const k = objKey("tree", ev.i, ev.j);
    if (ev.stage >= 4) {
      this.treeGrowthMap.delete(`${ev.i},${ev.j}`);
      return;
    }
    this.treeGrowthMap.set(`${ev.i},${ev.j}`, ev.stage);
    const existing = this.trees.get(k);
    if (existing) {
      existing.setStage(ev.stage);
      return;
    }
    const cx = Math.floor(ev.i / CHUNK_SIZE);
    const cy = Math.floor(ev.j / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return;
    const t = new Tree(this, k, ev.i, ev.j, this.seed, ev.stage);
    chunk.trees.set(k, t);
    this.trees.set(k, t);
    const v = this.visible.has(`${ev.i},${ev.j}`);
    t.container.setVisible(v);
    t.shadow.setVisible(v);
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
      this.treeGrowthMap.delete(`${ro.i},${ro.j}`);
      const existing = this.trees.get(k);
      if (existing) {
        existing.setStage(4);
      } else {
        const t = new Tree(this, k, ro.i, ro.j, this.seed);
        chunk.trees.set(k, t);
        this.trees.set(k, t);
        t.container.setVisible(v);
        t.shadow.setVisible(v);
      }
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
    if (!p.leftButtonDown() && !p.rightButtonDown()) return;
    this.click = { startX: p.x, startY: p.y, moved: false };
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

    if (!this.click) return;
    const dx = p.x - this.click.startX;
    const dy = p.y - this.click.startY;
    if (Math.hypot(dx, dy) > 8) this.click.moved = true;
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
    if (!this.click) return;
    const moved = this.click.moved;
    this.click = null;
    if (moved) return;
    const { gx, gy } = screenToGrid(p.worldX, p.worldY);
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    if (this.checkDoubleClick(i, j)) {
      this.tryIgniteCampfireAt(i, j);
    } else {
      this.commandAllUnits(p);
    }
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
      const { gx, gy } = screenToGrid(p.worldX, p.worldY);
      const i = Math.floor(gx);
      const j = Math.floor(gy);
      if (this.checkDoubleClick(i, j)) {
        this.tryIgniteCampfireAt(i, j);
      } else {
        this.commandAllUnits(p);
      }
    }
    this.touchPan = null;
  }

  private checkDoubleClick(i: number, j: number): boolean {
    const now = performance.now();
    const isDouble =
      now - this.lastClickMs < GameScene.DOUBLE_CLICK_MS &&
      i === this.lastClickI &&
      j === this.lastClickJ;
    if (isDouble) {
      this.lastClickMs = 0;
      this.lastClickI = -99999;
      this.lastClickJ = -99999;
      return true;
    }
    this.lastClickMs = now;
    this.lastClickI = i;
    this.lastClickJ = j;
    return false;
  }

  private tryIgniteCampfireAt(i: number, j: number): void {
    const s = t();
    if (!this.visible.has(`${i},${j}`)) {
      this.showToast(s.toastCampfireNotVisible, "death");
      return;
    }
    const res = this.resources[this.playerId];
    if (!res || res.holz < 1 || res.stein < 1) {
      this.showToast(s.toastCampfireMissingResources, "death");
      return;
    }
    if (this.harvestableAt(i, j) || !this.tileIsLand(i, j)) {
      this.showToast(s.toastCampfireNotHere, "death");
      return;
    }
    let nearestSq = Infinity;
    for (const u of this.units.values()) {
      if (u.owner !== this.playerId) continue;
      const dx = u.gx - (i + 0.5);
      const dy = u.gy - (j + 0.5);
      const d2 = dx * dx + dy * dy;
      if (d2 < nearestSq) nearestSq = d2;
    }
    if (nearestSq > 100) {
      this.showToast(s.toastCampfireTooFar, "death");
      return;
    }
    this.net.send({ type: "igniteCampfire", i, j });
    this.setMoveTarget(i, j, "harvest");
  }

  private tileIsLand(i: number, j: number): boolean {
    return isLandTile(this.seed, i, j);
  }

  private commandAllUnits(p: Phaser.Input.Pointer): void {
    const ids = [...this.units.values()]
      .filter((u) => u.owner === this.playerId)
      .map((u) => u.id);
    if (ids.length === 0) return;
    this.dispatchUnitCommand(p, ids);
  }

  private dispatchUnitCommand(p: Phaser.Input.Pointer, ids: string[]): void {
    const { gx, gy } = screenToGrid(p.worldX, p.worldY);
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const k = `${i},${j}`;
    const visibleHere = this.visible.has(k);
    const directAnimalId = this.animalNearScreenPoint(p);
    if (directAnimalId) {
      const animal = this.animals.get(directAnimalId);
      const ti = animal ? Math.floor(animal.gx) : i;
      const tj = animal ? Math.floor(animal.gy) : j;
      this.net.send({ type: "hunt", unitIds: ids, animalId: directAnimalId });
      this.setMoveTarget(ti, tj, "hunt");
      return;
    }
    if (visibleHere && this.harvestableAt(i, j)) {
      this.net.send({ type: "harvest", unitIds: ids, i, j });
      this.setMoveTarget(i, j, "harvest");
      return;
    }
    this.net.send({ type: "move", unitIds: ids, i, j });
    this.setMoveTarget(i, j, "move");
  }

  private animalNearScreenPoint(p: Phaser.Input.Pointer): string | null {
    const wx = p.worldX;
    const wy = p.worldY;
    let best: { id: string; d: number } | null = null;
    for (const a of this.animals.values()) {
      if (!a.container.visible) continue;
      const i = Math.floor(a.gx);
      const j = Math.floor(a.gy);
      if (!this.visible.has(`${i},${j}`)) continue;
      const dx = a.container.x - wx;
      const dy = a.container.y - wy;
      const d = Math.hypot(dx, dy);
      if (d > 22) continue;
      if (!best || d < best.d) best = { id: a.id, d };
    }
    return best?.id ?? null;
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

  private setupHudDrag(hud: HTMLElement): void {
    const STORAGE_KEY = "rts.hud.position";
    let stored: { x: number; y: number } | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed.x === "number" &&
          typeof parsed.y === "number"
        ) {
          stored = parsed;
        }
      }
    } catch {
      stored = null;
    }
    const clampPosition = (x: number, y: number): { x: number; y: number } => {
      const w = hud.offsetWidth;
      const h = hud.offsetHeight;
      const mx = Math.max(0, window.innerWidth - w);
      const my = Math.max(0, window.innerHeight - h);
      return {
        x: Math.max(0, Math.min(mx, x)),
        y: Math.max(0, Math.min(my, y)),
      };
    };
    const setPosition = (x: number, y: number) => {
      const c = clampPosition(x, y);
      hud.style.left = `${c.x}px`;
      hud.style.top = `${c.y}px`;
      hud.style.right = "auto";
      hud.style.bottom = "auto";
    };
    if (stored) setPosition(stored.x, stored.y);

    let drag: {
      pointerId: number;
      startX: number;
      startY: number;
      baseX: number;
      baseY: number;
      moved: boolean;
    } | null = null;

    const onDown = (ev: PointerEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target && target.closest("[data-spectate-slot]")) {
        return;
      }
      const rect = hud.getBoundingClientRect();
      drag = {
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        baseX: rect.left,
        baseY: rect.top,
        moved: false,
      };
      try {
        hud.setPointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
    };
    const onMove = (ev: PointerEvent) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      const dx = ev.clientX - drag.startX;
      const dy = ev.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > 5) {
        drag.moved = true;
        hud.classList.add("dragging");
      }
      if (drag.moved) {
        setPosition(drag.baseX + dx, drag.baseY + dy);
        ev.preventDefault();
      }
    };
    const finish = (ev: PointerEvent) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      const moved = drag.moved;
      drag = null;
      hud.classList.remove("dragging");
      try {
        hud.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      if (moved) {
        const rect = hud.getBoundingClientRect();
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ x: rect.left, y: rect.top }),
          );
        } catch {
          // ignore
        }
        const stopper = (e: MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
        };
        hud.addEventListener("click", stopper, { capture: true, once: true });
      }
    };

    hud.addEventListener("pointerdown", onDown);
    hud.addEventListener("pointermove", onMove);
    hud.addEventListener("pointerup", finish);
    hud.addEventListener("pointercancel", finish);

    window.addEventListener("resize", () => {
      const rect = hud.getBoundingClientRect();
      setPosition(rect.left, rect.top);
    });
  }

  private onPhaseChange(prev: DayPhase): void {
    if (prev === "night" && this.lastPhase === "morning") this.onSunrise();
    if (prev !== "night" && this.lastPhase === "night") this.onNightfall();
    this.visSourceHash = -1;
    this.updateHud();
  }

  private onNightfall(): void {
    this.showToast(t().toastNightfall, "death");
  }

  private onSunrise(): void {
    const s = t();
    if (this.nightDeathOwn > 0) {
      const txt =
        this.nightDeathOwn === 1
          ? s.toastOwnDiedSing
          : s.toastOwnDied(this.nightDeathOwn);
      this.showToast(s.toastSunriseLost(txt), "death");
    } else {
      this.showToast(s.toastSunriseSafe, "grow");
    }
    for (const ownerStr of Object.keys(this.nightDeathOther)) {
      const owner = Number(ownerStr);
      const n = this.nightDeathOther[owner];
      const name = this.names[owner] || s.hudTribeFallback(owner);
      const txt = n === 1 ? s.toastOtherDiedSing(name) : s.toastOtherDied(name, n);
      this.showToast(txt, "death");
    }
    for (const owner of this.nightExtinctOthers) {
      const name = this.names[owner] || s.hudTribeFallback(owner);
      this.showToast(s.toastExtinct(name), "extinct");
    }
    this.nightDeathOwn = 0;
    this.nightDeathOther = {};
    this.nightExtinctOthers = [];
  }

  private updateHud(): void {
    if (!this.hud) return;
    const s = t();
    const myName = this.names[this.playerId] ?? s.hudYou;
    const myColor = this.playerColorCss(this.playerId);
    const myRes = this.resources[this.playerId] ?? {
      holz: 0, wasser: 0, beeren: 0, pilze: 0,
      fleisch: 0, fisch: 0, stein: 0,
    };
    const labels: Record<keyof Resources, string> = {
      holz: s.resHolz,
      wasser: s.resWasser,
      beeren: s.resBeeren,
      pilze: s.resPilze,
      fleisch: s.resFleisch,
      fisch: s.resFisch,
      stein: s.resStein,
    };
    const resHtml = RESOURCE_KEYS.map(
      (k) =>
        `<div class="item"><span class="ico ${k}"></span>` +
        `<span class="label">${labels[k]}</span><b>${myRes[k]}</b></div>`,
    ).join("");

    const tribeCounts = this.tribeCounts;
    const isNight = this.lastPhase === "night";
    const countChip = (n: number) =>
      `<span class="count" title="${s.hudTribeMembers}">👥 ${n}</span>`;
    const ownCountChip = isNight
      ? `<span class="count" title="${s.hudTribeMembers}">👥 ?</span>`
      : countChip(tribeCounts[this.playerId] ?? 0);
    const phaseLabel = s.phaseLabel(this.lastPhase);
    const clockHtml = `<span class="clock" title="${phaseLabel}">${this.clockString()} ${s.phaseIcon(this.lastPhase)}</span>`;

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
          `${flag ? `<span class="flag" title="${LANGUAGE_LABEL[this.tribeLanguages[i] as NameLanguage] ?? ""}">${flag}</span> ` : ""}` +
          `${escapeHtml(n)} ${countChip(tribeCounts[i] ?? 0)}${eye}</div>`,
      );
    }
    const othersHtml = otherRows.length
      ? `<div class="others">${otherRows.join("")}</div>`
      : `<div class="others">${escapeHtml(s.hudWaitingForOthers)}</div>`;

    const myFlag = this.flagFor(this.playerId);
    const meActive = this.spectatorTarget === null ? " active" : "";
    this.hud.innerHTML =
      `<div class="hud-drag-handle"></div>` +
      `<div class="me clickable${meActive}" data-spectate-slot="${this.playerId}">` +
      `<span class="swatch" style="background:${myColor}"></span>` +
      `${escapeHtml(s.hudTribeOf(myName))}${myFlag ? ` <span class="flag">${myFlag}</span>` : ""} ` +
      `${ownCountChip} ${clockHtml}</div>` +
      this.growthHudHtml() +
      `<div class="res">${resHtml}</div>` +
      othersHtml;
  }

  private togglePerf(): void {
    this.perfVisible = !this.perfVisible;
    localStorage.setItem("rts.perfVisible", this.perfVisible ? "1" : "0");
    if (this.perfEl) this.perfEl.style.display = this.perfVisible ? "" : "none";
  }

  private updatePerf(): void {
    if (!this.perfEl || !this.perfVisible) return;
    const fps = this.perfFrameTimeMs > 0 ? 1000 / this.perfFrameTimeMs : 0;
    const stick = this.perfServerTickMs;
    const tickBudget = 1000 / TICK_RATE;
    const chunks = this.chunks.size;
    const localUnits = this.units.size;
    const localAnimals = this.animals.size;
    const localFishes = this.fishes.size;
    const fpsStr = fps.toFixed(0).padStart(3, " ");
    const ftStr = this.perfFrameTimeMs.toFixed(1).padStart(4, " ");
    const stickStr = stick.toFixed(1).padStart(4, " ");
    this.perfEl.textContent =
      `fps   ${fpsStr}  (${ftStr} ms)\n` +
      `srv   ${stickStr} ms / ${tickBudget.toFixed(0)} ms tick\n` +
      `world A:${this.perfAnimalCount} U:${this.perfUnitCount} F:${this.perfFishCount}\n` +
      `local A:${localAnimals} U:${localUnits} F:${localFishes} chk:${chunks}`;
    let cls = "good";
    if (fps < 30 || stick > tickBudget * 1.2) cls = "bad";
    else if (fps < 50 || stick > tickBudget) cls = "warn";
    this.perfEl.className = cls;
  }

  private flagFor(playerId: PlayerId): string {
    const lang = this.tribeLanguages[playerId] as NameLanguage | undefined;
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

    const s = t();
    let cls = "growth";
    let stateLabel: string;
    let stateCls = "state";
    let pct = Math.round(progress * 100);

    if (count >= MAX_TRIBE_SIZE) {
      cls += " full";
      stateCls += " full";
      stateLabel = s.growthFull;
      pct = 100;
    } else if (count < 2) {
      cls += " paused";
      stateLabel = s.growthTooFew;
    } else if (males < 1 || females < 1) {
      cls += " paused";
      stateLabel = males < 1 ? s.growthNoMan : s.growthNoWoman;
    } else if (active && progress >= 0.8) {
      cls += " imminent";
      stateCls += " imminent";
      stateLabel = s.growthImminent;
    } else if (active) {
      stateCls += " active";
      stateLabel = `${pct}%`;
    } else {
      cls += " paused";
      stateLabel = s.growthPaused;
    }

    const fillPct = count >= MAX_TRIBE_SIZE ? 100 : Math.round(progress * 100);
    return (
      `<div class="${cls}">` +
      `<div class="label-row"><span class="lbl">${escapeHtml(s.growthLabel)}</span>` +
      `<span class="${stateCls}">${escapeHtml(stateLabel)}</span></div>` +
      `<div class="bar"><div class="fill" style="width:${fillPct}%"></div></div>` +
      `</div>`
    );
  }

  private checkGameOver(): void {
    if (this.isGameOver || this.isGameWon) return;
    if (this.initialTribeSize === 0) return;
    const alive = [...this.units.values()].some((u) => u.owner === this.playerId);
    if (alive) return;
    this.isGameOver = true;
    this.time.delayedCall(2400, () => this.showGameOver());
  }

  private handleVictory(winnerOrigin: PlayerId): void {
    this.isGameWon = true;
    const wonByMe = winnerOrigin === this.playerId;
    this.time.delayedCall(800, () => this.showVictory(winnerOrigin, wonByMe));
  }

  private showVictory(winnerOrigin: PlayerId, wonByMe: boolean): void {
    const elapsedMs = Date.now() - this.gameStartMs;
    const totalSec = Math.floor(elapsedMs / 1000);
    const m = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const timeStr = `${m}:${sec.toString().padStart(2, "0")}`;
    const tr = t();

    const collected = this.collectedTotals;
    const labels: Record<keyof Resources, string> = {
      holz: tr.resHolz,
      wasser: tr.resWasser,
      beeren: tr.resBeeren,
      pilze: tr.resPilze,
      fleisch: tr.resFleisch,
      fisch: tr.resFisch,
      stein: tr.resStein,
    };
    const totalCollected = RESOURCE_KEYS.reduce((a, k) => a + (collected[k] ?? 0), 0);
    const resHtml = RESOURCE_KEYS.map(
      (k) =>
        `<div class="go-item"><span class="go-ico ${k}"></span>` +
        `<span class="go-label">${labels[k]}</span><b>${collected[k]}</b></div>`,
    ).join("");

    let tribesShare = 0;
    let tribesTotal = 0;
    for (let i = 0; i < this.tribeCounts.length; i++) {
      if ((this.tribeCounts[i] ?? 0) <= 0) continue;
      tribesTotal++;
      if (this.tribeOrigin[i] === winnerOrigin) tribesShare++;
    }

    const winnerName =
      this.names[winnerOrigin] || tr.hudTribeFallback(winnerOrigin);
    const title = wonByMe ? tr.victoryTitle : tr.victoryOtherTitle(winnerName);
    const subtitle = wonByMe ? tr.victorySubtitle : tr.victoryOtherSubtitle(winnerName);

    const overlay = document.createElement("div");
    overlay.id = "gameover";
    overlay.classList.add(wonByMe ? "victory" : "defeat");
    overlay.innerHTML =
      `<div id="gameover-card">` +
      `<h1>${escapeHtml(title)}</h1>` +
      `<div class="go-sub">${escapeHtml(subtitle)}</div>` +
      `<div class="go-stats">` +
      `<div class="go-row"><span>${escapeHtml(tr.victoryStatTribes)}</span><b>${tribesShare} / ${tribesTotal}</b></div>` +
      `<div class="go-row"><span>${escapeHtml(tr.goSurvival)}</span><b>${timeStr}</b></div>` +
      `<div class="go-row"><span>${escapeHtml(tr.goMaxTribe)}</span><b>${this.maxTribeSize}</b></div>` +
      `<div class="go-row"><span>${escapeHtml(tr.goCollectedTotal)}</span><b>${totalCollected}</b></div>` +
      `</div>` +
      `<div class="go-sub">${escapeHtml(tr.goResources)}</div>` +
      `<div class="go-res">${resHtml}</div>` +
      `<div class="btn-row"><button id="gameover-btn" class="btn">${escapeHtml(tr.goRestart)}</button></div>` +
      `</div>`;
    document.body.appendChild(overlay);
    const btn = document.getElementById("gameover-btn");
    btn?.addEventListener("click", () => window.location.reload());
  }

  private showGameOver(): void {
    const elapsedMs = Date.now() - this.gameStartMs;
    const totalSec = Math.floor(elapsedMs / 1000);
    const m = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const timeStr = `${m}:${sec.toString().padStart(2, "0")}`;
    const tr = t();

    const collected = this.collectedTotals;
    const labels: Record<keyof Resources, string> = {
      holz: tr.resHolz,
      wasser: tr.resWasser,
      beeren: tr.resBeeren,
      pilze: tr.resPilze,
      fleisch: tr.resFleisch,
      fisch: tr.resFisch,
      stein: tr.resStein,
    };
    const totalCollected = RESOURCE_KEYS.reduce((a, k) => a + (collected[k] ?? 0), 0);
    const resHtml = RESOURCE_KEYS.map(
      (k) =>
        `<div class="go-item"><span class="go-ico ${k}"></span>` +
        `<span class="go-label">${labels[k]}</span><b>${collected[k]}</b></div>`,
    ).join("");

    const myName = this.names[this.playerId] || tr.hudTribeFallback(this.playerId);
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
      `<h1>${escapeHtml(tr.goTitle)}</h1>` +
      `<div class="go-sub">${escapeHtml(tr.goStatistics)}</div>` +
      `<div class="go-stats">` +
      `<div class="go-row"><span>${escapeHtml(tr.goSurvival)}</span><b>${timeStr}</b></div>` +
      `<div class="go-row"><span>${escapeHtml(tr.goMaxTribe)}</span><b>${this.maxTribeSize}</b></div>` +
      `<div class="go-row"><span>${escapeHtml(tr.goCollectedTotal)}</span><b>${totalCollected}</b></div>` +
      `<div class="go-row"><span>${escapeHtml(tr.goPoints)}</span><b>${entry.score}</b></div>` +
      `</div>` +
      `<div class="go-sub">${escapeHtml(tr.goResources)}</div>` +
      `<div class="go-res">${resHtml}</div>` +
      `<div class="go-sub">${escapeHtml(tr.goLeaderboard)}</div>` +
      `<div class="lb" id="gameover-lb">` +
      `<div class="lb-row lb-head">` +
      `<span class="lb-rank">${escapeHtml(tr.lbHeaderRank)}</span>` +
      `<span class="lb-name">${escapeHtml(tr.lbHeaderTribe)}</span>` +
      `<span class="lb-stat">${escapeHtml(tr.lbHeaderTime)}</span>` +
      `<span class="lb-stat">${escapeHtml(tr.lbHeaderCollected)}</span>` +
      `<span class="lb-stat">${escapeHtml(tr.lbHeaderMembers)}</span>` +
      `<span class="lb-score">${escapeHtml(tr.lbHeaderScore)}</span>` +
      `</div>` +
      `<div class="lb-loading">${escapeHtml(tr.lbLoading)}</div>` +
      `</div>` +
      `<div id="gameover-rank-note"></div>` +
      `<div class="btn-row"><button id="gameover-btn" class="btn">${escapeHtml(tr.goRestart)}</button></div>` +
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
    const tr = t();
    const entry = this.pendingScoreEntry;
    const top = msg.entries.slice(0, 10);
    const rows = top
      .map((e, idx) => {
        const isMe = !!entry && e.ts === msg.myEntryTs && e.score === entry.score;
        const rank = idx + 1;
        const timeStr = formatTime(e.timeSec);
        return (
          `<div class="lb-row${isMe ? " lb-me" : ""}">` +
          `<span class="lb-rank">${rank}</span>` +
          `<span class="lb-name">${escapeHtml(e.name)}</span>` +
          `<span class="lb-stat">${timeStr}</span>` +
          `<span class="lb-stat">${e.collected}</span>` +
          `<span class="lb-stat">${e.tribe}</span>` +
          `<span class="lb-score">${e.score}</span>` +
          `</div>`
        );
      })
      .join("");
    lb.innerHTML =
      `<div class="lb-row lb-head">` +
      `<span class="lb-rank">${escapeHtml(tr.lbHeaderRank)}</span>` +
      `<span class="lb-name">${escapeHtml(tr.lbHeaderTribe)}</span>` +
      `<span class="lb-stat">${escapeHtml(tr.lbHeaderTime)}</span>` +
      `<span class="lb-stat">${escapeHtml(tr.lbHeaderCollected)}</span>` +
      `<span class="lb-stat">${escapeHtml(tr.lbHeaderMembers)}</span>` +
      `<span class="lb-score">${escapeHtml(tr.lbHeaderScore)}</span>` +
      `</div>` +
      (rows || `<div class="lb-loading">${escapeHtml(tr.lbEmpty)}</div>`);
    if (rankNote && entry && msg.myRank > top.length) {
      rankNote.innerHTML =
        `<div class="lb-note">${escapeHtml(tr.lbYourRank(msg.myRank))}</div>`;
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
