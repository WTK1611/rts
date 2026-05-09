import { findPath } from "../shared/pathfinding";
import {
  AnimalKind,
  AnimalSnapshot,
  EncounterEvent,
  emptyResources,
  Footprint,
  FOOTPRINT_LIFETIME_TICKS,
  MAX_PLAYERS,
  MAX_TRIBE_SIZE,
  ObjectKind,
  PlayerId,
  RemovedObject,
  Resources,
  TICK_RATE,
  UnitGender,
  UnitSnapshot,
} from "../shared/protocol";
import { Language, languageForSlot, pickFirstName } from "../shared/names";
import {
  Biome,
  biomeAt,
  bushBerriesAt,
  fishMeatAt,
  hasBushAt,
  hasFishAt,
  hasMushroomAt,
  hasStoneAt,
  hasTreeAt,
  isLandTile,
  mushroomBerriesAt,
  rand01,
  spawnsFromSeed,
  SpawnArea,
  stoneAmountAt,
  treeWoodAt,
} from "../shared/worldgen";

const HARVEST_INTERVAL = 1.2;
const TREE_HARVEST_AMOUNT = 5;
const BUSH_HARVEST_AMOUNT = 3;
const MUSH_HARVEST_AMOUNT = 1;
const FISH_HARVEST_AMOUNT = 1;
const STARTING_GENDERS: UnitGender[] = ["m", "f", "m", "f"];
const TRIBE_SIZE = STARTING_GENDERS.length;
const GROWTH_REQUIRED_SEC = 120;
const ENCOUNTER_RANGE = 5;
const ENCOUNTER_COOLDOWN_TICKS = TICK_RATE * 60;
const MUSHROOM_REGROW_TICKS = TICK_RATE * 90;
const MUSHROOM_AUTOPICK_GAIN = 1;
const BUSH_REGROW_TICKS = TICK_RATE * 90;
const BUSH_AUTOPICK_GAIN = 1;
const TREE_REGROW_TICKS = TICK_RATE * 120;
const TREE_AUTOPICK_GAIN = 1;
const STONE_AUTOPICK_GAIN = 1;
const STONE_HARVEST_AMOUNT = 2;
const FISH_AUTOPICK_GAIN = 1;
const WATER_AUTOPICK_GAIN = 1;

export const PLAYER_COLORS: number[] = [
  0x4ea1ff, 0xff6b6b, 0x6cdf6c, 0xffd84d, 0xc066ff,
  0xff9933, 0x66e0d0, 0xff66c4, 0xd4b878, 0x9ca0ff,
];

export interface SimUnit {
  id: string;
  owner: PlayerId;
  gx: number;
  gy: number;
  speed: number;
  color: number;
  state: "idle" | "moving" | "harvesting";
  path: Array<{ gx: number; gy: number }>;
  harvestTarget: { kind: ObjectKind; i: number; j: number } | null;
  huntTarget: string | null;
  huntTimer: number;
  harvestTimer: number;
  lastFootprintTile: { i: number; j: number } | null;
  hp: number;
  hpMax: number;
  eatCooldown: number;
  autoHuntScanTimer: number;
  ageSec: number;
  gender: UnitGender;
  firstName: string;
}

const MAX_AGE_SEC = 420;
const CHILD_AGE_SEC = 60;

const UNIT_HP_MAX = 100;
const UNIT_HP_LOSS_PER_TILE = 0.2;
const UNIT_HP_LOSS_PER_SEC_IDLE = 0.12;
const EAT_INTERVAL = 1.0;
const HP_GAIN_FLEISCH = 15;
const HP_GAIN_FISCH = 12;
const HP_GAIN_BEEREN = 3;
const HP_GAIN_PILZE = 2;
const HP_GAIN_WASSER = 1;

interface AnimalSpec {
  hp: number;
  speed: number;
  meat: number;
  biomes: Biome[];
  density: number;
  wanderRadius: number;
  damage: number;
  aggressive: boolean;
  detectRange: number;
  autoHuntable: boolean;
  autoHuntRange: number;
  attackRange: number;
  aggroDurationSec: number;
}

const ANIMAL_SPECS: Record<AnimalKind, AnimalSpec> = {
  hare:        { hp: 3,  speed: 4.0, meat: 2,  biomes: ["wiesen", "wald", "savanne"],          density: 0.0150, wanderRadius: 6,  damage: 0,  aggressive: false, detectRange: 0, autoHuntable: true,  autoHuntRange: 6, attackRange: 1.5, aggroDurationSec: 0  },
  reindeer:    { hp: 8,  speed: 3.0, meat: 6,  biomes: ["wiesen", "wald"],                     density: 0.0040, wanderRadius: 10, damage: 0,  aggressive: false, detectRange: 0, autoHuntable: true,  autoHuntRange: 5, attackRange: 1.5, aggroDurationSec: 0  },
  megaloceros: { hp: 15, speed: 3.4, meat: 10, biomes: ["wald", "wiesen"],                     density: 0.0025, wanderRadius: 8,  damage: 0,  aggressive: false, detectRange: 0, autoHuntable: true,  autoHuntRange: 5, attackRange: 1.5, aggroDurationSec: 0  },
  bison:       { hp: 18, speed: 2.6, meat: 12, biomes: ["savanne", "wiesen", "wueste"],        density: 0.0035, wanderRadius: 8,  damage: 4,  aggressive: true,  detectRange: 4, autoHuntable: false, autoHuntRange: 0, attackRange: 1.5, aggroDurationSec: 8  },
  caveLion:    { hp: 12, speed: 4.0, meat: 6,  biomes: ["felsen", "wueste", "savanne", "wiesen"], density: 0.0018, wanderRadius: 12, damage: 5,  aggressive: true,  detectRange: 7, autoHuntable: false, autoHuntRange: 0, attackRange: 1.5, aggroDurationSec: 25 },
  mammoth:     { hp: 30, speed: 1.8, meat: 25, biomes: ["wiesen", "savanne", "wueste"],        density: 0.0014, wanderRadius: 6,  damage: 10, aggressive: true,  detectRange: 3, autoHuntable: false, autoHuntRange: 0, attackRange: 1.8, aggroDurationSec: 12 },
};

const ANIMAL_SPAWN_RADIUS = 220;
const HUNT_INTERVAL = 0.9;
const HUNT_DAMAGE = 2;
const SPEAR_HUNT_DAMAGE = 5;
const HUNT_RANGE = 1.5;
const ANIMAL_ATTACK_INTERVAL = 1.0;
const UNIT_AUTO_HUNT_SCAN_INTERVAL = 0.5;
const GROUP_FIGHT_RANGE = 7;
const ANIMAL_ESCAPE_RANGE_MULT = 1.8;

export interface SimAnimal {
  id: string;
  kind: AnimalKind;
  hp: number;
  hpMax: number;
  gx: number;
  gy: number;
  homeI: number;
  homeJ: number;
  state: "idle" | "wander" | "flee" | "hunt";
  path: Array<{ gx: number; gy: number }>;
  decisionTimer: number;
  attackTargetUnitId: string | null;
  attackTimer: number;
  repathTimer: number;
  aggroExpireTick: number;
}

function kindHash(kind: AnimalKind): number {
  let h = 0x12345;
  for (let i = 0; i < kind.length; i++) {
    h = (Math.imul(h ^ kind.charCodeAt(i), 0x9e3779b1) >>> 0);
  }
  return h;
}

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

export class Sim {
  seed: number;
  spawns: SpawnArea[];
  units: Map<string, SimUnit> = new Map();
  active: boolean[] = new Array(MAX_PLAYERS).fill(false);
  removedObjects: RemovedObject[] = [];
  removedKeys = new Set<string>();
  remaining = new Map<string, number>();
  resources: Resources[] = Array.from({ length: MAX_PLAYERS }, () =>
    emptyResources(),
  );
  newRemovedObjects: RemovedObject[] = [];
  respawnedObjects: RemovedObject[] = [];
  regrow: Map<string, number> = new Map();
  footprints: Footprint[] = [];
  newFootprints: Footprint[] = [];
  animals: Map<string, SimAnimal> = new Map();
  removedAnimalIds: string[] = [];
  deadUnitIds: string[] = [];
  newUnits: UnitSnapshot[] = [];
  growthTimer: number[] = new Array(MAX_PLAYERS).fill(0);
  growthActive: boolean[] = new Array(MAX_PLAYERS).fill(false);
  nextUnitIdx: number[] = new Array(MAX_PLAYERS).fill(TRIBE_SIZE);
  tribeLanguage: Language[] = new Array(MAX_PLAYERS).fill("de");
  lastEncounterTick: Map<string, number> = new Map();
  encounterEvents: EncounterEvent[] = [];
  tick = 0;

  constructor(seed: number) {
    this.seed = seed;
    this.spawns = spawnsFromSeed(seed);
    this.spawnAnimals();
  }

  private spawnAnimals(): void {
    const r = ANIMAL_SPAWN_RADIUS;
    const kinds = Object.keys(ANIMAL_SPECS) as AnimalKind[];
    let counter = 0;
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        if (!isLandTile(this.seed, i, j)) continue;
        const b = biomeAt(this.seed, i, j);
        for (const kind of kinds) {
          const spec = ANIMAL_SPECS[kind];
          if (!spec.biomes.includes(b)) continue;
          const r01 = rand01(this.seed ^ kindHash(kind), i, j);
          if (r01 > spec.density) continue;
          const id = `a_${kind[0]}${counter++}`;
          this.animals.set(id, {
            id,
            kind,
            hp: spec.hp,
            hpMax: spec.hp,
            gx: i + 0.5,
            gy: j + 0.5,
            homeI: i,
            homeJ: j,
            state: "idle",
            path: [],
            decisionTimer: rand01(this.seed ^ 0xa17, i, j) * 4,
            attackTargetUnitId: null,
            attackTimer: 0,
            repathTimer: 0,
            aggroExpireTick: 0,
          });
          break;
        }
      }
    }
  }

  animalsSnapshot(): AnimalSnapshot[] {
    const out: AnimalSnapshot[] = [];
    for (const a of this.animals.values()) out.push(this.animalSnap(a));
    return out;
  }

  consumeRemovedAnimalIds(): string[] {
    const out = this.removedAnimalIds;
    this.removedAnimalIds = [];
    return out;
  }

  consumeDeadUnitIds(): string[] {
    const out = this.deadUnitIds;
    this.deadUnitIds = [];
    return out;
  }

  consumeNewUnits(): UnitSnapshot[] {
    const out = this.newUnits;
    this.newUnits = [];
    return out;
  }

  private animalSnap = (a: SimAnimal): AnimalSnapshot => ({
    id: a.id,
    kind: a.kind,
    gx: a.gx,
    gy: a.gy,
    hp: a.hp,
    hpMax: a.hpMax,
    state: a.state,
  });

  cmdHunt(owner: PlayerId, unitIds: string[], animalId: string): void {
    const a = this.animals.get(animalId);
    if (!a) return;
    const claimed = new Set<string>();
    for (const id of unitIds) {
      const u = this.units.get(id);
      if (!u || u.owner !== owner) continue;
      const blocked = this.blockedTilesFor(u, claimed);
      this.startHunt(u, a, blocked);
      const last = u.path[u.path.length - 1];
      if (last) claimed.add(`${Math.floor(last.gx)},${Math.floor(last.gy)}`);
      else claimed.add(`${Math.floor(u.gx)},${Math.floor(u.gy)}`);
    }
  }

  private startHunt(u: SimUnit, a: SimAnimal, blocked: Set<string>): void {
    const bestPath = this.findHuntApproach(u, a, blocked);
    if (!bestPath) return;
    u.path =
      bestPath.length > 1
        ? bestPath.slice(1).map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }))
        : [];
    u.huntTarget = a.id;
    u.harvestTarget = null;
    u.huntTimer = 0;
    u.state = u.path.length > 0 ? "moving" : "harvesting";
  }

  private repathToHuntable(
    u: SimUnit,
    a: SimAnimal,
    blocked: Set<string>,
  ): void {
    const bestPath = this.findHuntApproach(u, a, blocked);
    if (!bestPath || bestPath.length < 2) return;
    u.path = bestPath.slice(1).map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }));
  }

  private findHuntApproach(
    u: SimUnit,
    a: SimAnimal,
    blocked: Set<string>,
  ): ReturnType<typeof findPath> {
    const ti = Math.floor(a.gx);
    const tj = Math.floor(a.gy);
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
        (x, y) => this.isWalkable(x, y),
        Math.floor(u.gx),
        Math.floor(u.gy),
        c.i,
        c.j,
        blocked,
      );
      if (p && (!bestPath || p.length < bestPath.length)) bestPath = p;
    }
    return bestPath;
  }

  private stepAnimals(dt: number): void {
    const dead: string[] = [];
    for (const a of this.animals.values()) {
      if (a.hp <= 0) {
        dead.push(a.id);
        continue;
      }
      const spec = ANIMAL_SPECS[a.kind];

      if (a.attackTargetUnitId) {
        const t = this.units.get(a.attackTargetUnitId);
        if (!t || t.hp <= 0) {
          a.attackTargetUnitId = null;
        } else if (this.tick > a.aggroExpireTick) {
          a.attackTargetUnitId = null;
          a.path = [];
          a.state = "idle";
        } else if (
          spec.detectRange > 0 &&
          Math.hypot(t.gx - a.gx, t.gy - a.gy) >
            spec.detectRange * ANIMAL_ESCAPE_RANGE_MULT
        ) {
          a.attackTargetUnitId = null;
          a.path = [];
          a.state = "idle";
        } else {
          const homeDist = Math.hypot(
            a.gx - (a.homeI + 0.5),
            a.gy - (a.homeJ + 0.5),
          );
          if (homeDist > spec.wanderRadius * 3) {
            a.attackTargetUnitId = null;
            a.path = [];
          }
        }
      }

      if (!a.attackTargetUnitId && spec.aggressive && spec.detectRange > 0) {
        let nearest: SimUnit | null = null;
        let nearestDist = spec.detectRange;
        for (const u of this.units.values()) {
          if (u.hp <= 0) continue;
          const d = Math.hypot(u.gx - a.gx, u.gy - a.gy);
          if (d < nearestDist) {
            nearest = u;
            nearestDist = d;
          }
        }
        if (nearest) {
          a.attackTargetUnitId = nearest.id;
          a.path = [];
          a.repathTimer = 0;
          a.aggroExpireTick =
            this.tick + Math.floor(spec.aggroDurationSec * TICK_RATE);
        }
      }

      if (a.attackTargetUnitId) {
        const t = this.units.get(a.attackTargetUnitId);
        if (t) {
          this.stepAnimalAttack(a, t, spec, dt);
          continue;
        }
      }

      a.decisionTimer -= dt;
      if (a.path.length === 0 && a.decisionTimer <= 0) {
        a.decisionTimer = 2 + Math.random() * 5;
        if (Math.random() < 0.5) {
          const r = spec.wanderRadius;
          const ti = a.homeI + Math.floor((Math.random() * 2 - 1) * r);
          const tj = a.homeJ + Math.floor((Math.random() * 2 - 1) * r);
          if (this.isWalkable(ti, tj) && biomeAt(this.seed, ti, tj) !== "lake" && biomeAt(this.seed, ti, tj) !== "river") {
            const path = findPath(
              (x, y) => this.isWalkable(x, y),
              Math.floor(a.gx),
              Math.floor(a.gy),
              ti,
              tj,
              new Set<string>(),
            );
            if (path && path.length > 1) {
              a.path = path.slice(1).map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }));
              a.state = "wander";
            }
          }
        }
      }
      if (a.path.length > 0) {
        const wp = a.path[0];
        const dx = wp.gx - a.gx;
        const dy = wp.gy - a.gy;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.04) {
          a.gx = wp.gx;
          a.gy = wp.gy;
          a.path.shift();
          if (a.path.length === 0) a.state = "idle";
        } else {
          const moveSpeed = spec.speed * 0.5;
          const step = Math.min(moveSpeed * dt, dist);
          a.gx += (dx / dist) * step;
          a.gy += (dy / dist) * step;
        }
      } else {
        a.state = "idle";
      }
    }
    for (const id of dead) {
      this.animals.delete(id);
      this.removedAnimalIds.push(id);
    }
  }

  private stepAnimalAttack(
    a: SimAnimal,
    t: SimUnit,
    spec: AnimalSpec,
    dt: number,
  ): void {
    a.state = "hunt";
    const dx = t.gx - a.gx;
    const dy = t.gy - a.gy;
    const dist = Math.hypot(dx, dy);
    if (dist <= spec.attackRange) {
      a.path = [];
      a.attackTimer += dt;
      if (a.attackTimer >= ANIMAL_ATTACK_INTERVAL) {
        a.attackTimer = 0;
        if (spec.damage > 0) {
          t.hp = Math.max(0, t.hp - spec.damage);
          a.aggroExpireTick =
            this.tick + Math.floor(spec.aggroDurationSec * TICK_RATE);
        }
      }
      return;
    }

    a.repathTimer -= dt;
    const ti = Math.floor(t.gx);
    const tj = Math.floor(t.gy);
    const last = a.path[a.path.length - 1];
    const lastTile = last
      ? `${Math.floor(last.gx)},${Math.floor(last.gy)}`
      : null;
    if (a.repathTimer <= 0 || lastTile !== `${ti},${tj}`) {
      a.repathTimer = 0.5;
      const path = findPath(
        (x, y) => this.isWalkable(x, y),
        Math.floor(a.gx),
        Math.floor(a.gy),
        ti,
        tj,
        new Set<string>(),
      );
      if (path && path.length > 1) {
        a.path = path.slice(1).map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }));
      }
    }
    if (a.path.length > 0) {
      const wp = a.path[0];
      const ddx = wp.gx - a.gx;
      const ddy = wp.gy - a.gy;
      const sd = Math.hypot(ddx, ddy);
      const moveSpeed = spec.speed * 0.7;
      if (sd < 0.04) {
        a.gx = wp.gx;
        a.gy = wp.gy;
        a.path.shift();
      } else {
        const step = Math.min(moveSpeed * dt, sd);
        a.gx += (ddx / sd) * step;
        a.gy += (ddy / sd) * step;
      }
    }
  }

  private maybeAutoEngage(u: SimUnit): void {
    let allyTarget: string | null = null;
    let allyDist = Infinity;
    for (const ally of this.units.values()) {
      if (ally.owner !== u.owner) continue;
      if (ally.id === u.id) continue;
      if (!ally.huntTarget) continue;
      if (ally.hp <= 0) continue;
      const d = Math.hypot(ally.gx - u.gx, ally.gy - u.gy);
      if (d > GROUP_FIGHT_RANGE) continue;
      if (d < allyDist) {
        allyDist = d;
        allyTarget = ally.huntTarget;
      }
    }
    if (allyTarget && this.animals.has(allyTarget)) {
      const a = this.animals.get(allyTarget)!;
      this.startHunt(u, a, new Set<string>());
      return;
    }

    let bestAnimal: SimAnimal | null = null;
    let bestDist = Infinity;
    for (const a of this.animals.values()) {
      const spec = ANIMAL_SPECS[a.kind];
      if (!spec.autoHuntable) continue;
      if (a.hp <= 0) continue;
      const d = Math.hypot(a.gx - u.gx, a.gy - u.gy);
      if (d > spec.autoHuntRange) continue;
      if (d < bestDist) {
        bestDist = d;
        bestAnimal = a;
      }
    }
    if (bestAnimal) {
      this.startHunt(u, bestAnimal, new Set<string>());
    }
  }

  private callForHelp(victim: SimUnit, animalId: string): void {
    for (const u of this.units.values()) {
      if (u.owner !== victim.owner) continue;
      if (u.id === victim.id) continue;
      if (u.huntTarget) continue;
      if (u.hp <= 0) continue;
      const d = Math.hypot(u.gx - victim.gx, u.gy - victim.gy);
      if (d > GROUP_FIGHT_RANGE) continue;
      u.huntTarget = animalId;
      u.harvestTarget = null;
      u.huntTimer = 0;
      u.path = [];
      u.state = "harvesting";
    }
  }

  private rallyAlliesToHunt(hunter: SimUnit, a: SimAnimal): void {
    const claimed = new Set<string>();
    for (const u of this.units.values()) {
      if (u.owner !== hunter.owner) continue;
      if (u.id === hunter.id) continue;
      if (u.huntTarget) continue;
      if (u.harvestTarget) continue;
      if (u.hp <= 0) continue;
      const d = Math.hypot(u.gx - a.gx, u.gy - a.gy);
      if (d > GROUP_FIGHT_RANGE) continue;
      const blocked = this.blockedTilesFor(u, claimed);
      this.startHunt(u, a, blocked);
      const last = u.path[u.path.length - 1];
      if (last) claimed.add(`${Math.floor(last.gx)},${Math.floor(last.gy)}`);
      else claimed.add(`${Math.floor(u.gx)},${Math.floor(u.gy)}`);
    }
  }

  private tickHunt(u: SimUnit, dt: number): boolean {
    if (!u.huntTarget) return false;
    const a = this.animals.get(u.huntTarget);
    if (!a) {
      u.huntTarget = null;
      u.state = "idle";
      u.path = [];
      return true;
    }
    const dx = a.gx - u.gx;
    const dy = a.gy - u.gy;
    const dist = Math.hypot(dx, dy);

    if (dist <= HUNT_RANGE) {
      u.path = [];
      u.state = "harvesting";
      u.huntTimer += dt;
      if (u.huntTimer >= HUNT_INTERVAL) {
        u.huntTimer = 0;
        const ownerRes = this.resources[u.owner];
        let damage = HUNT_DAMAGE;
        if (ownerRes.holz >= 1 && ownerRes.stein >= 1) {
          ownerRes.holz -= 1;
          ownerRes.stein -= 1;
          damage = SPEAR_HUNT_DAMAGE;
        }
        a.hp -= damage;
        const spec = ANIMAL_SPECS[a.kind];
        if (spec.damage > 0) {
          if (!a.attackTargetUnitId) a.attackTargetUnitId = u.id;
        } else {
          a.state = "flee";
        }
        this.rallyAlliesToHunt(u, a);
        if (a.hp <= 0) {
          this.resources[u.owner].fleisch += spec.meat;
          this.animals.delete(a.id);
          this.removedAnimalIds.push(a.id);
          u.huntTarget = null;
          u.state = "idle";
        }
      }
      return true;
    }

    const ti = Math.floor(a.gx);
    const tj = Math.floor(a.gy);
    const last = u.path[u.path.length - 1];
    const lastTile = last
      ? `${Math.floor(last.gx)},${Math.floor(last.gy)}`
      : null;
    if (lastTile !== `${ti},${tj}`) {
      this.repathToHuntable(u, a, this.blockedTilesFor(u, new Set()));
    }
    u.state = "moving";

    if (u.path.length > 0) {
      const wp = u.path[0];
      const ddx = wp.gx - u.gx;
      const ddy = wp.gy - u.gy;
      const sd = Math.hypot(ddx, ddy);
      if (sd < 0.02) {
        u.gx = wp.gx;
        u.gy = wp.gy;
        u.path.shift();
      } else {
        const step = Math.min(u.speed * dt, sd);
        u.gx += (ddx / sd) * step;
        u.gy += (ddy / sd) * step;
      }
      this.maybeFootprint(u);
    }
    return true;
  }

  addPlayer(p: PlayerId, language?: Language): UnitSnapshot[] {
    if (this.active[p]) return this.unitsSnapshot().filter((u) => u.owner === p);
    this.active[p] = true;
    this.growthTimer[p] = 0;
    this.growthActive[p] = false;
    this.nextUnitIdx[p] = TRIBE_SIZE;
    this.tribeLanguage[p] = language ?? languageForSlot(this.seed, p);
    const a = this.spawns[p];
    const offsets: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    const created: SimUnit[] = [];
    const lang = this.tribeLanguage[p];
    for (let k = 0; k < TRIBE_SIZE; k++) {
      const [di, dj] = offsets[k % offsets.length];
      const ageJitter = rand01(this.seed ^ 0xa6e, k, p) * 180;
      const gender = STARTING_GENDERS[k];
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
        huntTarget: null,
        huntTimer: 0,
        harvestTimer: 0,
        lastFootprintTile: { i: a.cx + di, j: a.cy + dj },
        hp: UNIT_HP_MAX,
        hpMax: UNIT_HP_MAX,
        eatCooldown: 0,
        autoHuntScanTimer: rand01(this.seed ^ 0xb33, k, p) * UNIT_AUTO_HUNT_SCAN_INTERVAL,
        ageSec: CHILD_AGE_SEC + ageJitter,
        gender,
        firstName: pickFirstName(this.seed, lang, gender, p, k),
      };
      this.units.set(u.id, u);
      created.push(u);
    }
    return created.map(this.snap);
  }

  removePlayer(p: PlayerId): string[] {
    if (!this.active[p]) return [];
    this.active[p] = false;
    const removed: string[] = [];
    for (const u of this.units.values()) {
      if (u.owner === p) {
        removed.push(u.id);
        this.units.delete(u.id);
      }
    }
    this.resources[p] = emptyResources();
    this.growthTimer[p] = 0;
    this.growthActive[p] = false;
    for (const key of [...this.lastEncounterTick.keys()]) {
      const [a, b] = key.split("_").map(Number);
      if (a === p || b === p) this.lastEncounterTick.delete(key);
    }
    return removed;
  }

  isWalkable(i: number, j: number): boolean {
    return isLandTile(this.seed, i, j);
  }

  unitsSnapshot(): UnitSnapshot[] {
    const out: UnitSnapshot[] = [];
    for (const u of this.units.values()) out.push(this.snap(u));
    return out;
  }

  private snap = (u: SimUnit): UnitSnapshot => ({
    id: u.id,
    owner: u.owner,
    gx: u.gx,
    gy: u.gy,
    state: u.state,
    color: u.color,
    hp: u.hp,
    hpMax: u.hpMax,
    ageSec: u.ageSec,
    gender: u.gender,
    firstName: u.firstName,
  });

  consumeNewRemovedObjects(): RemovedObject[] {
    const out = this.newRemovedObjects;
    this.newRemovedObjects = [];
    return out;
  }

  consumeRespawnedObjects(): RemovedObject[] {
    const out = this.respawnedObjects;
    this.respawnedObjects = [];
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
      const u = this.units.get(id);
      if (!u || u.owner !== owner) continue;
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
      const u = this.units.get(id);
      if (!u || u.owner !== owner) continue;
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
    if (
      hasStoneAt(this.seed, i, j) &&
      !this.removedKeys.has(objKey("stone", i, j))
    ) return "stone";
    return null;
  }

  private blockedTilesFor(self: SimUnit, claimed: Set<string>): Set<string> {
    const s = new Set<string>(claimed);
    for (const u of this.units.values()) {
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
      u.huntTarget = null;
      u.state = "idle";
      return;
    }
    u.path = path.slice(1).map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }));
    u.state = "moving";
    u.harvestTarget = null;
    u.huntTarget = null;
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
    u.huntTarget = null;
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
    u.hp = Math.max(0, u.hp - UNIT_HP_LOSS_PER_TILE);
    this.tryAutoPick(u, ti, tj);
    this.tryEngageAnimalOnTile(u, ti, tj);
  }

  private tryEngageAnimalOnTile(u: SimUnit, ti: number, tj: number): void {
    if (u.huntTarget) return;
    for (const a of this.animals.values()) {
      if (a.hp <= 0) continue;
      if (Math.floor(a.gx) !== ti) continue;
      if (Math.floor(a.gy) !== tj) continue;
      this.startHunt(u, a, this.blockedTilesFor(u, new Set()));
      return;
    }
  }

  private tryAutoPick(u: SimUnit, ti: number, tj: number): void {
    if (hasTreeAt(this.seed, ti, tj)) {
      const k = objKey("tree", ti, tj);
      if (!this.removedKeys.has(k)) {
        this.autoPickAndRegrow(
          u, "tree", ti, tj, "holz",
          TREE_AUTOPICK_GAIN, TREE_REGROW_TICKS,
        );
        return;
      }
    }
    if (hasBushAt(this.seed, ti, tj)) {
      const k = objKey("bush", ti, tj);
      if (!this.removedKeys.has(k)) {
        this.autoPickAndRegrow(
          u, "bush", ti, tj, "beeren",
          BUSH_AUTOPICK_GAIN, BUSH_REGROW_TICKS,
        );
        return;
      }
    }
    if (hasMushroomAt(this.seed, ti, tj)) {
      const k = objKey("mushroom", ti, tj);
      if (!this.removedKeys.has(k)) {
        this.autoPickAndRegrow(
          u, "mushroom", ti, tj, "pilze",
          MUSHROOM_AUTOPICK_GAIN, MUSHROOM_REGROW_TICKS,
        );
        return;
      }
    }
    if (hasStoneAt(this.seed, ti, tj)) {
      const k = objKey("stone", ti, tj);
      if (!this.removedKeys.has(k)) {
        this.autoPickAndRegrow(
          u, "stone", ti, tj, "stein",
          STONE_AUTOPICK_GAIN, 0,
        );
      }
    }
    this.tryAutoPickShallowFish(u, ti, tj);
    this.tryAutoPickWater(u, ti, tj);
  }

  private tryAutoPickWater(u: SimUnit, ti: number, tj: number): void {
    const adj: Array<[number, number]> = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (const [di, dj] of adj) {
      const b = biomeAt(this.seed, ti + di, tj + dj);
      if (b === "lake" || b === "river") {
        this.resources[u.owner].wasser += WATER_AUTOPICK_GAIN;
        return;
      }
    }
  }

  private tryAutoPickShallowFish(u: SimUnit, ti: number, tj: number): void {
    const adj: Array<[number, number]> = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (const [di, dj] of adj) {
      const ni = ti + di;
      const nj = tj + dj;
      if (!hasFishAt(this.seed, ni, nj)) continue;
      const k = objKey("fish", ni, nj);
      if (this.removedKeys.has(k)) continue;
      this.autoPickAndRegrow(
        u, "fish", ni, nj, "fisch",
        FISH_AUTOPICK_GAIN, 0,
      );
    }
  }

  private autoPickAndRegrow(
    u: SimUnit,
    kind: ObjectKind,
    ti: number,
    tj: number,
    resKey: keyof Resources,
    gain: number,
    regrowTicks: number,
  ): void {
    const k = objKey(kind, ti, tj);
    this.removedKeys.add(k);
    this.remaining.delete(k);
    const ro: RemovedObject = { kind, i: ti, j: tj };
    this.removedObjects.push(ro);
    this.newRemovedObjects.push(ro);
    if (regrowTicks > 0) {
      this.regrow.set(k, this.tick + regrowTicks);
    }
    this.resources[u.owner][resKey] += gain;
  }

  private hpGainForResource(resKey: keyof Resources): number {
    if (resKey === "fleisch") return HP_GAIN_FLEISCH;
    if (resKey === "fisch") return HP_GAIN_FISCH;
    if (resKey === "beeren") return HP_GAIN_BEEREN;
    if (resKey === "pilze") return HP_GAIN_PILZE;
    if (resKey === "wasser") return HP_GAIN_WASSER;
    return 0;
  }

  private autoEat(u: SimUnit): void {
    if (u.hp >= u.hpMax) return;
    const r = this.resources[u.owner];
    const order: Array<keyof Resources> = [
      "fleisch", "fisch", "pilze", "beeren", "wasser",
    ];
    for (const key of order) {
      if (r[key] <= 0) continue;
      const heal = this.hpGainForResource(key);
      if (heal <= 0) continue;
      r[key] -= 1;
      u.hp = Math.min(u.hpMax, u.hp + heal);
      return;
    }
  }

  private expireRegrows(): void {
    if (this.regrow.size === 0) return;
    for (const [k, expire] of this.regrow) {
      if (this.tick < expire) continue;
      this.regrow.delete(k);
      this.removedKeys.delete(k);
      const idx = this.removedObjects.findIndex(
        (o) => objKey(o.kind, o.i, o.j) === k,
      );
      if (idx >= 0) {
        const ro = this.removedObjects[idx];
        this.removedObjects.splice(idx, 1);
        this.respawnedObjects.push(ro);
      }
    }
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
    this.stepAnimals(dt);
    for (const u of this.units.values()) {
      u.eatCooldown -= dt;
      if (u.eatCooldown <= 0) {
        u.eatCooldown = EAT_INTERVAL;
        this.autoEat(u);
      }
      u.hp = Math.max(0, u.hp - UNIT_HP_LOSS_PER_SEC_IDLE * dt);
      u.ageSec += dt;
      if (u.ageSec >= MAX_AGE_SEC) u.hp = 0;
      if (u.huntTarget) {
        if (this.tickHunt(u, dt)) continue;
      }
      if (u.state === "moving") {
        if (u.path.length === 0) {
          if (u.huntTarget) {
            u.state = "idle";
          } else if (u.harvestTarget && this.objectStillThere(u.harvestTarget)) {
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
    this.expireRegrows();
    this.reapDeadUnits();
    this.growthCheck(dt);
    this.encounterCheck();
    this.spreadIdleUnits();
  }

  private encounterCheck(): void {
    const byPlayer: SimUnit[][] = Array.from(
      { length: MAX_PLAYERS },
      () => [],
    );
    let activeWithUnits = 0;
    for (const u of this.units.values()) byPlayer[u.owner].push(u);
    for (let p = 0; p < MAX_PLAYERS; p++) {
      if (this.active[p] && byPlayer[p].length > 0) activeWithUnits++;
    }
    if (activeWithUnits < 2) return;

    const r2 = ENCOUNTER_RANGE * ENCOUNTER_RANGE;
    for (let a = 0; a < MAX_PLAYERS; a++) {
      if (!this.active[a] || byPlayer[a].length === 0) continue;
      for (let b = a + 1; b < MAX_PLAYERS; b++) {
        if (!this.active[b] || byPlayer[b].length === 0) continue;
        const key = `${a}_${b}`;
        const last = this.lastEncounterTick.get(key) ?? -ENCOUNTER_COOLDOWN_TICKS;
        if (this.tick - last < ENCOUNTER_COOLDOWN_TICKS) continue;

        let met = false;
        for (const ua of byPlayer[a]) {
          for (const ub of byPlayer[b]) {
            const dx = ua.gx - ub.gx;
            const dy = ua.gy - ub.gy;
            if (dx * dx + dy * dy <= r2) { met = true; break; }
          }
          if (met) break;
        }
        if (!met) continue;

        this.lastEncounterTick.set(key, this.tick);
        const { aToB, bToA } = this.transferWomenForBalance(
          a, b, byPlayer[a], byPlayer[b],
        );
        const listA = (aToB > 0 || bToA > 0)
          ? byPlayer[a].filter((u) => u.owner === a)
              .concat(byPlayer[b].filter((u) => u.owner === a))
          : byPlayer[a];
        const listB = (aToB > 0 || bToA > 0)
          ? byPlayer[b].filter((u) => u.owner === b)
              .concat(byPlayer[a].filter((u) => u.owner === b))
          : byPlayer[b];
        const bornForA = this.tryFreeBirth(a, listA);
        const bornForB = this.tryFreeBirth(b, listB);
        this.encounterEvents.push({
          a, b, bornForA, bornForB,
          transfersAtoB: aToB,
          transfersBtoA: bToA,
        });
      }
    }
  }

  private transferWomenForBalance(
    a: PlayerId,
    b: PlayerId,
    listA: SimUnit[],
    listB: SimUnit[],
  ): { aToB: number; bToA: number } {
    const surplus = (list: SimUnit[]) => {
      let m = 0;
      let f = 0;
      for (const u of list) {
        if (u.gender === "m") m++;
        else f++;
      }
      const paired = Math.min(m, f);
      return { surplusM: m - paired, surplusF: f - paired };
    };
    const sA = surplus(listA);
    const sB = surplus(listB);
    let aToB = 0;
    let bToA = 0;
    if (sA.surplusF > 0 && sB.surplusM > 0) {
      aToB = Math.min(
        sA.surplusF,
        sB.surplusM,
        Math.max(0, MAX_TRIBE_SIZE - listB.length),
      );
    } else if (sA.surplusM > 0 && sB.surplusF > 0) {
      bToA = Math.min(
        sB.surplusF,
        sA.surplusM,
        Math.max(0, MAX_TRIBE_SIZE - listA.length),
      );
    }
    if (aToB > 0) this.transferWomen(listA, b, aToB);
    if (bToA > 0) this.transferWomen(listB, a, bToA);
    return { aToB, bToA };
  }

  private transferWomen(
    srcList: SimUnit[],
    targetOwner: PlayerId,
    count: number,
  ): void {
    const newColor = PLAYER_COLORS[targetOwner % PLAYER_COLORS.length];
    let moved = 0;
    for (const u of srcList) {
      if (moved >= count) break;
      if (u.gender !== "f") continue;
      u.owner = targetOwner;
      u.color = newColor;
      u.path = [];
      u.harvestTarget = null;
      u.huntTarget = null;
      u.huntTimer = 0;
      u.harvestTimer = 0;
      u.state = "idle";
      moved++;
    }
  }

  private tryFreeBirth(p: PlayerId, list: SimUnit[]): boolean {
    if (list.length < 2 || list.length >= MAX_TRIBE_SIZE) return false;
    let males = 0;
    let females = 0;
    let cx = 0;
    let cy = 0;
    for (const u of list) {
      if (u.gender === "m") males++;
      else females++;
      cx += u.gx;
      cy += u.gy;
    }
    if (males < 1 || females < 1) return false;
    this.spawnNewTribeMember(p, cx / list.length, cy / list.length);
    return true;
  }

  consumeEncounterEvents(): EncounterEvent[] {
    const out = this.encounterEvents;
    this.encounterEvents = [];
    return out;
  }

  private growthCheck(dt: number): void {
    for (let p = 0; p < MAX_PLAYERS; p++) {
      if (!this.active[p]) {
        this.growthActive[p] = false;
        continue;
      }
      let count = 0;
      let males = 0;
      let females = 0;
      let cx = 0;
      let cy = 0;
      for (const u of this.units.values()) {
        if (u.owner !== p) continue;
        count++;
        if (u.gender === "m") males++;
        else females++;
        cx += u.gx;
        cy += u.gy;
      }
      if (count < 2 || count >= MAX_TRIBE_SIZE || males < 1 || females < 1) {
        this.growthTimer[p] = 0;
        this.growthActive[p] = false;
        continue;
      }
      this.growthActive[p] = true;
      this.growthTimer[p] += dt;
      if (this.growthTimer[p] >= GROWTH_REQUIRED_SEC) {
        this.growthTimer[p] = 0;
        this.spawnNewTribeMember(p, cx / count, cy / count);
      }
    }
  }

  growthSnapshot(): { progress: number[]; active: boolean[] } {
    const progress: number[] = new Array(MAX_PLAYERS);
    const active: boolean[] = new Array(MAX_PLAYERS);
    for (let p = 0; p < MAX_PLAYERS; p++) {
      progress[p] = this.active[p]
        ? Math.min(1, this.growthTimer[p] / GROWTH_REQUIRED_SEC)
        : 0;
      active[p] = !!this.growthActive[p];
    }
    return { progress, active };
  }

  private spawnNewTribeMember(p: PlayerId, ax: number, ay: number): void {
    const occupied = new Set<string>();
    for (const u of this.units.values()) {
      occupied.add(`${Math.floor(u.gx)},${Math.floor(u.gy)}`);
    }
    const ti = Math.floor(ax);
    const tj = Math.floor(ay);
    let spot: { i: number; j: number } | null = null;
    if (this.isWalkable(ti, tj) && !occupied.has(`${ti},${tj}`)) {
      spot = { i: ti, j: tj };
    } else {
      spot = this.findFreeTileNear(ti, tj, occupied);
    }
    if (!spot) {
      const a = this.spawns[p];
      spot =
        this.findFreeTileNear(a.cx, a.cy, occupied) ?? { i: a.cx, j: a.cy };
    }
    const k = this.nextUnitIdx[p]++;
    const gender: UnitGender =
      rand01(this.seed ^ 0xb1a, p, k) < 0.5 ? "m" : "f";
    const lang = this.tribeLanguage[p];
    const u: SimUnit = {
      id: `u_p${p}_${k}`,
      owner: p,
      gx: spot.i + 0.5,
      gy: spot.j + 0.5,
      speed: 3.5,
      color: PLAYER_COLORS[p % PLAYER_COLORS.length],
      state: "idle",
      path: [],
      harvestTarget: null,
      huntTarget: null,
      huntTimer: 0,
      harvestTimer: 0,
      lastFootprintTile: { i: spot.i, j: spot.j },
      hp: UNIT_HP_MAX,
      hpMax: UNIT_HP_MAX,
      eatCooldown: 0,
      autoHuntScanTimer: 0,
      ageSec: 0,
      gender,
      firstName: pickFirstName(this.seed, lang, gender, p, k),
    };
    this.units.set(u.id, u);
    this.newUnits.push(this.snap(u));
  }

  private reapDeadUnits(): void {
    for (const u of this.units.values()) {
      if (u.hp <= 0) {
        this.deadUnitIds.push(u.id);
        this.units.delete(u.id);
      }
    }
  }

  private spreadIdleUnits(): void {
    const groups = new Map<string, SimUnit[]>();
    const dest = new Set<string>();
    for (const u of this.units.values()) {
      if (u.path.length === 0) {
        const key = `${Math.floor(u.gx)},${Math.floor(u.gy)}`;
        const arr = groups.get(key) ?? [];
        arr.push(u);
        groups.set(key, arr);
      } else {
        const last = u.path[u.path.length - 1];
        dest.add(`${Math.floor(last.gx)},${Math.floor(last.gy)}`);
      }
    }
    const blocked = new Set<string>(dest);
    for (const key of groups.keys()) blocked.add(key);

    for (const arr of groups.values()) {
      if (arr.length <= 1) continue;
      for (let i = 1; i < arr.length; i++) {
        const u = arr[i];
        const ti = Math.floor(u.gx);
        const tj = Math.floor(u.gy);
        if (u.harvestTarget && this.objectStillThere(u.harvestTarget)) {
          const t = u.harvestTarget;
          this.startHarvest(u, t.kind, t.i, t.j, blocked);
        } else if (u.huntTarget && this.animals.has(u.huntTarget)) {
          const a = this.animals.get(u.huntTarget)!;
          this.startHunt(u, a, blocked);
        } else {
          const free = this.findFreeTileNear(ti, tj, blocked);
          if (!free) continue;
          this.startMove(u, free.i, free.j, blocked);
        }
        const last = u.path[u.path.length - 1];
        if (last) blocked.add(`${Math.floor(last.gx)},${Math.floor(last.gy)}`);
      }
    }
  }

  private objectStillThere(t: { kind: ObjectKind; i: number; j: number }): boolean {
    const k = objKey(t.kind, t.i, t.j);
    if (this.removedKeys.has(k)) return false;
    if (t.kind === "tree") return hasTreeAt(this.seed, t.i, t.j);
    if (t.kind === "bush") return hasBushAt(this.seed, t.i, t.j);
    if (t.kind === "mushroom") return hasMushroomAt(this.seed, t.i, t.j);
    if (t.kind === "fish") return hasFishAt(this.seed, t.i, t.j);
    return hasStoneAt(this.seed, t.i, t.j);
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
      resKey = "pilze";
      baseTotal = mushroomBerriesAt(this.seed, t.i, t.j);
    } else if (t.kind === "fish") {
      amount = FISH_HARVEST_AMOUNT;
      resKey = "fisch";
      baseTotal = fishMeatAt(this.seed, t.i, t.j);
    } else {
      amount = STONE_HARVEST_AMOUNT;
      resKey = "stein";
      baseTotal = stoneAmountAt(this.seed, t.i, t.j);
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
