import { findPath } from "../shared/pathfinding";
import { MAX_PLAYERS, PlayerId, UnitSnapshot } from "../shared/protocol";
import {
  hasTreeAt,
  isLandTile,
  parseTreeId,
  spawnsFromSeed,
  SpawnArea,
  treeIdAt,
  treeWoodAt,
} from "../shared/worldgen";

const HARVEST_INTERVAL = 1.2;
const HARVEST_AMOUNT = 5;
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
  harvestTreeId: string | null;
  harvestTimer: number;
}

export class Sim {
  seed: number;
  spawns: SpawnArea[];
  units: SimUnit[] = [];
  active: boolean[] = new Array(MAX_PLAYERS).fill(false);
  destroyedTrees = new Set<string>();
  treeWood = new Map<string, number>();
  wood: number[] = new Array(MAX_PLAYERS).fill(0);
  removedTreeIds: string[] = [];
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
        harvestTreeId: null,
        harvestTimer: 0,
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
    this.wood[p] = 0;
    return removed;
  }

  isWalkable(i: number, j: number): boolean {
    if (!isLandTile(this.seed, i, j)) return false;
    if (!hasTreeAt(this.seed, i, j)) return true;
    return this.destroyedTrees.has(treeIdAt(i, j));
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

  consumeRemovedTrees(): string[] {
    const out = this.removedTreeIds;
    this.removedTreeIds = [];
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

  cmdHarvest(owner: PlayerId, unitIds: string[], treeId: string): void {
    const coord = parseTreeId(treeId);
    if (!coord) return;
    if (!hasTreeAt(this.seed, coord.i, coord.j)) return;
    if (this.destroyedTrees.has(treeId)) return;
    const claimed = new Set<string>();
    for (const id of unitIds) {
      const u = this.units.find((x) => x.id === id && x.owner === owner);
      if (!u) continue;
      const blocked = this.blockedTilesFor(u, claimed);
      this.startHarvest(u, coord.i, coord.j, treeId, blocked);
      const last = u.path[u.path.length - 1];
      if (last) claimed.add(`${Math.floor(last.gx)},${Math.floor(last.gy)}`);
      else claimed.add(`${Math.floor(u.gx)},${Math.floor(u.gy)}`);
    }
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
      u.harvestTreeId = null;
      u.state = "idle";
      return;
    }
    u.path = path.slice(1).map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }));
    u.state = "moving";
    u.harvestTreeId = null;
  }

  private startHarvest(
    u: SimUnit,
    treeI: number,
    treeJ: number,
    treeId: string,
    blocked: Set<string>,
  ): void {
    let bestPath: ReturnType<typeof findPath> = null;
    const offsets: Array<[number, number]> = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (const [di, dj] of offsets) {
      const ni = treeI + di;
      const nj = treeJ + dj;
      if (!this.isWalkable(ni, nj)) continue;
      if (blocked.has(`${ni},${nj}`)) continue;
      const p = findPath(
        (a, b) => this.isWalkable(a, b),
        Math.floor(u.gx),
        Math.floor(u.gy),
        ni,
        nj,
        blocked,
      );
      if (p && (!bestPath || p.length < bestPath.length)) bestPath = p;
    }
    if (!bestPath) return;
    u.path =
      bestPath.length > 1
        ? bestPath.slice(1).map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }))
        : [];
    u.harvestTreeId = treeId;
    u.harvestTimer = 0;
    u.state = u.path.length > 0 ? "moving" : "harvesting";
  }

  step(dt: number): void {
    this.tick++;
    for (const u of this.units) {
      if (u.state === "moving") {
        if (u.path.length === 0) {
          u.state =
            u.harvestTreeId && !this.destroyedTrees.has(u.harvestTreeId)
              ? "harvesting"
              : "idle";
          if (u.state === "idle") u.harvestTreeId = null;
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
        }
      } else if (u.state === "harvesting") {
        const tid = u.harvestTreeId;
        if (!tid || this.destroyedTrees.has(tid)) {
          u.harvestTreeId = null;
          u.state = "idle";
          continue;
        }
        const coord = parseTreeId(tid);
        if (!coord || !hasTreeAt(this.seed, coord.i, coord.j)) {
          u.harvestTreeId = null;
          u.state = "idle";
          continue;
        }
        u.harvestTimer += dt;
        if (u.harvestTimer >= HARVEST_INTERVAL) {
          u.harvestTimer = 0;
          const remaining =
            (this.treeWood.get(tid) ?? treeWoodAt(this.seed, coord.i, coord.j)) -
            HARVEST_AMOUNT;
          this.wood[u.owner] += HARVEST_AMOUNT;
          if (remaining <= 0) {
            this.destroyedTrees.add(tid);
            this.treeWood.delete(tid);
            this.removedTreeIds.push(tid);
            u.harvestTreeId = null;
            u.state = "idle";
          } else {
            this.treeWood.set(tid, remaining);
          }
        }
      }
    }
  }
}
