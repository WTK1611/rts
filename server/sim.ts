import { findPath } from "../shared/pathfinding";
import {
  emptyResources,
  Footprint,
  FOOTPRINT_LIFETIME_TICKS,
  MAX_PLAYERS,
  ObjectKind,
  PlayerId,
  RemovedObject,
  Resources,
  TICK_RATE,
  UnitSnapshot,
} from "../shared/protocol";
import {
  bushBerriesAt,
  fishMeatAt,
  hasBushAt,
  hasFishAt,
  hasMushroomAt,
  hasTreeAt,
  isLandTile,
  mushroomBerriesAt,
  spawnsFromSeed,
  SpawnArea,
  treeWoodAt,
} from "../shared/worldgen";

const HARVEST_INTERVAL = 1.2;
const TREE_HARVEST_AMOUNT = 5;
const BUSH_HARVEST_AMOUNT = 3;
const MUSH_HARVEST_AMOUNT = 1;
const FISH_HARVEST_AMOUNT = 1;
const TRIBE_SIZE = 4;

export const PLAYER_COLORS: number[] = [
  0x4ea1ff, 0xff6b6b, 0x6cdf6c, 0xffd84d, 0xc066ff,
  0xff9933, 0x66e0d0, 0xff66c4, 0xd4b878, 0x9ca0ff,
];

interface SimUnit {
  id: string;
  owner: PlayerId;
  gx: number;
  gy: number;
  speed: number;
  color: number;
  state: "idle" | "moving" | "harvesting";
  path: Array<{ gx: number; gy: number }>;
  harvestTarget: { kind: ObjectKind; i: number; j: number } | null;
  harvestTimer: number;
  lastFootprintTile: { i: number; j: number } | null;
}

function objKey(kind: ObjectKind, i: number, j: number): string {
  const p =
    kind === "tree"
      ? "t"
      : kind === "bush"
        ? "b"
        : kind === "mushroom"
          ? "m"
          : "f";
  return `${p}_${i}_${j}`;
}

export class Sim {
  seed: number;
  spawns: SpawnArea[];
  units: SimUnit[] = [];
  active: boolean[] = new Array(MAX_PLAYERS).fill(false);
  removedObjects: RemovedObject[] = [];
  removedKeys = new Set<string>();
  remaining = new Map<string, number>();
  resources: Resources[] = Array.from({ length: MAX_PLAYERS }, () =>
    emptyResources(),
  );
  newRemovedObjects: RemovedObject[] = [];
  footprints: Footprint[] = [];
  newFootprints: Footprint[] = [];
  tick = 0;

  constructor(seed: number) {
    this.seed = seed;
    this.spawns = spawnsFromSeed(seed);
  }

  addPlayer(p: PlayerId): UnitSnapshot[] {
    if (this.active[p]) return this.unitsSnapshot().filter((u) => u.owner === p);
    this.active[p] = true;
    const a = this.spawns[p];
    const offsets: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    const created: SimUnit[] = [];
    for (let k = 0; k < TRIBE_SIZE; k++) {
      const [di, dj] = offsets[k % offsets.length];
      const u: SimUnit = {
        id: `u_p${p}_${k}`,
        owner: p,
        gx: a.cx + di + 0.5,
        gy: a.cy + dj + 0.5,
        speed: 3.5,
        color: PLAYER_COLORS[p % PLAYER_COLORS.length],
        state: "idle",
        path: [],
        harvestTarget: null,
        harvestTimer: 0,
        lastFootprintTile: { i: a.cx + di, j: a.cy + dj },
      };
      this.units.push(u);
      created.push(u);
    }
    return created.map(this.snap);
  }

  removePlayer(p: PlayerId): string[] {
    if (!this.active[p]) return [];
    this.active[p] = false;
    const removed: string[] = [];
    this.units = this.units.filter((u) => {
      if (u.owner === p) {
        removed.push(u.id);
        return false;
      }
      return true;
    });
    this.resources[p] = emptyResources();
    return removed;
  }

  isWalkable(i: number, j: number): boolean {
    return isLandTile(this.seed, i, j);
  }

  unitsSnapshot(): UnitSnapshot[] {
    return this.units.map(this.snap);
  }

  private snap = (u: SimUnit): UnitSnapshot => ({
    id: u.id,
    owner: u.owner,
    gx: u.gx,
    gy: u.gy,
    state: u.state,
    color: u.color,
  });

  consumeNewRemovedObjects(): RemovedObject[] {
    const out = this.newRemovedObjects;
    this.newRemovedObjects = [];
    return out;
  }

  consumeNewFootprints(): Footprint[] {
    const out = this.newFootprints;
    this.newFootprints = [];
    return out;
  }

  cmdMove(owner: PlayerId, unitIds: string[], i: number, j: number): void {
    const claimed = new Set<string>();
    for (const id of unitIds) {
      const u = this.units.find((x) => x.id === id && x.owner === owner);
      if (!u) continue;
      const blocked = this.blockedTilesFor(u, claimed);
      let target = { i, j };
      if (blocked.has(`${i},${j}`) || !this.isWalkable(i, j)) {
        const free = this.findFreeTileNear(i, j, blocked);
        if (!free) continue;
        target = free;
      }
      this.startMove(u, target.i, target.j, blocked);
      const last = u.path[u.path.length - 1];
      if (last) claimed.add(`${Math.floor(last.gx)},${Math.floor(last.gy)}`);
      else claimed.add(`${Math.floor(u.gx)},${Math.floor(u.gy)}`);
    }
  }

  cmdHarvest(owner: PlayerId, unitIds: string[], i: number, j: number): void {
    const kind = this.objectKindAt(i, j);
    if (!kind) {
      this.cmdMove(owner, unitIds, i, j);
      return;
    }
    const claimed = new Set<string>();
    for (const id of unitIds) {
      const u = this.units.find((x) => x.id === id && x.owner === owner);
      if (!u) continue;
      const blocked = this.blockedTilesFor(u, claimed);
      this.startHarvest(u, kind, i, j, blocked);
      const last = u.path[u.path.length - 1];
      if (last) claimed.add(`${Math.floor(last.gx)},${Math.floor(last.gy)}`);
      else claimed.add(`${Math.floor(u.gx)},${Math.floor(u.gy)}`);
    }
  }

  private objectKindAt(i: number, j: number): ObjectKind | null {
    if (
      hasTreeAt(this.seed, i, j) &&
      !this.removedKeys.has(objKey("tree", i, j))
    ) return "tree";
    if (
      hasBushAt(this.seed, i, j) &&
      !this.removedKeys.has(objKey("bush", i, j))
    ) return "bush";
    if (
      hasMushroomAt(this.seed, i, j) &&
      !this.removedKeys.has(objKey("mushroom", i, j))
    ) return "mushroom";
    if (
      hasFishAt(this.seed, i, j) &&
      !this.removedKeys.has(objKey("fish", i, j))
    ) return "fish";
    return null;
  }

  private blockedTilesFor(self: SimUnit, claimed: Set<string>): Set<string> {
    const s = new Set<string>(claimed);
    for (const u of this.units) {
      if (u.id === self.id) continue;
      const last = u.path[u.path.length - 1];
      const ti = last ? Math.floor(last.gx) : Math.floor(u.gx);
      const tj = last ? Math.floor(last.gy) : Math.floor(u.gy);
      s.add(`${ti},${tj}`);
    }
    return s;
  }

  private findFreeTileNear(
    ti: number,
    tj: number,
    blocked: Set<string>,
  ): { i: number; j: number } | null {
    for (let r = 1; r <= 4; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const ni = ti + di;
          const nj = tj + dj;
          if (!this.isWalkable(ni, nj)) continue;
          if (blocked.has(`${ni},${nj}`)) continue;
          return { i: ni, j: nj };
        }
      }
    }
    return null;
  }

  private startMove(u: SimUnit, i: number, j: number, blocked: Set<string>): void {
    const path = findPath(
      (a, b) => this.isWalkable(a, b),
      Math.floor(u.gx),
      Math.floor(u.gy),
      i,
      j,
      blocked,
    );
    if (!path || path.length < 2) {
      u.path = [];
      u.harvestTarget = null;
      u.state = "idle";
      return;
    }
    u.path = path.slice(1).map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }));
    u.state = "moving";
    u.harvestTarget = null;
  }

  private startHarvest(
    u: SimUnit,
    kind: ObjectKind,
    ti: number,
    tj: number,
    blocked: Set<string>,
  ): void {
    const candidates: Array<{ i: number; j: number }> = [];
    if (this.isWalkable(ti, tj)) candidates.push({ i: ti, j: tj });
    const adj: Array<[number, number]> = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (const [di, dj] of adj) {
      const ni = ti + di;
      const nj = tj + dj;
      if (this.isWalkable(ni, nj)) candidates.push({ i: ni, j: nj });
    }
    let bestPath: ReturnType<typeof findPath> = null;
    for (const c of candidates) {
      if (blocked.has(`${c.i},${c.j}`)) continue;
      const p = findPath(
        (a, b) => this.isWalkable(a, b),
        Math.floor(u.gx),
        Math.floor(u.gy),
        c.i,
        c.j,
        blocked,
      );
      if (p && (!bestPath || p.length < bestPath.length)) bestPath = p;
    }
    if (!bestPath) return;
    u.path =
      bestPath.length > 1
        ? bestPath.slice(1).map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }))
        : [];
    u.harvestTarget = { kind, i: ti, j: tj };
    u.harvestTimer = 0;
    u.state = u.path.length > 0 ? "moving" : "harvesting";
  }

  private maybeFootprint(u: SimUnit): void {
    const ti = Math.floor(u.gx);
    const tj = Math.floor(u.gy);
    const lf = u.lastFootprintTile;
    if (lf && lf.i === ti && lf.j === tj) return;
    u.lastFootprintTile = { i: ti, j: tj };
    const fp: Footprint = { o: u.owner, i: ti, j: tj, t: this.tick };
    this.footprints.push(fp);
    this.newFootprints.push(fp);
  }

  private expireFootprints(): void {
    if (this.footprints.length === 0) return;
    const cutoff = this.tick - FOOTPRINT_LIFETIME_TICKS;
    let drop = 0;
    while (drop < this.footprints.length && this.footprints[drop].t < cutoff) {
      drop++;
    }
    if (drop > 0) this.footprints.splice(0, drop);
  }

  step(dt: number): void {
    this.tick++;
    for (const u of this.units) {
      if (u.state === "moving") {
        if (u.path.length === 0) {
          if (u.harvestTarget && this.objectStillThere(u.harvestTarget)) {
            u.state = "harvesting";
          } else {
            u.harvestTarget = null;
            u.state = "idle";
          }
        } else {
          const wp = u.path[0];
          const dx = wp.gx - u.gx;
          const dy = wp.gy - u.gy;
          const dist = Math.hypot(dx, dy);
          if (dist < 0.02) {
            u.gx = wp.gx;
            u.gy = wp.gy;
            u.path.shift();
          } else {
            const step = Math.min(u.speed * dt, dist);
            u.gx += (dx / dist) * step;
            u.gy += (dy / dist) * step;
          }
          this.maybeFootprint(u);
        }
      } else if (u.state === "harvesting") {
        const tgt = u.harvestTarget;
        if (!tgt || !this.objectStillThere(tgt)) {
          u.harvestTarget = null;
          u.state = "idle";
          continue;
        }
        u.harvestTimer += dt;
        if (u.harvestTimer >= HARVEST_INTERVAL) {
          u.harvestTimer = 0;
          this.applyHarvestTick(u, tgt);
        }
      }
    }
    this.expireFootprints();
  }

  private objectStillThere(t: { kind: ObjectKind; i: number; j: number }): boolean {
    const k = objKey(t.kind, t.i, t.j);
    if (this.removedKeys.has(k)) return false;
    if (t.kind === "tree") return hasTreeAt(this.seed, t.i, t.j);
    if (t.kind === "bush") return hasBushAt(this.seed, t.i, t.j);
    if (t.kind === "mushroom") return hasMushroomAt(this.seed, t.i, t.j);
    return hasFishAt(this.seed, t.i, t.j);
  }

  private applyHarvestTick(
    u: SimUnit,
    t: { kind: ObjectKind; i: number; j: number },
  ): void {
    const k = objKey(t.kind, t.i, t.j);
    let amount: number;
    let resKey: keyof Resources;
    let baseTotal: number;
    if (t.kind === "tree") {
      amount = TREE_HARVEST_AMOUNT;
      resKey = "holz";
      baseTotal = treeWoodAt(this.seed, t.i, t.j);
    } else if (t.kind === "bush") {
      amount = BUSH_HARVEST_AMOUNT;
      resKey = "beeren";
      baseTotal = bushBerriesAt(this.seed, t.i, t.j);
    } else if (t.kind === "mushroom") {
      amount = MUSH_HARVEST_AMOUNT;
      resKey = "beeren";
      baseTotal = mushroomBerriesAt(this.seed, t.i, t.j);
    } else {
      amount = FISH_HARVEST_AMOUNT;
      resKey = "fleisch";
      baseTotal = fishMeatAt(this.seed, t.i, t.j);
    }
    const remaining = (this.remaining.get(k) ?? baseTotal) - amount;
    this.resources[u.owner][resKey] += amount;
    if (remaining <= 0) {
      this.removedKeys.add(k);
      this.remaining.delete(k);
      const ro: RemovedObject = { kind: t.kind, i: t.i, j: t.j };
      this.removedObjects.push(ro);
      this.newRemovedObjects.push(ro);
      u.harvestTarget = null;
      u.state = "idle";
    } else {
      this.remaining.set(k, remaining);
    }
  }
}
