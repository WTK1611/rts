import {
  biomeAt,
  hasBushAt,
  hasFishAt,
  hasMushroomAt,
  hasStoneAt,
  hasTreeAt,
  isLandTile,
  rand01,
} from "../shared/worldgen";
import { AnimalKind, PlayerId } from "../shared/protocol";
import { Sim, SimAnimal, SimUnit } from "./sim";

type Need = "tree" | "bush" | "mushroom" | "fish" | "stone" | "water";

const SAFE_HUNT: ReadonlySet<AnimalKind> = new Set<AnimalKind>([
  "hare",
  "reindeer",
  "megaloceros",
]);

const DANGER_DETECT: Partial<Record<AnimalKind, number>> = {
  bison: 4,
  caveLion: 7,
  mammoth: 3,
  alligator: 5,
};

interface BotUnitMem {
  cooldown: number;
}

const SCAN_RADIUS = 12;
const RETREAT_HP_THRESHOLD = 70;
const HUNT_HP_THRESHOLD = 55;
const DRIFT_INTERVAL_MIN = 60;
const DRIFT_INTERVAL_RANGE = 90;
const DRIFT_STEP = 6;
const REGROUP_RADIUS = 7;
const MAX_TARGET_DIST_FROM_CENTER = 10;
const HUNT_SCAN_RADIUS = 9;

export class AIBot {
  readonly id: PlayerId;
  private readonly sim: Sim;
  private readonly mem: Map<string, BotUnitMem> = new Map();
  private exploreAngle: number;
  private exploreCenter: { x: number; y: number };
  private driftTimer = 0;

  constructor(sim: Sim, id: PlayerId) {
    this.sim = sim;
    this.id = id;
    this.exploreAngle = rand01(sim.seed ^ 0xb07, id, 1) * Math.PI * 2;
    const sp = sim.spawns[id];
    this.exploreCenter = { x: sp.cx, y: sp.cy };
  }

  update(dt: number): void {
    this.driftTimer -= dt;
    if (this.driftTimer <= 0) {
      this.driftTimer = DRIFT_INTERVAL_MIN + Math.random() * DRIFT_INTERVAL_RANGE;
      this.exploreAngle += (Math.random() - 0.5) * Math.PI * 0.7;
      this.exploreCenter.x += Math.cos(this.exploreAngle) * DRIFT_STEP;
      this.exploreCenter.y += Math.sin(this.exploreAngle) * DRIFT_STEP;
    }

    for (const id of [...this.mem.keys()]) {
      if (!this.sim.units.has(id)) this.mem.delete(id);
    }

    const center = this.tribeCenter();
    if (center) {
      const dx = center.x - this.exploreCenter.x;
      const dy = center.y - this.exploreCenter.y;
      const d = Math.hypot(dx, dy);
      const pull = Math.min(1, d / 12);
      this.exploreCenter.x += dx * 0.2 * pull;
      this.exploreCenter.y += dy * 0.2 * pull;
    }

    for (const u of this.sim.units.values()) {
      if (u.owner !== this.id) continue;
      let m = this.mem.get(u.id);
      if (!m) {
        m = { cooldown: Math.random() };
        this.mem.set(u.id, m);
      }
      m.cooldown -= dt;
      if (m.cooldown > 0) continue;
      if (u.state !== "idle") continue;
      m.cooldown = 0.7 + Math.random();
      this.decide(u, center);
    }
  }

  private decide(u: SimUnit, center: { x: number; y: number } | null): void {
    if (this.maybeRetreat(u)) return;
    if (center && this.maybeRegroup(u, center)) return;
    if (this.maybeHunt(u, center)) return;
    if (this.maybeHarvest(u, center)) return;
    this.wander(u, center);
  }

  private tribeCenter(): { x: number; y: number } | null {
    let n = 0;
    let cx = 0;
    let cy = 0;
    for (const u of this.sim.units.values()) {
      if (u.owner !== this.id) continue;
      cx += u.gx;
      cy += u.gy;
      n++;
    }
    if (n === 0) return null;
    return { x: cx / n, y: cy / n };
  }

  private maybeRegroup(u: SimUnit, c: { x: number; y: number }): boolean {
    const d = Math.hypot(u.gx - c.x, u.gy - c.y);
    if (d <= REGROUP_RADIUS) return false;
    const ti = Math.floor(c.x);
    const tj = Math.floor(c.y);
    if (this.sim.isWalkable(ti, tj)) {
      this.sim.cmdMove(this.id, [u.id], ti, tj);
      return true;
    }
    return false;
  }

  private maybeRetreat(u: SimUnit): boolean {
    let nearest: { a: SimAnimal; d: number; range: number } | null = null;
    for (const a of this.sim.animals.values()) {
      if (a.hp <= 0) continue;
      const dr = DANGER_DETECT[a.kind];
      if (dr === undefined) continue;
      const d = Math.hypot(a.gx - u.gx, a.gy - u.gy);
      if (d > dr + 5) continue;
      if (!nearest || d < nearest.d) nearest = { a, d, range: dr };
    }
    if (!nearest) return false;

    const lethal =
      nearest.a.kind === "mammoth" ||
      nearest.a.kind === "caveLion" ||
      nearest.a.kind === "alligator";
    const lowHp = u.hp < RETREAT_HP_THRESHOLD;
    if (!lethal && !lowHp) return false;
    if (nearest.d > nearest.range + 1) return false;

    const dx = u.gx - nearest.a.gx;
    const dy = u.gy - nearest.a.gy;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    for (let step = 7; step >= 3; step--) {
      const ti = Math.floor(u.gx + (dx / len) * step);
      const tj = Math.floor(u.gy + (dy / len) * step);
      if (this.sim.isWalkable(ti, tj)) {
        this.sim.cmdMove(this.id, [u.id], ti, tj);
        return true;
      }
    }
    return false;
  }

  private maybeHunt(
    u: SimUnit,
    center: { x: number; y: number } | null,
  ): boolean {
    if (u.hp < HUNT_HP_THRESHOLD) return false;
    const r = this.sim.resources[this.id];
    const food = r.fleisch + r.fisch;
    const haveSpear = r.holz >= 1 && r.stein >= 1;
    if (food >= 30 && !haveSpear) return false;

    let nearest: { a: SimAnimal; d: number } | null = null;
    for (const a of this.sim.animals.values()) {
      if (a.hp <= 0) continue;
      if (!SAFE_HUNT.has(a.kind)) continue;
      const d = Math.hypot(a.gx - u.gx, a.gy - u.gy);
      if (d > HUNT_SCAN_RADIUS) continue;
      if (center) {
        const dc = Math.hypot(a.gx - center.x, a.gy - center.y);
        if (dc > MAX_TARGET_DIST_FROM_CENTER) continue;
      }
      if (!nearest || d < nearest.d) nearest = { a, d };
    }
    if (!nearest) return false;
    this.sim.cmdHunt(this.id, [u.id], nearest.a.id);
    return true;
  }

  private maybeHarvest(
    u: SimUnit,
    center: { x: number; y: number } | null,
  ): boolean {
    const r = this.sim.resources[this.id];
    const fruit = r.beeren + r.pilze;

    const needs: Array<{ kind: Need; w: number }> = [];
    if (r.wasser < 6) needs.push({ kind: "water", w: 6 - r.wasser });
    if (fruit < 12) needs.push({ kind: "bush", w: 12 - fruit });
    if (fruit < 12) needs.push({ kind: "mushroom", w: 12 - fruit });
    if (r.holz < 12) needs.push({ kind: "tree", w: 12 - r.holz });
    if (r.stein < 8) needs.push({ kind: "stone", w: 8 - r.stein });
    if (r.fisch < 6) needs.push({ kind: "fish", w: 6 - r.fisch });
    if (needs.length === 0) {
      needs.push({ kind: "tree", w: 1 });
      needs.push({ kind: "bush", w: 1 });
    }
    needs.sort((a, b) => b.w - a.w);

    const ox = center ? center.x : u.gx;
    const oy = center ? center.y : u.gy;
    for (const n of needs) {
      const tgt = this.findNearestAt(ox, oy, n.kind, SCAN_RADIUS);
      if (!tgt) continue;
      if (center) {
        const dc = Math.hypot(tgt.i + 0.5 - center.x, tgt.j + 0.5 - center.y);
        if (dc > MAX_TARGET_DIST_FROM_CENTER) continue;
      }
      if (n.kind === "water") {
        this.sim.cmdMove(this.id, [u.id], tgt.i, tgt.j);
      } else {
        this.sim.cmdHarvest(this.id, [u.id], tgt.i, tgt.j);
      }
      return true;
    }
    return false;
  }

  private wander(u: SimUnit, center: { x: number; y: number } | null): void {
    const ax = center ? (center.x + this.exploreCenter.x) * 0.5 : this.exploreCenter.x;
    const ay = center ? (center.y + this.exploreCenter.y) * 0.5 : this.exploreCenter.y;
    for (let attempt = 0; attempt < 12; attempt++) {
      const jitter = 3 + attempt * 0.7;
      const tx = ax + (Math.random() - 0.5) * jitter * 2;
      const ty = ay + (Math.random() - 0.5) * jitter * 2;
      const ti = Math.floor(tx);
      const tj = Math.floor(ty);
      if (!this.sim.isWalkable(ti, tj)) continue;
      const b = biomeAt(this.sim.seed, ti, tj);
      if (b === "lake" || b === "river" || b === "gebirge") continue;
      this.sim.cmdMove(this.id, [u.id], ti, tj);
      return;
    }
  }

  private findNearestAt(
    ox: number,
    oy: number,
    kind: Need,
    radius: number,
  ): { i: number; j: number } | null {
    const gi = Math.floor(ox);
    const gj = Math.floor(oy);
    type Cand = { i: number; j: number; d: number };
    let best: Cand | null = null;
    for (let r = 1; r <= radius; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = gi + di;
          const j = gj + dj;
          if (!this.tileHas(kind, i, j)) continue;
          const d = Math.abs(di) + Math.abs(dj);
          const cand: Cand = { i, j, d };
          if (best === null || d < best.d) best = cand;
        }
      }
      if (best !== null) {
        const found: Cand = best;
        return { i: found.i, j: found.j };
      }
    }
    return null;
  }

  private tileHas(kind: Need, i: number, j: number): boolean {
    const seed = this.sim.seed;
    if (kind === "water") {
      if (!isLandTile(seed, i, j)) return false;
      const adj: Array<[number, number]> = [
        [1, 0], [-1, 0], [0, 1], [0, -1],
      ];
      for (const [di, dj] of adj) {
        const b = biomeAt(seed, i + di, j + dj);
        if (b === "lake" || b === "river") return true;
      }
      return false;
    }
    if (kind === "fish") {
      if (!hasFishAt(seed, i, j)) return false;
      return !this.sim.removedKeys.has(`f_${i}_${j}`);
    }
    if (!isLandTile(seed, i, j)) return false;
    if (kind === "tree") {
      return hasTreeAt(seed, i, j) && !this.sim.removedKeys.has(`t_${i}_${j}`);
    }
    if (kind === "bush") {
      return hasBushAt(seed, i, j) && !this.sim.removedKeys.has(`b_${i}_${j}`);
    }
    if (kind === "mushroom") {
      return (
        hasMushroomAt(seed, i, j) && !this.sim.removedKeys.has(`m_${i}_${j}`)
      );
    }
    return hasStoneAt(seed, i, j) && !this.sim.removedKeys.has(`s_${i}_${j}`);
  }
}
