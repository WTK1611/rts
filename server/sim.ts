import { findPath } from "../shared/pathfinding";
import {
  AnimalKind,
  AnimalSnapshot,
  ARTIFACT_DISCOVERY_RADIUS,
  ArtifactFindEvent,
  ArtifactKind,
  ArtifactReward,
  ArtifactSnapshot,
  CAMPFIRE_RANGE,
  CampfireSnapshot,
  EncounterEvent,
  emptyResources,
  Footprint,
  FOOTPRINT_LIFETIME_TICKS,
  HuntWeapon,
  MAX_PLAYERS,
  MAX_TRIBE_SIZE,
  ObjectKind,
  PlayerId,
  RemovedObject,
  ResourceFlowEvent,
  Resources,
  TICK_RATE,
  TribeSplit,
  UnitGender,
  UnitSnapshot,
} from "../shared/protocol";
import { NameLanguage, languageForSlot, pickFirstName } from "../shared/names";
import {
  artifactsFromSeed,
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
const PREGNANCY_HEALTH_MIN_FRAC = 0.33;
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

const CAMPFIRE_IGNITE_DELAY_SEC = 8;
const CAMPFIRE_IGNITE_MIN_UNITS = 2;
const CAMPFIRE_IGNITE_CLUSTER_RADIUS = 2.5;
const CAMPFIRE_BURN_PER_FUEL_SEC = 25;
const CAMPFIRE_HP_REGEN_PER_SEC = 1.2;
const CAMPFIRE_REPEL_RADIUS = CAMPFIRE_RANGE + 2.5;

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
  state: "idle" | "moving" | "harvesting" | "hunting";
  path: Array<{ gx: number; gy: number }>;
  harvestTarget: { kind: ObjectKind; i: number; j: number } | null;
  huntTarget: string | null;
  huntTimer: number;
  huntWeapon: HuntWeapon | null;
  huntFacing: 1 | -1;
  harvestTimer: number;
  lastFootprintTile: { i: number; j: number } | null;
  hp: number;
  hpMax: number;
  eatCooldown: number;
  autoHuntScanTimer: number;
  ageSec: number;
  gender: UnitGender;
  firstName: string;
  isChief: boolean;
  idleSec: number;
  autoFollowing: boolean;
  autoFollowScanTimer: number;
}

const MAX_AGE_SEC = 420;
const CHILD_AGE_SEC = 60;

const UNIT_HP_MAX = 100;
const UNIT_HP_LOSS_PER_TILE = 0.4;
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
  predator: boolean;
  preyDamage: number;
  matureAgeSec: number;
  gestationSec: number;
  maxAgeSec: number;
  aquatic: boolean;
}

const ANIMAL_SPECS: Record<AnimalKind, AnimalSpec> = {
  hare:        { hp: 3,  speed: 4.0, meat: 2,  biomes: ["wiesen", "wald", "savanne"],          density: 0.0150, wanderRadius: 6,  damage: 0,  aggressive: false, detectRange: 0, autoHuntable: true,  autoHuntRange: 6, attackRange: 1.5, aggroDurationSec: 0,  predator: false, preyDamage: 0, matureAgeSec: 25, gestationSec: 30,  maxAgeSec: 140, aquatic: false },
  reindeer:    { hp: 8,  speed: 3.0, meat: 6,  biomes: ["wiesen", "wald"],                     density: 0.0040, wanderRadius: 10, damage: 0,  aggressive: false, detectRange: 0, autoHuntable: true,  autoHuntRange: 5, attackRange: 1.5, aggroDurationSec: 0,  predator: false, preyDamage: 0, matureAgeSec: 50, gestationSec: 55,  maxAgeSec: 260, aquatic: false },
  megaloceros: { hp: 15, speed: 3.4, meat: 10, biomes: ["wald", "wiesen"],                     density: 0.0025, wanderRadius: 8,  damage: 0,  aggressive: false, detectRange: 0, autoHuntable: true,  autoHuntRange: 5, attackRange: 1.5, aggroDurationSec: 0,  predator: false, preyDamage: 0, matureAgeSec: 60, gestationSec: 65,  maxAgeSec: 300, aquatic: false },
  bison:       { hp: 18, speed: 2.6, meat: 12, biomes: ["savanne", "wiesen", "wueste"],        density: 0.0035, wanderRadius: 8,  damage: 4,  aggressive: true,  detectRange: 4, autoHuntable: false, autoHuntRange: 0, attackRange: 1.5, aggroDurationSec: 8,  predator: false, preyDamage: 0, matureAgeSec: 60, gestationSec: 70,  maxAgeSec: 320, aquatic: false },
  caveLion:    { hp: 12, speed: 4.0, meat: 6,  biomes: ["felsen", "wueste", "savanne", "wiesen"], density: 0.0018, wanderRadius: 12, damage: 5,  aggressive: true,  detectRange: 7, autoHuntable: false, autoHuntRange: 0, attackRange: 1.5, aggroDurationSec: 25, predator: true,  preyDamage: 5, matureAgeSec: 55, gestationSec: 60,  maxAgeSec: 280, aquatic: false },
  mammoth:     { hp: 30, speed: 1.8, meat: 25, biomes: ["wiesen", "savanne", "wueste"],        density: 0.0014, wanderRadius: 6,  damage: 10, aggressive: true,  detectRange: 3, autoHuntable: false, autoHuntRange: 0, attackRange: 1.8, aggroDurationSec: 12, predator: false, preyDamage: 0, matureAgeSec: 90, gestationSec: 100, maxAgeSec: 420, aquatic: false },
  alligator:   { hp: 14, speed: 2.6, meat: 8,  biomes: ["lake", "river"],                      density: 0.0070, wanderRadius: 5,  damage: 6,  aggressive: true,  detectRange: 5, autoHuntable: true,  autoHuntRange: 5, attackRange: 1.6, aggroDurationSec: 18, predator: true,  preyDamage: 6, matureAgeSec: 50, gestationSec: 70,  maxAgeSec: 320, aquatic: true  },
  bear:        { hp: 22, speed: 3.0, meat: 14, biomes: ["wald", "felsen"],                     density: 0.0016, wanderRadius: 10, damage: 8,  aggressive: true,  detectRange: 6, autoHuntable: false, autoHuntRange: 0, attackRange: 1.6, aggroDurationSec: 22, predator: true,  preyDamage: 7, matureAgeSec: 70, gestationSec: 80,  maxAgeSec: 360, aquatic: false },
};

function pickHuntWeapon(res: Resources): HuntWeapon {
  if (res.holz >= 1 && res.stein >= 1) return "spear";
  if (res.holz >= 1) return "club";
  if (res.stein >= 1) return "stones";
  return "fists";
}

const ANIMAL_SPAWN_RADIUS = 220;
const HUNT_INTERVAL = 0.9;
const FIST_HUNT_DAMAGE = 2;
const STONE_HUNT_DAMAGE = 3;
const CLUB_HUNT_DAMAGE = 4;
const SPEAR_HUNT_DAMAGE = 5;
const HUNT_RANGE = 1.5;
const ANIMAL_ATTACK_INTERVAL = 1.0;
const UNIT_AUTO_HUNT_SCAN_INTERVAL = 0.5;
const GROUP_FIGHT_RANGE = 7;
const ANIMAL_ESCAPE_RANGE_MULT = 1.8;
const PREY_FLEE_RANGE = 6;
const PREY_FLEE_REPATH_SEC = 0.8;
const ANIMAL_BREED_RANGE_SQ = 2.5 * 2.5;
const ANIMAL_KIND_CAP_FACTOR = 2.0;
const TRIBE_COHESION_RADIUS = 6;
const TRIBE_COHESION_IDLE_SEC = 2.0;
const FOLLOW_CHIEF_NEAR = 5;
const FOLLOW_CHIEF_SCAN_INTERVAL = 0.5;
const FOLLOW_CHIEF_SIGHT = 5;
const AUTO_FORAGE_CHIEF_RADIUS = 6;

export interface SimCampfire {
  id: string;
  owner: PlayerId;
  gx: number;
  gy: number;
  fuelTimer: number;
}

export interface SimArtifact {
  id: string;
  kind: ArtifactKind;
  gx: number;
  gy: number;
  reward: ArtifactReward;
  foundBy: PlayerId | null;
}

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
  attackTargetAnimalId: string | null;
  attackTimer: number;
  repathTimer: number;
  aggroExpireTick: number;
  fleeRepathTimer: number;
  ageSec: number;
  maxAgeSec: number;
  breedTimer: number;
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
  nextAnimalIdx = 0;
  animalKindCap: Map<AnimalKind, number> = new Map();
  deadUnitIds: string[] = [];
  extinctTribes: PlayerId[] = [];
  respawnedTribes: PlayerId[] = [];
  newUnits: UnitSnapshot[] = [];
  pregnancyTimer: Map<string, number> = new Map();
  nextUnitIdx: number[] = new Array(MAX_PLAYERS).fill(TRIBE_SIZE);
  tribeLanguage: NameLanguage[] = new Array(MAX_PLAYERS).fill("de");
  lastEncounterTick: Map<string, number> = new Map();
  encounterEvents: EncounterEvent[] = [];
  campfires: Map<string, SimCampfire> = new Map();
  campfireIgniteSec: number[] = new Array(MAX_PLAYERS).fill(0);
  campfireIgniteCx: number[] = new Array(MAX_PLAYERS).fill(0);
  campfireIgniteCy: number[] = new Array(MAX_PLAYERS).fill(0);
  removedCampfireIds: string[] = [];
  followChiefEnabled: boolean[] = new Array(MAX_PLAYERS).fill(false);
  artifacts: Map<string, SimArtifact> = new Map();
  artifactFinds: ArtifactFindEvent[] = [];
  tribeSplits: TribeSplit[] = [];
  resourceFlows: ResourceFlowEvent[] = [];
  tick = 0;

  constructor(seed: number) {
    this.seed = seed;
    this.spawns = spawnsFromSeed(seed);
    this.spawnAnimals();
    this.spawnArtifacts();
  }

  private spawnArtifacts(): void {
    const KINDS: ArtifactKind[] = ["stonehenge", "stoneCircle", "monolith"];
    const REWARDS: ArtifactReward[] = [
      { kind: "newMember", amount: 1 },
      { kind: "fleisch", amount: 50 },
      { kind: "fisch", amount: 50 },
      { kind: "beeren", amount: 100 },
      { kind: "pilze", amount: 200 },
    ];
    const specs = artifactsFromSeed(this.seed);
    for (let idx = 0; idx < specs.length; idx++) {
      const s = specs[idx];
      const id = `art_${idx}`;
      this.artifacts.set(id, {
        id,
        kind: KINDS[s.kindIdx % KINDS.length],
        gx: s.i + 0.5,
        gy: s.j + 0.5,
        reward: REWARDS[idx % REWARDS.length],
        foundBy: null,
      });
    }
  }

  artifactsSnapshot(): ArtifactSnapshot[] {
    const out: ArtifactSnapshot[] = [];
    for (const a of this.artifacts.values()) {
      out.push({
        id: a.id,
        kind: a.kind,
        gx: a.gx,
        gy: a.gy,
        reward: { ...a.reward },
        foundBy: a.foundBy,
      });
    }
    return out;
  }

  consumeArtifactFinds(): ArtifactFindEvent[] {
    const out = this.artifactFinds;
    this.artifactFinds = [];
    return out;
  }

  private checkArtifactDiscovery(): void {
    let anyUnfound = false;
    for (const a of this.artifacts.values()) {
      if (a.foundBy === null) { anyUnfound = true; break; }
    }
    if (!anyUnfound) return;
    const r2 = ARTIFACT_DISCOVERY_RADIUS * ARTIFACT_DISCOVERY_RADIUS;
    for (const a of this.artifacts.values()) {
      if (a.foundBy !== null) continue;
      let finder: PlayerId | null = null;
      for (const u of this.units.values()) {
        if (u.hp <= 0) continue;
        const dx = u.gx - a.gx;
        const dy = u.gy - a.gy;
        if (dx * dx + dy * dy <= r2) {
          finder = u.owner;
          break;
        }
      }
      if (finder === null) continue;
      a.foundBy = finder;
      this.applyArtifactReward(finder, a.reward, a.gx, a.gy);
      this.artifactFinds.push({
        id: a.id,
        finder,
        reward: { ...a.reward },
      });
    }
  }

  private applyArtifactReward(
    p: PlayerId,
    reward: ArtifactReward,
    gx: number,
    gy: number,
  ): void {
    if (reward.kind === "newMember") {
      let count = 0;
      for (const u of this.units.values()) if (u.owner === p) count++;
      if (count < MAX_TRIBE_SIZE) {
        this.spawnNewTribeMember(p, gx, gy);
      } else {
        this.resources[p].fleisch += 50;
      }
      return;
    }
    this.resources[p][reward.kind] += reward.amount;
  }

  private spawnAnimals(): void {
    const r = ANIMAL_SPAWN_RADIUS;
    const kinds = Object.keys(ANIMAL_SPECS) as AnimalKind[];
    const counts: Map<AnimalKind, number> = new Map();
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const b = biomeAt(this.seed, i, j);
        const isWater = b === "lake" || b === "river";
        const isLand = isLandTile(this.seed, i, j);
        if (!isWater && !isLand) continue;
        for (const kind of kinds) {
          const spec = ANIMAL_SPECS[kind];
          if (spec.aquatic ? !isWater : !isLand) continue;
          if (!spec.biomes.includes(b)) continue;
          const r01 = rand01(this.seed ^ kindHash(kind), i, j);
          if (r01 > spec.density) continue;
          const id = `a_${kind[0]}${this.nextAnimalIdx++}`;
          const ageR = rand01(this.seed ^ 0xa9e, i, j);
          const ageSec =
            spec.matureAgeSec + ageR * (spec.maxAgeSec - spec.matureAgeSec) * 0.6;
          const breedR = rand01(this.seed ^ 0xb29, i, j);
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
            attackTargetAnimalId: null,
            attackTimer: 0,
            repathTimer: 0,
            aggroExpireTick: 0,
            fleeRepathTimer: 0,
            ageSec,
            maxAgeSec: spec.maxAgeSec * (0.85 + ageR * 0.3),
            breedTimer: -spec.gestationSec * breedR,
          });
          counts.set(kind, (counts.get(kind) ?? 0) + 1);
          break;
        }
      }
    }
    for (const [kind, c] of counts) {
      this.animalKindCap.set(kind, Math.max(20, Math.ceil(c * ANIMAL_KIND_CAP_FACTOR)));
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

  consumeExtinctTribes(): PlayerId[] {
    const out = this.extinctTribes;
    this.extinctTribes = [];
    return out;
  }

  consumeRespawnedTribes(): PlayerId[] {
    const out = this.respawnedTribes;
    this.respawnedTribes = [];
    return out;
  }

  consumeTribeSplits(): TribeSplit[] {
    const out = this.tribeSplits;
    this.tribeSplits = [];
    return out;
  }

  consumeResourceFlows(): ResourceFlowEvent[] {
    const out = this.resourceFlows;
    this.resourceFlows = [];
    return out;
  }

  private pushFlow(
    owner: PlayerId,
    resource: keyof Resources,
    amount: number,
    gx: number,
    gy: number,
  ): void {
    if (amount === 0) return;
    this.resourceFlows.push({ owner, resource, amount, gx, gy });
  }

  tribeCounts(): number[] {
    const out = new Array(MAX_PLAYERS).fill(0);
    for (const u of this.units.values()) {
      if (u.owner >= 0 && u.owner < out.length) out[u.owner]++;
    }
    return out;
  }

  consumeNewUnits(): UnitSnapshot[] {
    const out = this.newUnits;
    this.newUnits = [];
    return out;
  }

  consumeRemovedCampfireIds(): string[] {
    const out = this.removedCampfireIds;
    this.removedCampfireIds = [];
    return out;
  }

  campfiresSnapshot(): CampfireSnapshot[] {
    const out: CampfireSnapshot[] = [];
    for (const f of this.campfires.values()) {
      out.push({
        id: f.id,
        owner: f.owner,
        gx: f.gx,
        gy: f.gy,
        fuel: Math.max(0, Math.min(1, f.fuelTimer / CAMPFIRE_BURN_PER_FUEL_SEC)),
      });
    }
    return out;
  }

  private animalSnap = (a: SimAnimal): AnimalSnapshot => {
    const spec = ANIMAL_SPECS[a.kind];
    return {
      id: a.id,
      kind: a.kind,
      gx: a.gx,
      gy: a.gy,
      hp: a.hp,
      hpMax: a.hpMax,
      state: a.state,
      maturity: spec.matureAgeSec > 0 ? Math.min(1, a.ageSec / spec.matureAgeSec) : 1,
    };
  };

  cmdHunt(owner: PlayerId, unitIds: string[], animalId: string): void {
    const a = this.animals.get(animalId);
    if (!a) return;
    const claimed = new Set<string>();
    for (const id of unitIds) {
      const u = this.units.get(id);
      if (!u || u.owner !== owner) continue;
      u.autoFollowing = false;
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
    u.huntWeapon = null;
    u.state = u.path.length > 0 ? "moving" : "hunting";
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
    const aquaticTarget = ANIMAL_SPECS[a.kind].aquatic;
    const walkable = (x: number, y: number) =>
      aquaticTarget ? this.unitHuntWalkable(x, y) : this.isWalkable(x, y);
    const candidates: Array<{ i: number; j: number }> = [];
    if (walkable(ti, tj)) candidates.push({ i: ti, j: tj });
    const adj: Array<[number, number]> = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (const [di, dj] of adj) {
      const ni = ti + di;
      const nj = tj + dj;
      if (walkable(ni, nj)) candidates.push({ i: ni, j: nj });
    }
    let bestPath: ReturnType<typeof findPath> = null;
    for (const c of candidates) {
      if (blocked.has(`${c.i},${c.j}`)) continue;
      const p = findPath(
        walkable,
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
      a.ageSec += dt;
      if (a.ageSec >= a.maxAgeSec) {
        a.hp = 0;
        dead.push(a.id);
        continue;
      }
      const spec = ANIMAL_SPECS[a.kind];

      if (spec.aggressive || spec.predator) {
        let nearestFire: SimCampfire | null = null;
        let nearestFireDist = CAMPFIRE_REPEL_RADIUS;
        for (const f of this.campfires.values()) {
          const d = Math.hypot(f.gx - a.gx, f.gy - a.gy);
          if (d < nearestFireDist) {
            nearestFire = f;
            nearestFireDist = d;
          }
        }
        if (nearestFire) {
          a.attackTargetUnitId = null;
          a.attackTargetAnimalId = null;
          a.state = "flee";
          a.fleeRepathTimer -= dt;
          if (a.path.length === 0 || a.fleeRepathTimer <= 0) {
            a.fleeRepathTimer = PREY_FLEE_REPATH_SEC;
            const dx = a.gx - nearestFire.gx;
            const dy = a.gy - nearestFire.gy;
            const d = Math.hypot(dx, dy) || 1;
            const fd = CAMPFIRE_REPEL_RADIUS + 2;
            const ti = Math.floor(a.gx + (dx / d) * fd);
            const tj = Math.floor(a.gy + (dy / d) * fd);
            if (this.animalWalkable(spec, ti, tj)) {
              const path = findPath(
                (x, y) => this.animalWalkable(spec, x, y),
                Math.floor(a.gx),
                Math.floor(a.gy),
                ti,
                tj,
                new Set<string>(),
              );
              if (path && path.length > 1) {
                a.path = path
                  .slice(1)
                  .map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }));
              }
            }
          }
          if (a.path.length > 0) {
            const wp = a.path[0];
            const ddx = wp.gx - a.gx;
            const ddy = wp.gy - a.gy;
            const sd = Math.hypot(ddx, ddy);
            const moveSpeed = spec.speed * 0.9;
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
          continue;
        }
      }

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
          a.attackTargetAnimalId = null;
          this.stepAnimalAttack(a, t, spec, dt);
          continue;
        }
      }

      if (spec.predator) {
        if (a.attackTargetAnimalId) {
          const t = this.animals.get(a.attackTargetAnimalId);
          if (!t || t.hp <= 0) {
            a.attackTargetAnimalId = null;
          } else {
            const homeDist = Math.hypot(
              a.gx - (a.homeI + 0.5),
              a.gy - (a.homeJ + 0.5),
            );
            if (homeDist > spec.wanderRadius * 3) {
              a.attackTargetAnimalId = null;
              a.path = [];
            }
          }
        }
        if (!a.attackTargetAnimalId) {
          let nearest: SimAnimal | null = null;
          let nearestDist = spec.detectRange;
          for (const other of this.animals.values()) {
            if (other === a) continue;
            if (other.hp <= 0) continue;
            const otherSpec = ANIMAL_SPECS[other.kind];
            if (otherSpec.predator || otherSpec.aggressive) continue;
            const d = Math.hypot(other.gx - a.gx, other.gy - a.gy);
            if (d < nearestDist) {
              nearest = other;
              nearestDist = d;
            }
          }
          if (nearest) {
            a.attackTargetAnimalId = nearest.id;
            a.path = [];
            a.repathTimer = 0;
          }
        }
        if (a.attackTargetAnimalId) {
          const t = this.animals.get(a.attackTargetAnimalId);
          if (t) {
            this.stepPredatorHunt(a, t, spec, dt);
            continue;
          }
        }
      }

      if (!spec.aggressive && !spec.predator) {
        let predator: SimAnimal | null = null;
        let pdist = PREY_FLEE_RANGE;
        for (const other of this.animals.values()) {
          if (other === a) continue;
          if (other.hp <= 0) continue;
          if (!ANIMAL_SPECS[other.kind].predator) continue;
          const d = Math.hypot(other.gx - a.gx, other.gy - a.gy);
          if (d < pdist) {
            predator = other;
            pdist = d;
          }
        }
        if (predator) {
          a.state = "flee";
          a.fleeRepathTimer -= dt;
          if (a.path.length === 0 || a.fleeRepathTimer <= 0) {
            a.fleeRepathTimer = PREY_FLEE_REPATH_SEC;
            const dx = a.gx - predator.gx;
            const dy = a.gy - predator.gy;
            const d = Math.hypot(dx, dy) || 1;
            const fd = PREY_FLEE_RANGE;
            const ti = Math.floor(a.gx + (dx / d) * fd);
            const tj = Math.floor(a.gy + (dy / d) * fd);
            if (this.animalWalkable(spec, ti, tj)) {
              const path = findPath(
                (x, y) => this.animalWalkable(spec, x, y),
                Math.floor(a.gx),
                Math.floor(a.gy),
                ti,
                tj,
                new Set<string>(),
              );
              if (path && path.length > 1) {
                a.path = path
                  .slice(1)
                  .map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }));
              }
            }
          }
          if (a.path.length > 0) {
            const wp = a.path[0];
            const ddx = wp.gx - a.gx;
            const ddy = wp.gy - a.gy;
            const sd = Math.hypot(ddx, ddy);
            const moveSpeed = spec.speed * 0.85;
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
          if (this.animalWalkable(spec, ti, tj)) {
            const path = findPath(
              (x, y) => this.animalWalkable(spec, x, y),
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

  private stepAnimalReproduction(dt: number): void {
    const kindCounts: Map<AnimalKind, number> = new Map();
    for (const a of this.animals.values()) {
      kindCounts.set(a.kind, (kindCounts.get(a.kind) ?? 0) + 1);
    }
    const newborns: SimAnimal[] = [];
    for (const a of this.animals.values()) {
      if (a.hp <= 0) continue;
      const spec = ANIMAL_SPECS[a.kind];
      if (a.ageSec < spec.matureAgeSec) continue;
      if (a.attackTargetUnitId) continue;
      if (a.attackTargetAnimalId) continue;
      if (a.state === "flee" || a.state === "hunt") continue;

      let mate: SimAnimal | null = null;
      for (const b of this.animals.values()) {
        if (b === a) continue;
        if (b.kind !== a.kind) continue;
        if (b.id <= a.id) continue;
        if (b.hp <= 0) continue;
        if (b.ageSec < spec.matureAgeSec) continue;
        if (b.attackTargetUnitId || b.attackTargetAnimalId) continue;
        if (b.state === "flee" || b.state === "hunt") continue;
        const dx = b.gx - a.gx;
        const dy = b.gy - a.gy;
        if (dx * dx + dy * dy < ANIMAL_BREED_RANGE_SQ) {
          mate = b;
          break;
        }
      }
      if (mate) {
        a.breedTimer += dt;
        if (a.breedTimer >= spec.gestationSec) {
          a.breedTimer = -spec.gestationSec * 0.6;
          const cap = this.animalKindCap.get(a.kind) ?? 0;
          const cur = (kindCounts.get(a.kind) ?? 0) + newborns.filter((n) => n.kind === a.kind).length;
          if (cap === 0 || cur < cap) {
            const child = this.makeAnimalChild(a);
            if (child) newborns.push(child);
          }
        }
      } else if (a.breedTimer > 0) {
        a.breedTimer = Math.max(0, a.breedTimer - dt * 0.5);
      }
    }
    for (const n of newborns) this.animals.set(n.id, n);
  }

  private makeAnimalChild(parent: SimAnimal): SimAnimal | null {
    const spec = ANIMAL_SPECS[parent.kind];
    const ti = Math.floor(parent.gx);
    const tj = Math.floor(parent.gy);
    if (!this.animalWalkable(spec, ti, tj)) return null;
    const id = `a_${parent.kind[0]}c${this.nextAnimalIdx++}`;
    return {
      id,
      kind: parent.kind,
      hp: spec.hp,
      hpMax: spec.hp,
      gx: parent.gx,
      gy: parent.gy,
      homeI: ti,
      homeJ: tj,
      state: "idle",
      path: [],
      decisionTimer: 1 + Math.random() * 3,
      attackTargetUnitId: null,
      attackTargetAnimalId: null,
      attackTimer: 0,
      repathTimer: 0,
      aggroExpireTick: 0,
      fleeRepathTimer: 0,
      ageSec: 0,
      maxAgeSec: spec.maxAgeSec * (0.85 + Math.random() * 0.3),
      breedTimer: -spec.gestationSec,
    };
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
    const tgtTile = this.aquaticPathTarget(spec, Math.floor(t.gx), Math.floor(t.gy));
    if (!tgtTile) {
      a.path = [];
      return;
    }
    const ti = tgtTile.i;
    const tj = tgtTile.j;
    const last = a.path[a.path.length - 1];
    const lastTile = last
      ? `${Math.floor(last.gx)},${Math.floor(last.gy)}`
      : null;
    if (a.repathTimer <= 0 || lastTile !== `${ti},${tj}`) {
      a.repathTimer = 0.5;
      const path = findPath(
        (x, y) => this.animalWalkable(spec, x, y),
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

  private stepPredatorHunt(
    a: SimAnimal,
    t: SimAnimal,
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
        if (spec.preyDamage > 0) {
          t.hp = Math.max(0, t.hp - spec.preyDamage);
          if (t.hp <= 0) {
            this.animals.delete(t.id);
            this.removedAnimalIds.push(t.id);
            a.attackTargetAnimalId = null;
            a.path = [];
            a.state = "idle";
          }
        }
      }
      return;
    }

    a.repathTimer -= dt;
    const tgtTile = this.aquaticPathTarget(spec, Math.floor(t.gx), Math.floor(t.gy));
    if (!tgtTile) {
      a.path = [];
      return;
    }
    const ti = tgtTile.i;
    const tj = tgtTile.j;
    const last = a.path[a.path.length - 1];
    const lastTile = last
      ? `${Math.floor(last.gx)},${Math.floor(last.gy)}`
      : null;
    if (a.repathTimer <= 0 || lastTile !== `${ti},${tj}`) {
      a.repathTimer = 0.4;
      const path = findPath(
        (x, y) => this.animalWalkable(spec, x, y),
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
      const moveSpeed = spec.speed * 0.9;
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
      u.huntWeapon = null;
      u.path = [];
      u.state = "hunting";
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
      u.huntWeapon = null;
      u.state = "idle";
      u.path = [];
      return true;
    }
    const dx = a.gx - u.gx;
    const dy = a.gy - u.gy;
    const dist = Math.hypot(dx, dy);

    if (dist <= HUNT_RANGE) {
      u.path = [];
      u.state = "hunting";
      u.huntFacing = a.gx >= u.gx ? 1 : -1;
      const ownerRes = this.resources[u.owner];
      u.huntWeapon = pickHuntWeapon(ownerRes);
      u.huntTimer += dt;
      if (u.huntTimer >= HUNT_INTERVAL) {
        u.huntTimer = 0;
        let damage = FIST_HUNT_DAMAGE;
        if (u.huntWeapon === "spear") {
          ownerRes.holz -= 1;
          ownerRes.stein -= 1;
          damage = SPEAR_HUNT_DAMAGE;
        } else if (u.huntWeapon === "club") {
          ownerRes.holz -= 1;
          damage = CLUB_HUNT_DAMAGE;
        } else if (u.huntWeapon === "stones") {
          ownerRes.stein -= 1;
          damage = STONE_HUNT_DAMAGE;
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
          u.huntWeapon = null;
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
    u.huntWeapon = null;

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

  addPlayer(p: PlayerId, language?: NameLanguage): UnitSnapshot[] {
    if (this.active[p]) return this.unitsSnapshot().filter((u) => u.owner === p);
    this.active[p] = true;
    this.clearPregnanciesFor(p);
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
    const usedNames = new Set<string>();
    for (let k = 0; k < TRIBE_SIZE; k++) {
      const [di, dj] = offsets[k % offsets.length];
      const ageJitter = rand01(this.seed ^ 0xa6e, k, p) * 180;
      const gender = STARTING_GENDERS[k];
      const firstName = pickFirstName(this.seed, lang, gender, p, k, usedNames);
      usedNames.add(firstName);
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
        huntWeapon: null,
        huntFacing: 1,
        harvestTimer: 0,
        lastFootprintTile: { i: a.cx + di, j: a.cy + dj },
        hp: UNIT_HP_MAX,
        hpMax: UNIT_HP_MAX,
        eatCooldown: 0,
        autoHuntScanTimer: rand01(this.seed ^ 0xb33, k, p) * UNIT_AUTO_HUNT_SCAN_INTERVAL,
        ageSec: CHILD_AGE_SEC + ageJitter,
        gender,
        firstName,
        isChief: false,
        autoFollowing: false,
        autoFollowScanTimer: 0,
        idleSec: 0,
      };
      this.units.set(u.id, u);
      created.push(u);
    }
    this.updateChiefs();
    return created.map(this.snap);
  }

  respawnTribe(p: PlayerId, language?: NameLanguage): UnitSnapshot[] {
    this.active[p] = true;
    this.clearPregnanciesFor(p);
    this.resources[p] = emptyResources();
    this.campfireIgniteSec[p] = 0;
    const fid = this.campfireIdFor(p);
    if (this.campfires.has(fid)) {
      this.campfires.delete(fid);
      this.removedCampfireIds.push(fid);
    }
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
    const base = this.nextUnitIdx[p];
    const usedNames = this.collectTribeNames(p);
    for (let k = 0; k < TRIBE_SIZE; k++) {
      const [di, dj] = offsets[k % offsets.length];
      const idx = base + k;
      const ageJitter = rand01(this.seed ^ 0xa6e, idx, p) * 180;
      const gender = STARTING_GENDERS[k];
      const firstName = pickFirstName(this.seed, lang, gender, p, idx, usedNames);
      usedNames.add(firstName);
      const u: SimUnit = {
        id: `u_p${p}_${idx}`,
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
        huntWeapon: null,
        huntFacing: 1,
        harvestTimer: 0,
        lastFootprintTile: { i: a.cx + di, j: a.cy + dj },
        hp: UNIT_HP_MAX,
        hpMax: UNIT_HP_MAX,
        eatCooldown: 0,
        autoHuntScanTimer: rand01(this.seed ^ 0xb33, idx, p) * UNIT_AUTO_HUNT_SCAN_INTERVAL,
        ageSec: CHILD_AGE_SEC + ageJitter,
        gender,
        firstName,
        isChief: false,
        idleSec: 0,
        autoFollowing: false,
        autoFollowScanTimer: 0,
      };
      this.units.set(u.id, u);
      created.push(u);
    }
    this.nextUnitIdx[p] = base + TRIBE_SIZE;
    this.updateChiefs();
    this.respawnedTribes.push(p);
    return created.map(this.snap);
  }

  removePlayer(p: PlayerId): string[] {
    if (!this.active[p]) return [];
    this.active[p] = false;
    this.followChiefEnabled[p] = false;
    const removed: string[] = [];
    for (const u of this.units.values()) {
      if (u.owner === p) {
        removed.push(u.id);
        this.units.delete(u.id);
      }
    }
    this.resources[p] = emptyResources();
    this.clearPregnanciesFor(p);
    this.campfireIgniteSec[p] = 0;
    const fid = this.campfireIdFor(p);
    if (this.campfires.has(fid)) {
      this.campfires.delete(fid);
      this.removedCampfireIds.push(fid);
    }
    for (const key of [...this.lastEncounterTick.keys()]) {
      const [a, b] = key.split("_").map(Number);
      if (a === p || b === p) this.lastEncounterTick.delete(key);
    }
    return removed;
  }

  private campfireIdFor(p: PlayerId): string {
    return `cf_p${p}`;
  }

  isWalkable(i: number, j: number): boolean {
    return isLandTile(this.seed, i, j);
  }

  private isWaterTile(i: number, j: number): boolean {
    const b = biomeAt(this.seed, i, j);
    return b === "lake" || b === "river";
  }

  private isShallowWater(i: number, j: number): boolean {
    if (!this.isWaterTile(i, j)) return false;
    return (
      this.isWalkable(i + 1, j) ||
      this.isWalkable(i - 1, j) ||
      this.isWalkable(i, j + 1) ||
      this.isWalkable(i, j - 1)
    );
  }

  private unitHuntWalkable(i: number, j: number): boolean {
    return this.isWalkable(i, j) || this.isShallowWater(i, j);
  }

  private animalWalkable(spec: AnimalSpec, i: number, j: number): boolean {
    if (spec.aquatic) return this.isWaterTile(i, j);
    return this.isWalkable(i, j);
  }

  private aquaticPathTarget(
    spec: AnimalSpec,
    ti: number,
    tj: number,
  ): { i: number; j: number } | null {
    if (!spec.aquatic) return { i: ti, j: tj };
    if (this.isWaterTile(ti, tj)) return { i: ti, j: tj };
    const maxR = 4;
    let best: { i: number; j: number } | null = null;
    let bestD = Infinity;
    for (let r = 1; r <= maxR; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const wi = ti + di;
          const wj = tj + dj;
          if (!this.isWaterTile(wi, wj)) continue;
          const d = di * di + dj * dj;
          if (d < bestD) {
            bestD = d;
            best = { i: wi, j: wj };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  unitsSnapshot(): UnitSnapshot[] {
    const out: UnitSnapshot[] = [];
    for (const u of this.units.values()) out.push(this.snap(u));
    return out;
  }

  private snap = (u: SimUnit): UnitSnapshot => {
    const out: UnitSnapshot = {
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
      isChief: u.isChief,
    };
    if (u.state === "hunting" && u.huntWeapon) {
      out.huntWeapon = u.huntWeapon;
      out.huntFacing = u.huntFacing;
    }
    return out;
  };

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
      u.autoFollowing = false;
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
      u.autoFollowing = false;
      const blocked = this.blockedTilesFor(u, claimed);
      this.startHarvest(u, kind, i, j, blocked);
      const last = u.path[u.path.length - 1];
      if (last) claimed.add(`${Math.floor(last.gx)},${Math.floor(last.gy)}`);
      else claimed.add(`${Math.floor(u.gx)},${Math.floor(u.gy)}`);
    }
  }

  cmdIgniteCampfire(owner: PlayerId, i: number, j: number): void {
    if (!this.active[owner]) return;
    if (!this.isWalkable(i, j)) return;
    if (this.objectKindAt(i, j) !== null) return;
    const r = this.resources[owner];
    if (r.holz < 1 || r.stein < 1) return;
    let nearest = Infinity;
    for (const u of this.units.values()) {
      if (u.owner !== owner) continue;
      const dx = u.gx - (i + 0.5);
      const dy = u.gy - (j + 0.5);
      const d2 = dx * dx + dy * dy;
      if (d2 < nearest) nearest = d2;
    }
    const SIGHT = 10;
    if (nearest > SIGHT * SIGHT) return;
    r.holz -= 1;
    r.stein -= 1;
    const id = this.campfireIdFor(owner);
    if (this.campfires.has(id)) {
      this.campfires.delete(id);
      this.removedCampfireIds.push(id);
    }
    this.campfires.set(id, {
      id,
      owner,
      gx: i + 0.5,
      gy: j + 0.5,
      fuelTimer: CAMPFIRE_BURN_PER_FUEL_SEC,
    });
    this.campfireIgniteSec[owner] = 0;
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
      u.huntWeapon = null;
      u.state = "idle";
      return;
    }
    u.path = path.slice(1).map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }));
    u.state = "moving";
    u.harvestTarget = null;
    u.huntTarget = null;
    u.huntWeapon = null;
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
    u.huntWeapon = null;
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
        this.pushFlow(u.owner, "wasser", WATER_AUTOPICK_GAIN, u.gx, u.gy);
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
    this.pushFlow(u.owner, resKey, gain, ti + 0.5, tj + 0.5);
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
      this.pushFlow(u.owner, key, -1, u.gx, u.gy);
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
    this.stepAnimalReproduction(dt);
    for (const u of this.units.values()) {
      u.eatCooldown -= dt;
      if (u.eatCooldown <= 0) {
        u.eatCooldown = EAT_INTERVAL;
        this.autoEat(u);
      }
      if (this.unitAtAnyFire(u)) {
        u.hp = Math.min(u.hpMax, u.hp + CAMPFIRE_HP_REGEN_PER_SEC * dt);
      } else {
        u.hp = Math.max(0, u.hp - UNIT_HP_LOSS_PER_SEC_IDLE * dt);
      }
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
      if (
        u.state === "idle" &&
        u.path.length === 0 &&
        !u.harvestTarget &&
        !u.huntTarget
      ) {
        u.idleSec += dt;
      } else {
        u.idleSec = 0;
      }
    }
    this.expireFootprints();
    this.expireRegrows();
    this.reapDeadUnits();
    this.growthCheck(dt);
    this.encounterCheck();
    this.spreadIdleUnits();
    this.cohereTribes();
    this.updateChiefs();
    this.followChief(dt);
    this.campfireStep(dt);
    this.checkArtifactDiscovery();
  }

  private unitAtAnyFire(u: SimUnit): boolean {
    const r2 = CAMPFIRE_RANGE * CAMPFIRE_RANGE;
    for (const f of this.campfires.values()) {
      const dx = f.gx - u.gx;
      const dy = f.gy - u.gy;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  private campfireStep(dt: number): void {
    for (let p = 0; p < MAX_PLAYERS; p++) {
      if (!this.active[p]) {
        this.campfireIgniteSec[p] = 0;
        continue;
      }
      this.tickIgniteFor(p, dt);
    }

    for (const f of [...this.campfires.values()]) {
      f.fuelTimer -= dt;
      if (f.fuelTimer > 0) continue;
      const r = this.resources[f.owner];
      if (r.holz >= 1 && r.stein >= 1) {
        r.holz -= 1;
        r.stein -= 1;
        f.fuelTimer = CAMPFIRE_BURN_PER_FUEL_SEC;
      } else {
        this.campfires.delete(f.id);
        this.removedCampfireIds.push(f.id);
      }
    }
  }

  private tickIgniteFor(p: PlayerId, dt: number): void {
    if (this.campfires.has(this.campfireIdFor(p))) {
      this.campfireIgniteSec[p] = 0;
      return;
    }
    let cx = 0;
    let cy = 0;
    let stationary = 0;
    for (const u of this.units.values()) {
      if (u.owner !== p) continue;
      if (u.path.length > 0) continue;
      if (u.huntTarget) continue;
      if (u.harvestTarget) continue;
      cx += u.gx;
      cy += u.gy;
      stationary++;
    }
    if (stationary < CAMPFIRE_IGNITE_MIN_UNITS) {
      this.campfireIgniteSec[p] = 0;
      return;
    }
    cx /= stationary;
    cy /= stationary;
    let cluster = 0;
    const r2 = CAMPFIRE_IGNITE_CLUSTER_RADIUS * CAMPFIRE_IGNITE_CLUSTER_RADIUS;
    for (const u of this.units.values()) {
      if (u.owner !== p) continue;
      if (u.path.length > 0) continue;
      if (u.huntTarget) continue;
      if (u.harvestTarget) continue;
      const dx = u.gx - cx;
      const dy = u.gy - cy;
      if (dx * dx + dy * dy <= r2) cluster++;
    }
    if (cluster < CAMPFIRE_IGNITE_MIN_UNITS) {
      this.campfireIgniteSec[p] = 0;
      return;
    }
    if (this.campfireIgniteSec[p] <= 0) {
      this.campfireIgniteCx[p] = cx;
      this.campfireIgniteCy[p] = cy;
    } else {
      const ax = this.campfireIgniteCx[p];
      const ay = this.campfireIgniteCy[p];
      const dx = cx - ax;
      const dy = cy - ay;
      if (dx * dx + dy * dy > r2) {
        this.campfireIgniteCx[p] = cx;
        this.campfireIgniteCy[p] = cy;
        this.campfireIgniteSec[p] = 0;
      }
    }
    this.campfireIgniteSec[p] += dt;
    if (this.campfireIgniteSec[p] < CAMPFIRE_IGNITE_DELAY_SEC) return;
    const r = this.resources[p];
    if (r.holz < 1 || r.stein < 1) return;
    r.holz -= 1;
    r.stein -= 1;
    const id = this.campfireIdFor(p);
    this.campfires.set(id, {
      id,
      owner: p,
      gx: this.campfireIgniteCx[p],
      gy: this.campfireIgniteCy[p],
      fuelTimer: CAMPFIRE_BURN_PER_FUEL_SEC,
    });
    this.campfireIgniteSec[p] = 0;
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
        this.encounterEvents.push({
          a, b,
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
      u.isChief = false;
      u.path = [];
      u.harvestTarget = null;
      u.huntTarget = null;
      u.huntTimer = 0;
      u.huntWeapon = null;
      u.harvestTimer = 0;
      u.state = "idle";
      u.autoFollowing = false;
      u.autoFollowScanTimer = 0;
      this.pregnancyTimer.delete(u.id);
      moved++;
    }
  }

  consumeEncounterEvents(): EncounterEvent[] {
    const out = this.encounterEvents;
    this.encounterEvents = [];
    return out;
  }

  private clearPregnanciesFor(p: PlayerId): void {
    for (const [id, _] of this.pregnancyTimer) {
      const u = this.units.get(id);
      if (!u || u.owner === p) this.pregnancyTimer.delete(id);
    }
  }

  private growthCheck(dt: number): void {
    const tribeUnits: SimUnit[][] = Array.from(
      { length: MAX_PLAYERS },
      () => [],
    );
    for (const u of this.units.values()) tribeUnits[u.owner].push(u);

    for (let p = 0; p < MAX_PLAYERS; p++) {
      const list = tribeUnits[p];
      if (!this.active[p] || list.length === 0) continue;

      let males = 0;
      let cx = 0;
      let cy = 0;
      for (const u of list) {
        if (u.gender === "m") males++;
        cx += u.gx;
        cy += u.gy;
      }
      const canConceive = males >= 1 && list.length >= 2;
      const centerX = cx / list.length;
      const centerY = cy / list.length;

      let birthsRemaining = list.length < MAX_TRIBE_SIZE
        ? MAX_TRIBE_SIZE - list.length
        : 1;

      for (const u of list) {
        if (u.gender !== "f") continue;
        const frac = u.hpMax > 0 ? u.hp / u.hpMax : 0;
        if (!canConceive || frac < PREGNANCY_HEALTH_MIN_FRAC) {
          this.pregnancyTimer.delete(u.id);
          continue;
        }
        const t = (this.pregnancyTimer.get(u.id) ?? 0) + dt;
        if (t < GROWTH_REQUIRED_SEC || birthsRemaining <= 0) {
          this.pregnancyTimer.set(u.id, Math.min(t, GROWTH_REQUIRED_SEC));
          continue;
        }
        if (list.length < MAX_TRIBE_SIZE) {
          this.pregnancyTimer.delete(u.id);
          this.spawnNewTribeMember(p, centerX, centerY);
          birthsRemaining--;
        } else {
          const split = this.splitOffNewTribe(p, list, u, centerX, centerY);
          if (split) {
            this.pregnancyTimer.delete(u.id);
            this.spawnNewTribeMember(p, centerX, centerY);
            birthsRemaining = 0;
          } else {
            this.pregnancyTimer.set(u.id, GROWTH_REQUIRED_SEC);
          }
        }
      }
    }

    for (const [id, _] of this.pregnancyTimer) {
      if (!this.units.has(id)) this.pregnancyTimer.delete(id);
    }
  }

  private splitOffNewTribe(
    parent: PlayerId,
    parentList: SimUnit[],
    mother: SimUnit,
    ax: number,
    ay: number,
  ): boolean {
    let target: PlayerId = -1;
    for (let q = 0; q < MAX_PLAYERS; q++) {
      if (!this.active[q]) {
        target = q;
        break;
      }
    }
    if (target < 0) return false;

    const candidates = parentList.filter((u) => u !== mother);
    const males = candidates
      .filter((u) => u.gender === "m")
      .sort((a, b) => b.ageSec - a.ageSec);
    const females = candidates
      .filter((u) => u.gender === "f")
      .sort((a, b) => b.ageSec - a.ageSec);

    const founders: SimUnit[] = [];
    for (let i = 0; i < males.length; i += 2) founders.push(males[i]);
    for (let i = 0; i < females.length; i += 2) founders.push(females[i]);

    if (founders.length < 2) return false;
    if (candidates.length - founders.length < 1) return false;

    this.active[target] = true;
    this.tribeLanguage[target] = this.tribeLanguage[parent];
    this.followChiefEnabled[target] = this.followChiefEnabled[parent];
    this.resources[target] = emptyResources();
    this.campfireIgniteSec[target] = 0;
    this.spawns[target] = { cx: Math.floor(ax), cy: Math.floor(ay) };

    const newColor = PLAYER_COLORS[target % PLAYER_COLORS.length];
    for (const u of founders) {
      u.owner = target;
      u.color = newColor;
      u.isChief = false;
      u.path = [];
      u.harvestTarget = null;
      u.huntTarget = null;
      u.huntTimer = 0;
      u.huntWeapon = null;
      u.harvestTimer = 0;
      u.state = "idle";
      u.autoFollowing = false;
      u.autoFollowScanTimer = 0;
      this.pregnancyTimer.delete(u.id);
    }
    this.updateChiefs();

    const lo = Math.min(parent, target);
    const hi = Math.max(parent, target);
    this.lastEncounterTick.set(`${lo}_${hi}`, this.tick);

    const angle =
      rand01(this.seed ^ 0xc0ffee, target, this.tick) * Math.PI * 2;
    const dist = 14;
    for (let attempt = 0; attempt < 8; attempt++) {
      const r = dist + attempt * 2;
      const ti = Math.floor(ax + Math.cos(angle) * r);
      const tj = Math.floor(ay + Math.sin(angle) * r);
      if (!this.isWalkable(ti, tj)) continue;
      const ids = founders.map((u) => u.id);
      this.cmdMove(target, ids, ti, tj);
      break;
    }

    this.tribeSplits.push({ from: parent, to: target });
    return true;
  }

  growthSnapshot(): { progress: number[]; active: boolean[] } {
    const progress: number[] = new Array(MAX_PLAYERS).fill(0);
    const active: boolean[] = new Array(MAX_PLAYERS).fill(false);
    for (const [id, t] of this.pregnancyTimer) {
      const u = this.units.get(id);
      if (!u) continue;
      const frac = Math.min(1, t / GROWTH_REQUIRED_SEC);
      if (frac > progress[u.owner]) progress[u.owner] = frac;
      active[u.owner] = true;
    }
    for (let p = 0; p < MAX_PLAYERS; p++) {
      if (!this.active[p]) {
        progress[p] = 0;
        active[p] = false;
      }
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
    const usedNames = this.collectTribeNames(p);
    const firstName = pickFirstName(this.seed, lang, gender, p, k, usedNames);
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
      huntWeapon: null,
      huntFacing: 1,
      harvestTimer: 0,
      lastFootprintTile: { i: spot.i, j: spot.j },
      hp: UNIT_HP_MAX,
      hpMax: UNIT_HP_MAX,
      eatCooldown: 0,
      autoHuntScanTimer: 0,
      ageSec: 0,
      gender,
      firstName,
      isChief: false,
      idleSec: 0,
      autoFollowing: false,
      autoFollowScanTimer: 0,
    };
    this.units.set(u.id, u);
    this.newUnits.push(this.snap(u));
  }

  private collectTribeNames(p: PlayerId): Set<string> {
    const names = new Set<string>();
    for (const u of this.units.values()) {
      if (u.owner === p) names.add(u.firstName);
    }
    return names;
  }

  private updateChiefs(): void {
    const byOwner: SimUnit[][] = Array.from(
      { length: MAX_PLAYERS },
      () => [],
    );
    for (const u of this.units.values()) byOwner[u.owner].push(u);
    for (let p = 0; p < MAX_PLAYERS; p++) {
      const list = byOwner[p];
      let chief: SimUnit | null = null;
      for (const u of list) {
        if (!u.isChief) continue;
        if (chief == null) chief = u;
        else u.isChief = false;
      }
      if (!chief && list.length > 0) {
        let best: SimUnit | null = null;
        for (const u of list) {
          if (!best) { best = u; continue; }
          const bestMale = best.gender === "m";
          const uMale = u.gender === "m";
          if (uMale && !bestMale) best = u;
          else if (uMale === bestMale && u.ageSec > best.ageSec) best = u;
        }
        if (best) best.isChief = true;
      }
    }
  }

  private reapDeadUnits(): void {
    const before: number[] = new Array(MAX_PLAYERS).fill(0);
    for (const u of this.units.values()) before[u.owner]++;
    for (const u of this.units.values()) {
      if (u.hp <= 0) {
        this.deadUnitIds.push(u.id);
        this.units.delete(u.id);
      }
    }
    const after: number[] = new Array(MAX_PLAYERS).fill(0);
    for (const u of this.units.values()) after[u.owner]++;
    for (let p = 0; p < MAX_PLAYERS; p++) {
      if (this.active[p] && before[p] > 0 && after[p] === 0) {
        this.extinctTribes.push(p);
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

  private cohereTribes(): void {
    const byOwner: SimUnit[][] = Array.from(
      { length: MAX_PLAYERS },
      () => [] as SimUnit[],
    );
    for (const u of this.units.values()) byOwner[u.owner].push(u);
    for (let p = 0; p < MAX_PLAYERS; p++) {
      const list = byOwner[p];
      if (list.length < 2) continue;
      let cx = 0, cy = 0;
      for (const u of list) { cx += u.gx; cy += u.gy; }
      cx /= list.length;
      cy /= list.length;
      const r2 = TRIBE_COHESION_RADIUS * TRIBE_COHESION_RADIUS;
      const claimed = new Set<string>();
      for (const u of list) {
        if (u.path.length > 0) continue;
        if (u.harvestTarget || u.huntTarget) continue;
        if (u.state !== "idle") continue;
        if (u.idleSec < TRIBE_COHESION_IDLE_SEC) continue;
        const dx = u.gx - cx;
        const dy = u.gy - cy;
        if (dx * dx + dy * dy <= r2) continue;
        const ti = Math.floor(cx);
        const tj = Math.floor(cy);
        const blocked = this.blockedTilesFor(u, claimed);
        let target: { i: number; j: number } | null = null;
        if (this.isWalkable(ti, tj) && !blocked.has(`${ti},${tj}`)) {
          target = { i: ti, j: tj };
        } else {
          target = this.findFreeTileNear(ti, tj, blocked);
        }
        if (!target) continue;
        this.startMove(u, target.i, target.j, blocked);
        u.idleSec = 0;
        const last = u.path[u.path.length - 1];
        if (last) claimed.add(`${Math.floor(last.gx)},${Math.floor(last.gy)}`);
      }
    }
  }

  private followChief(dt: number): void {
    const chiefByOwner: Array<SimUnit | null> = new Array(MAX_PLAYERS).fill(null);
    for (const u of this.units.values()) {
      if (u.isChief) chiefByOwner[u.owner] = u;
    }
    const claimed = new Set<string>();
    for (const u of this.units.values()) {
      if (u.isChief) continue;
      if (!this.active[u.owner]) continue;
      if (!this.followChiefEnabled[u.owner]) continue;
      if (u.huntTarget) continue;
      if (u.harvestTarget) continue;

      u.autoFollowScanTimer -= dt;

      const c = chiefByOwner[u.owner];

      if (u.path.length > 0) {
        if (!u.autoFollowing) continue;
        if (u.autoFollowScanTimer > 0) continue;
        u.autoFollowScanTimer = FOLLOW_CHIEF_SCAN_INTERVAL;
        if (c) this.tryAutoForage(u, c);
        continue;
      }

      if (!c) continue;

      if (this.tryAutoForage(u, c)) {
        u.autoFollowing = true;
        const last = u.path[u.path.length - 1];
        if (last) claimed.add(`${Math.floor(last.gx)},${Math.floor(last.gy)}`);
        continue;
      }

      const dx = c.gx - u.gx;
      const dy = c.gy - u.gy;
      if (dx * dx + dy * dy <= FOLLOW_CHIEF_NEAR * FOLLOW_CHIEF_NEAR) continue;

      const ci = Math.floor(c.gx);
      const cj = Math.floor(c.gy);
      const blocked = this.blockedTilesFor(u, claimed);
      let target: { i: number; j: number } | null = null;
      if (this.isWalkable(ci, cj) && !blocked.has(`${ci},${cj}`)) {
        target = { i: ci, j: cj };
      } else {
        target = this.findFreeTileNear(ci, cj, blocked);
      }
      if (!target) continue;
      this.startMove(u, target.i, target.j, blocked);
      if (u.path.length > 0) {
        u.autoFollowing = true;
        u.autoFollowScanTimer = FOLLOW_CHIEF_SCAN_INTERVAL;
        const last = u.path[u.path.length - 1];
        if (last) claimed.add(`${Math.floor(last.gx)},${Math.floor(last.gy)}`);
      }
    }
  }

  private tryAutoForage(u: SimUnit, chief: SimUnit): boolean {
    const seed = this.seed;
    const ti0 = Math.floor(u.gx);
    const tj0 = Math.floor(u.gy);
    const R = FOLLOW_CHIEF_SIGHT;
    const R2 = R * R;
    const cR2 = AUTO_FORAGE_CHIEF_RADIUS * AUTO_FORAGE_CHIEF_RADIUS;
    let best: { kind: ObjectKind; i: number; j: number; d2: number } | null = null;
    for (let dj = -R; dj <= R; dj++) {
      for (let di = -R; di <= R; di++) {
        const d2 = di * di + dj * dj;
        if (d2 > R2) continue;
        const i = ti0 + di;
        const j = tj0 + dj;
        const cdx = i + 0.5 - chief.gx;
        const cdy = j + 0.5 - chief.gy;
        if (cdx * cdx + cdy * cdy > cR2) continue;
        let kind: ObjectKind | null = null;
        if (
          hasMushroomAt(seed, i, j) &&
          !this.removedKeys.has(objKey("mushroom", i, j))
        ) {
          kind = "mushroom";
        } else if (
          hasBushAt(seed, i, j) &&
          !this.removedKeys.has(objKey("bush", i, j))
        ) {
          kind = "bush";
        } else if (
          hasStoneAt(seed, i, j) &&
          !this.removedKeys.has(objKey("stone", i, j))
        ) {
          kind = "stone";
        }
        if (!kind) continue;
        if (!best || d2 < best.d2) best = { kind, i, j, d2 };
      }
    }
    if (!best) return false;
    const blocked = this.blockedTilesFor(u, new Set());
    this.startHarvest(u, best.kind, best.i, best.j, blocked);
    return u.harvestTarget !== null;
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
