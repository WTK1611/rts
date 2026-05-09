import { GameMap } from "../shared/GameMap";
import { findPath } from "../shared/pathfinding";
import { MAP_SIZE, PlayerId, UnitSnapshot, TreeSnapshot } from "../shared/protocol";

const HARVEST_INTERVAL = 1.2;
const HARVEST_AMOUNT = 5;
const TREE_COUNT = 28;

const PLAYER_COLORS: [number, number] = [0x4ea1ff, 0xff6b6b];
const SPAWN_POSITIONS: Array<[number, number, number, number]> = [
  [4, 4, 6, 5],
  [15, 15, 13, 14],
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

interface SimTree {
  id: string;
  i: number;
  j: number;
  wood: number;
  alive: boolean;
}

export class Sim {
  map: GameMap;
  units: SimUnit[] = [];
  trees: Map<string, SimTree> = new Map();
  wood: [number, number] = [0, 0];
  removedTreeIds: string[] = [];
  tick = 0;

  constructor(seed: number) {
    this.map = new GameMap(MAP_SIZE, MAP_SIZE);

    const rng = mulberry32(seed);

    for (let p: PlayerId = 0; p < 2; p++) {
      const [a1, b1, a2, b2] = SPAWN_POSITIONS[p];
      const positions: Array<[number, number]> = [
        [a1, b1],
        [a2, b2],
      ];
      for (const [i, j] of positions) {
        this.units.push({
          id: `u${this.units.length}`,
          owner: p as PlayerId,
          gx: i + 0.5,
          gy: j + 0.5,
          speed: 3.5,
          color: PLAYER_COLORS[p],
          state: "idle",
          path: [],
          harvestTreeId: null,
          harvestTimer: 0,
        });
      }
    }

    const reserved = new Set<string>();
    for (const u of this.units) {
      const i = Math.floor(u.gx);
      const j = Math.floor(u.gy);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) reserved.add(`${i + di},${j + dj}`);
      }
    }
    let placed = 0;
    let tries = 0;
    while (placed < TREE_COUNT && tries < 500) {
      tries++;
      const i = Math.floor(rng() * MAP_SIZE);
      const j = Math.floor(rng() * MAP_SIZE);
      const k = `${i},${j}`;
      if (reserved.has(k)) continue;
      reserved.add(k);
      const id = `t${placed}`;
      this.trees.set(id, { id, i, j, wood: 25, alive: true });
      this.map.setWalkable(i, j, false);
      placed++;
    }
  }

  unitsSnapshot(): UnitSnapshot[] {
    return this.units.map((u) => ({
      id: u.id,
      owner: u.owner,
      gx: u.gx,
      gy: u.gy,
      state: u.state,
      color: u.color,
    }));
  }

  treesSnapshot(): TreeSnapshot[] {
    return [...this.trees.values()].map((t) => ({
      id: t.id,
      i: t.i,
      j: t.j,
      alive: t.alive,
    }));
  }

  consumeRemovedTrees(): string[] {
    const out = this.removedTreeIds;
    this.removedTreeIds = [];
    return out;
  }

  cmdMove(owner: PlayerId, unitIds: string[], i: number, j: number): void {
    if (!this.map.inBounds(i, j)) return;
    const claimed = new Set<string>();
    for (const id of unitIds) {
      const u = this.units.find((x) => x.id === id && x.owner === owner);
      if (!u) continue;
      const blocked = this.blockedTilesFor(u, claimed);
      let target = { i, j };
      if (blocked.has(`${i},${j}`) || !this.map.isWalkable(i, j)) {
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
    const tree = this.trees.get(treeId);
    if (!tree || !tree.alive) return;
    const claimed = new Set<string>();
    for (const id of unitIds) {
      const u = this.units.find((x) => x.id === id && x.owner === owner);
      if (!u) continue;
      const blocked = this.blockedTilesFor(u, claimed);
      this.startHarvest(u, tree, blocked);
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
          if (!this.map.isWalkable(ni, nj)) continue;
          if (blocked.has(`${ni},${nj}`)) continue;
          return { i: ni, j: nj };
        }
      }
    }
    return null;
  }

  private startMove(u: SimUnit, i: number, j: number, blocked: Set<string>): void {
    const path = findPath(
      this.map,
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

  private startHarvest(u: SimUnit, tree: SimTree, blocked: Set<string>): void {
    let bestPath: ReturnType<typeof findPath> = null;
    const offsets: Array<[number, number]> = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (const [di, dj] of offsets) {
      const ni = tree.i + di;
      const nj = tree.j + dj;
      if (!this.map.isWalkable(ni, nj)) continue;
      if (blocked.has(`${ni},${nj}`)) continue;
      const p = findPath(this.map, Math.floor(u.gx), Math.floor(u.gy), ni, nj, blocked);
      if (p && (!bestPath || p.length < bestPath.length)) bestPath = p;
    }
    if (!bestPath) return;
    u.path =
      bestPath.length > 1
        ? bestPath.slice(1).map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }))
        : [];
    u.harvestTreeId = tree.id;
    u.harvestTimer = 0;
    u.state = u.path.length > 0 ? "moving" : "harvesting";
  }

  step(dt: number): void {
    this.tick++;
    for (const u of this.units) {
      if (u.state === "moving") {
        if (u.path.length === 0) {
          const t = u.harvestTreeId ? this.trees.get(u.harvestTreeId) : null;
          u.state = t && t.alive ? "harvesting" : "idle";
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
        const t = u.harvestTreeId ? this.trees.get(u.harvestTreeId) : null;
        if (!t || !t.alive) {
          u.harvestTreeId = null;
          u.state = "idle";
          continue;
        }
        u.harvestTimer += dt;
        if (u.harvestTimer >= HARVEST_INTERVAL) {
          u.harvestTimer = 0;
          t.wood -= HARVEST_AMOUNT;
          this.wood[u.owner] += HARVEST_AMOUNT;
          if (t.wood <= 0) {
            t.alive = false;
            this.map.setWalkable(t.i, t.j, true);
            this.removedTreeIds.push(t.id);
            u.harvestTreeId = null;
            u.state = "idle";
          }
        }
      }
    }
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
