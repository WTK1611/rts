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
  CATASTROPHE_DAILY_CHANCE,
  CatastropheEvent,
  CatastropheKind,
  CatastropheSeverity,
  DROP_PILE_LIFETIME_SEC,
  DROP_PILE_PICKUP_DELAY_SEC,
  DROP_PILE_PICKUP_RADIUS,
  DropPileSnapshot,
  CampfireSnapshot,
  DAY_LENGTH_SEC,
  DayPhase,
  EncounterEvent,
  phaseAt,
  phaseLengthsAt,
  TileOverride,
  TileOverrideEvent,
  Season,
  seasonAt,
  seasonAllowsBush,
  seasonAllowsKreuter,
  seasonAllowsMushroom,
  seasonAnimalSpawnMultiplier,
  seasonFishCatchMultiplier,
  seasonKreuterYieldMultiplier,
  seasonMushroomYieldMultiplier,
  seasonRegrowMultiplier,
  seasonWaterMultiplier,
  emptyResources,
  FishKind,
  FishSnapshot,
  Footprint,
  FOOTPRINT_LIFETIME_TICKS,
  HuntWeapon,
  isFullMoonNight,
  MAX_PLAYERS,
  MAX_TRIBE_SIZE,
  ObjectKind,
  PlayerId,
  RemovedObject,
  resourceCap,
  ResourceFlowEvent,
  DamageEvent,
  Resources,
  RESOURCE_KEYS,
  TICK_RATE,
  TreeGrowthEvent,
  TreeGrowthStage,
  TribeSplit,
  UnitGender,
  UnitSnapshot,
} from "../shared/protocol";
import { NameLanguage, languageForSlot, pickFirstName } from "../shared/names";
import { AnimalSpec, animalSpec, ALL_ANIMAL_KINDS, kindHash } from "./animals";
import { BAL, D } from "./balancing";
import { craftBetterWeapon, payWeaponCost } from "./weapons";
import { SPATIAL_CELL, gridKey, pushBucket, updateBucketForId } from "./spatial";
import { objKey } from "../shared/objectKey";
import {
  artifactsFromSeed,
  Biome,
  biomeAt,
  bushBerriesAt,
  cactusYieldAt,
  hasBushAt,
  hasCactusAt,
  hasFishAt,
  hasSharkAt,
  hasWhaleAt,
  hasKreuterAt,
  hasMushroomAt,
  hasStoneAt,
  hasTreeAt,
  isLandTile,
  kreuterAmountAt,
  mushroomBerriesAt,
  rand01,
  spawnsFromSeed,
  SpawnArea,
  stoneAmountAt,
  treeWoodAt,
  VOLCANO_CELL,
  volcanoForCell,
} from "../shared/worldgen";

const STARTING_GENDERS: UnitGender[] = ["m", "f", "m", "f"];
const TRIBE_SIZE = STARTING_GENDERS.length;

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
  huntAuto: boolean;
  weapon: HuntWeapon;
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
  // Unit wears its own pelt (Fell). Starting tribe spawns equipped; new
  // births consume 1 felle from the player's pool when available.
  hasFell: boolean;
  idleSec: number;
  autoFollowing: boolean;
  autoFollowScanTimer: number;
  // When true, the unit follows an explicit player command and is exempt
  // from the campfire auto-gather pull until the path completes.
  manualOrder: boolean;
}


export interface SimCampfire {
  id: string;
  owner: PlayerId;
  gx: number;
  gy: number;
  fuelTimer: number;
  // Fuel duration assigned at the last ignite/refuel — depends on the
  // seasonal night length at that moment. Used as the divisor for the
  // 0..1 fuel ratio so summer/winter night-length scaling stays correct.
  fuelMax: number;
  size: number;
  hasTent: boolean;
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

export interface SimFish {
  id: string;
  kind: FishKind;
  gx: number;
  gy: number;
  homeI: number;
  homeJ: number;
  vx: number;
  vy: number;
  turnTimer: number;
  ageSec: number;
  breedTimer: number;
}

interface SimDropPile {
  id: string;
  gx: number;
  gy: number;
  resources: Resources;
  decaySec: number;
  pickupDelaySec: number;
}

interface ActiveCatastrophe {
  kind: CatastropheKind;
  cx: number;
  cy: number;
  radius: number;
  severity: CatastropheSeverity;
  startTick: number;
  endTick: number;
  // Per-kind state
  // wildfire: tile keys currently burning, BFS frontier
  burning?: Map<string, number>; // tileKey -> burn-out tick
  frontier?: string[];
  // storm: drift velocity in tiles/sec
  vx?: number;
  vy?: number;
  // locusts: per-tick eat target
  // meteor: not used here (handled via pendingMeteors)
  // landslide: traveling tile column
  pathTiles?: Array<{ i: number; j: number }>;
  pathIdx?: number;
}

interface PendingMeteor {
  cx: number;
  cy: number;
  radius: number;
  severity: CatastropheSeverity;
  impactTick: number;
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
  treeRegrow: Map<string, { i: number; j: number; stage: number; nextStageTick: number }> = new Map();
  treeGrowthEvents: TreeGrowthEvent[] = [];
  footprints: Footprint[] = [];
  newFootprints: Footprint[] = [];
  animals: Map<string, SimAnimal> = new Map();
  removedAnimalIds: string[] = [];
  nextAnimalIdx = 0;
  animalKindCap: Map<AnimalKind, number> = new Map();
  animalKindFloor: Map<AnimalKind, number> = new Map();
  animalRespawnTimer = 0;
  animalReproTimer = 0;
  deadUnitIds: string[] = [];
  extinctTribes: PlayerId[] = [];
  respawnedTribes: PlayerId[] = [];
  newUnits: UnitSnapshot[] = [];
  pregnancyTimer: Map<string, number> = new Map();
  nextUnitIdx: number[] = new Array(MAX_PLAYERS).fill(TRIBE_SIZE);
  tribeLanguage: NameLanguage[] = new Array(MAX_PLAYERS).fill("de");
  tribeOrigin: PlayerId[] = Array.from({ length: MAX_PLAYERS }, (_, i) => i);
  lastEncounterTick: Map<string, number> = new Map();
  encounterEvents: EncounterEvent[] = [];
  campfires: Map<string, SimCampfire> = new Map();
  volcanoes: Array<{ gx: number; gy: number }> = [];
  removedCampfireIds: string[] = [];
  followChiefEnabled: boolean[] = new Array(MAX_PLAYERS).fill(false);
  artifacts: Map<string, SimArtifact> = new Map();
  artifactFinds: ArtifactFindEvent[] = [];
  tribeSplits: TribeSplit[] = [];
  resourceFlows: ResourceFlowEvent[] = [];
  waterDebt: number[] = new Array(MAX_PLAYERS).fill(0);
  damageEvents: DamageEvent[] = [];
  fishes: Map<string, SimFish> = new Map();
  removedFishIds: string[] = [];
  nextFishIdx = 0;
  dropPiles: Map<string, SimDropPile> = new Map();
  newDropPiles: SimDropPile[] = [];
  removedDropPileIds: string[] = [];
  private nextDropPileIdx = 0;
  fishCap = 0;
  fishBreedScanTimer = 0;
  tick = 0;
  gameTimeSec = 30;
  private lastPhase: DayPhase = "morning";
  private isWinterSeason = false;

  private animalGrid: Map<number, SimAnimal[]> = new Map();
  private predatorGrid: Map<number, SimAnimal[]> = new Map();
  private preyGrid: Map<number, SimAnimal[]> = new Map();
  private unitGrid: Map<number, SimUnit[]> = new Map();
  private fishGrid: Map<number, SimFish[]> = new Map();
  private activeAnimalIds = new Set<string>();

  // Catastrophes
  private catastropheEvents: CatastropheEvent[] = [];
  private tileOverrideEvents: TileOverrideEvent[] = [];
  private tileOverrides: Map<string, { kind: TileOverride; expiresTick: number }> = new Map();
  private activeCatastrophes: ActiveCatastrophe[] = [];
  private pendingMeteors: PendingMeteor[] = [];
  private lastCatastropheDayIdx = -1;
  private droughtMult = 1;
  private freezeMult = 1;
  private rngCounter = 0;

  // Per-tick caches. Rebuilt at the start of each step() and refreshed
  // after mutations that change ownership or chief state. Used by hot
  // helpers that previously iterated the full unit map.
  private byOwnerCache: SimUnit[][] = Array.from(
    { length: MAX_PLAYERS },
    () => [],
  );
  private chiefByOwnerCache: Array<SimUnit | null> = new Array(
    MAX_PLAYERS,
  ).fill(null);

  constructor(seed: number) {
    this.seed = seed;
    this.spawns = spawnsFromSeed(seed);
    this.isWinterSeason = seasonAt(this.gameTimeSec) === "winter";
    this.spawnAnimals();
    this.spawnFishes();
    this.spawnArtifacts();
    this.scanVolcanoes();
    this.rebuildSpatialIndex();
  }

  private scanVolcanoes(): void {
    const r = BAL.animalSpawnRadius;
    const cR = Math.ceil(r / VOLCANO_CELL) + 1;
    for (let cj = -cR; cj <= cR; cj++) {
      for (let ci = -cR; ci <= cR; ci++) {
        const v = volcanoForCell(this.seed, ci, cj);
        if (!v) continue;
        if (Math.abs(v.i) > r || Math.abs(v.j) > r) continue;
        this.volcanoes.push({ gx: v.i + 0.5, gy: v.j + 0.5 });
      }
    }
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
        this.gainResource(p, "fleisch", 50, gx, gy);
      }
      return;
    }
    this.gainResource(p, reward.kind, reward.amount, gx, gy);
  }

  private spawnAnimals(): void {
    const r = BAL.animalSpawnRadius;
    const kinds = [...ALL_ANIMAL_KINDS];
    const counts: Map<AnimalKind, number> = new Map();
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const b = biomeAt(this.seed, i, j);
        const isWater = b === "lake" || b === "river";
        const isLand = isLandTile(this.seed, i, j);
        if (!isWater && !isLand) continue;
        for (const kind of kinds) {
          const spec = animalSpec(kind);
          if (spec.aquatic ? !isWater : !isLand) continue;
          if (!spec.biomes.includes(b)) continue;
          const r01 = rand01(this.seed ^ kindHash(kind), i, j);
          if (r01 > spec.density) continue;
          if (kind === "wolf") {
            const packed = this.spawnWolfPackAround(i, j);
            counts.set(kind, (counts.get(kind) ?? 0) + packed);
          } else {
            const ageR = rand01(this.seed ^ 0xa9e, i, j);
            const ageSec =
              spec.matureAgeSec + ageR * (spec.maxAgeSec - spec.matureAgeSec) * 0.6;
            const breedR = rand01(this.seed ^ 0xb29, i, j);
            const id = `a_${kind[0]}${this.nextAnimalIdx++}`;
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
          }
          break;
        }
      }
    }
    for (const [kind, c] of counts) {
      this.animalKindCap.set(kind, Math.max(20, Math.ceil(c * BAL.animalKindCapFactor)));
      this.animalKindFloor.set(kind, c);
    }
  }

  // Setzt 3–5 Wölfe rund um (ci,cj). Liefert die Anzahl tatsächlich
  // platzierter Wölfe (≥1, der Mittel-Tile ist immer gültig, weil der
  // Aufrufer ihn bereits validiert hat).
  private spawnWolfPackAround(ci: number, cj: number): number {
    const spec = animalSpec("wolf");
    const packRoll = rand01(this.seed ^ 0xc101, ci, cj);
    const packSize = 3 + Math.floor(packRoll * 3); // 3..5
    let placed = 0;
    const tried = new Set<string>();
    const tryPlace = (i: number, j: number): boolean => {
      const key = `${i},${j}`;
      if (tried.has(key)) return false;
      tried.add(key);
      const b = biomeAt(this.seed, i, j);
      if (!spec.biomes.includes(b)) return false;
      if (!isLandTile(this.seed, i, j)) return false;
      if (!this.animalWalkable(spec, i, j)) return false;
      const ageR = rand01(this.seed ^ 0xc102, i, j);
      const ageSec =
        spec.matureAgeSec + ageR * (spec.maxAgeSec - spec.matureAgeSec) * 0.6;
      const breedR = rand01(this.seed ^ 0xc103, i, j);
      const id = `a_w${this.nextAnimalIdx++}`;
      this.animals.set(id, {
        id,
        kind: "wolf",
        hp: spec.hp,
        hpMax: spec.hp,
        gx: i + 0.5,
        gy: j + 0.5,
        homeI: ci,
        homeJ: cj,
        state: "idle",
        path: [],
        decisionTimer: rand01(this.seed ^ 0xc104, i, j) * 4,
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
      placed++;
      return true;
    };
    tryPlace(ci, cj);
    // Wachsende Ringspirale, bis Pack-Größe erreicht ist oder Versuche aus.
    for (let ring = 1; ring <= 4 && placed < packSize; ring++) {
      for (let dj = -ring; dj <= ring && placed < packSize; dj++) {
        for (let di = -ring; di <= ring && placed < packSize; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
          tryPlace(ci + di, cj + dj);
        }
      }
    }
    return placed;
  }

  animalsSnapshot(): AnimalSnapshot[] {
    const out: AnimalSnapshot[] = [];
    for (const a of this.animals.values()) out.push(this.animalSnap(a));
    return out;
  }

  animalSnapshotsForIds(ids: Set<string>): AnimalSnapshot[] {
    const out: AnimalSnapshot[] = [];
    for (const id of ids) {
      const a = this.animals.get(id);
      if (a && a.hp > 0) out.push(this.animalSnap(a));
    }
    return out;
  }

  consumeRemovedAnimalIds(): string[] {
    const out = this.removedAnimalIds;
    this.removedAnimalIds = [];
    return out;
  }

  private spawnFishes(): void {
    const r = BAL.animalSpawnRadius;
    let count = 0;
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        let kind: FishKind | null = null;
        if (hasFishAt(this.seed, i, j)) kind = "small";
        else if (hasWhaleAt(this.seed, i, j)) kind = "whale";
        else if (hasSharkAt(this.seed, i, j)) kind = "shark";
        if (!kind) continue;
        const id = `f${this.nextFishIdx++}`;
        const ang = rand01(this.seed ^ 0xf15a, i, j) * Math.PI * 2;
        const ageR = rand01(this.seed ^ 0xf15c, i, j);
        const speedMult = kind === "whale" ? 0.4 : kind === "shark" ? 0.75 : 1;
        this.fishes.set(id, {
          id,
          kind,
          gx: i + 0.5,
          gy: j + 0.5,
          homeI: i,
          homeJ: j,
          vx: Math.cos(ang) * BAL.fishSpeed * speedMult,
          vy: Math.sin(ang) * BAL.fishSpeed * speedMult,
          turnTimer: rand01(this.seed ^ 0xf15b, i, j) *
            (BAL.fishTurnIntervalMax - BAL.fishTurnIntervalMin) +
            BAL.fishTurnIntervalMin,
          ageSec: BAL.fishMatureAgeSec + ageR * 30,
          breedTimer: -BAL.fishBreedIntervalSec * ageR,
        });
        if (kind === "small") count++;
      }
    }
    this.fishCap = Math.max(80, Math.ceil(count * BAL.fishDensityCapFactor));
  }

  fishesSnapshot(): FishSnapshot[] {
    const out: FishSnapshot[] = [];
    for (const f of this.fishes.values()) {
      out.push({ id: f.id, gx: f.gx, gy: f.gy, kind: f.kind });
    }
    return out;
  }

  fishSnapshotsForIds(ids: Set<string>): FishSnapshot[] {
    const out: FishSnapshot[] = [];
    for (const id of ids) {
      const f = this.fishes.get(id);
      if (f) out.push({ id: f.id, gx: f.gx, gy: f.gy, kind: f.kind });
    }
    return out;
  }

  consumeRemovedFishIds(): string[] {
    const out = this.removedFishIds;
    this.removedFishIds = [];
    return out;
  }

  private isWaterTileAt(i: number, j: number): boolean {
    const b = biomeAt(this.seed, i, j);
    return b === "lake" || b === "river";
  }

  private fishWalkable(gx: number, gy: number): boolean {
    return this.isWaterTileAt(Math.floor(gx), Math.floor(gy));
  }

  private pickFishHeading(f: SimFish): void {
    const ti = Math.floor(f.gx);
    const tj = Math.floor(f.gy);
    let ang = Math.random() * Math.PI * 2;
    if (f.kind === "small" && Math.random() < BAL.fishShoreBias) {
      const dirs: Array<[number, number]> = [];
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          if (this.isWaterTileAt(ti + di, tj + dj)) continue;
          dirs.push([di, dj]);
        }
      }
      if (dirs.length > 0) {
        const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
        ang = Math.atan2(dy, dx);
      }
    }
    const speedMult = f.kind === "whale" ? 0.4 : f.kind === "shark" ? 0.75 : 1;
    f.vx = Math.cos(ang) * BAL.fishSpeed * speedMult;
    f.vy = Math.sin(ang) * BAL.fishSpeed * speedMult;
    f.turnTimer = BAL.fishTurnIntervalMin +
      Math.random() * (BAL.fishTurnIntervalMax - BAL.fishTurnIntervalMin);
  }

  private stepFishes(dt: number): void {
    for (const f of this.fishes.values()) {
      f.ageSec += dt;
      f.turnTimer -= dt;
      if (f.turnTimer <= 0) this.pickFishHeading(f);

      const homeDx = (f.homeI + 0.5) - f.gx;
      const homeDy = (f.homeJ + 0.5) - f.gy;
      const homeDist = Math.hypot(homeDx, homeDy);
      const homeRadius = f.kind === "whale" ? BAL.fishHomeRadius * 1.5 : BAL.fishHomeRadius;
      if (homeDist > homeRadius) {
        const speedMult = f.kind === "whale" ? 0.4 : f.kind === "shark" ? 0.75 : 1;
        f.vx = (homeDx / homeDist) * BAL.fishSpeed * speedMult;
        f.vy = (homeDy / homeDist) * BAL.fishSpeed * speedMult;
      }

      const nx = f.gx + f.vx * dt;
      const ny = f.gy + f.vy * dt;
      const xOk = this.fishWalkable(nx, f.gy);
      const yOk = this.fishWalkable(f.gx, ny);
      if (xOk) f.gx = nx;
      else f.vx = -f.vx;
      if (yOk) f.gy = ny;
      else f.vy = -f.vy;
      if (!xOk && !yOk) {
        f.gx = f.homeI + 0.5;
        f.gy = f.homeJ + 0.5;
      }
    }

    this.fishBreedScanTimer -= dt;
    if (this.fishBreedScanTimer > 0) return;
    const stepDt = BAL.fishBreedScanIntervalSec;
    this.fishBreedScanTimer = stepDt;

    const newborns: SimFish[] = [];
    if (this.fishes.size < this.fishCap) {
      const cellSize = 2;
      const buckets: Map<string, SimFish[]> = new Map();
      for (const f of this.fishes.values()) {
        if (f.kind !== "small") continue;
        if (f.ageSec < BAL.fishMatureAgeSec) continue;
        const ci = Math.floor(f.gx / cellSize);
        const cj = Math.floor(f.gy / cellSize);
        const key = `${ci}|${cj}`;
        const arr = buckets.get(key);
        if (arr) arr.push(f);
        else buckets.set(key, [f]);
      }

      for (const f of this.fishes.values()) {
        if (f.kind !== "small") continue;
        if (f.ageSec < BAL.fishMatureAgeSec) continue;
        const ci = Math.floor(f.gx / cellSize);
        const cj = Math.floor(f.gy / cellSize);
        let mate: SimFish | null = null;
        outer: for (let dj = -1; dj <= 1 && !mate; dj++) {
          for (let di = -1; di <= 1; di++) {
            const arr = buckets.get(`${ci + di}|${cj + dj}`);
            if (!arr) continue;
            for (const g of arr) {
              if (g === f) continue;
              if (g.id <= f.id) continue;
              const dx = g.gx - f.gx;
              const dy = g.gy - f.gy;
              if (dx * dx + dy * dy < D.fishBreedRangeSq) {
                mate = g;
                break outer;
              }
            }
          }
        }
        if (mate) {
          f.breedTimer += stepDt;
          if (f.breedTimer >= BAL.fishBreedIntervalSec) {
            f.breedTimer = -BAL.fishBreedIntervalSec * 0.6;
            const ti = Math.floor(f.gx);
            const tj = Math.floor(f.gy);
            if (this.isWaterTileAt(ti, tj)) {
              const id = `f${this.nextFishIdx++}`;
              const ang = Math.random() * Math.PI * 2;
              newborns.push({
                id,
                kind: "small",
                gx: f.gx,
                gy: f.gy,
                homeI: ti,
                homeJ: tj,
                vx: Math.cos(ang) * BAL.fishSpeed,
                vy: Math.sin(ang) * BAL.fishSpeed,
                turnTimer: BAL.fishTurnIntervalMin,
                ageSec: 0,
                breedTimer: -BAL.fishBreedIntervalSec,
              });
              if (this.fishes.size + newborns.length >= this.fishCap) break;
            }
          }
        } else if (f.breedTimer > 0) {
          f.breedTimer = Math.max(0, f.breedTimer - stepDt * 0.5);
        }
      }
    }
    for (const n of newborns) this.fishes.set(n.id, n);
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

  consumeDamageEvents(): DamageEvent[] {
    const out = this.damageEvents;
    this.damageEvents = [];
    return out;
  }

  private pushDamage(amount: number, gx: number, gy: number): void {
    if (amount <= 0) return;
    this.damageEvents.push({ amount, gx, gy });
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

  private tribeSizeOf(p: PlayerId): number {
    let n = 0;
    for (const u of this.units.values()) if (u.owner === p) n++;
    return n;
  }

  private resourceRoom(p: PlayerId, key: keyof Resources): number {
    const cap = resourceCap(key, this.tribeSizeOf(p));
    const have = this.resources[p][key];
    return Math.max(0, cap - have);
  }

  private gainResource(
    owner: PlayerId,
    key: keyof Resources,
    amount: number,
    gx: number,
    gy: number,
    pushFlow = true,
  ): number {
    if (amount <= 0) return 0;
    const room = this.resourceRoom(owner, key);
    const actual = Math.min(amount, room);
    if (actual <= 0) return 0;
    this.resources[owner][key] += actual;
    if (pushFlow) this.pushFlow(owner, key, actual, gx, gy);
    return actual;
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
        fuel: Math.max(0, Math.min(1, f.fuelTimer / Math.max(0.001, f.fuelMax))),
        size: f.size,
        hasTent: f.hasTent,
      });
    }
    return out;
  }

  isNight(): boolean {
    return this.lastPhase === "night";
  }

  // Burn duration per wood unit at the *current* seasonal night length.
  // Honors the configured "X Holz pro Nacht" across summer/winter scaling.
  private campfireBurnPerFuelSec(): number {
    const night = phaseLengthsAt(this.gameTimeSec).night;
    return night / Math.max(1, BAL.nightCampfireHolzPerNight);
  }

  winnerOrigin(): PlayerId | null {
    const counts = new Array(MAX_PLAYERS).fill(0);
    for (const u of this.units.values()) {
      if (u.hp > 0) counts[u.owner]++;
    }
    let activeCount = 0;
    let sharedOrigin: PlayerId | null = null;
    for (let p = 0; p < MAX_PLAYERS; p++) {
      if (!this.active[p]) continue;
      if (counts[p] === 0) continue;
      activeCount++;
      const o = this.tribeOrigin[p];
      if (sharedOrigin === null) sharedOrigin = o;
      else if (sharedOrigin !== o) return null;
    }
    if (activeCount < 2) return null;
    return sharedOrigin;
  }

  // Bei Vollmond werden Wölfe deutlich angriffslustiger: weitere Sicht,
  // mehr Schaden und längere Aggrowellen. Effekt addiert sich auf den
  // bestehenden Nacht-Räuber-Bonus.
  private wolfMoonBoost(kind: AnimalKind): number {
    if (kind !== "wolf") return 1;
    return isFullMoonNight(this.gameTimeSec) ? 1.5 : 1;
  }

  private animalDetectRange(spec: AnimalSpec, kind?: AnimalKind): number {
    let r = spec.detectRange;
    if (this.isNight() && (spec.aggressive || spec.predator)) {
      r *= BAL.nightPredatorDetectMult;
    }
    if (kind) r *= this.wolfMoonBoost(kind);
    return r;
  }

  private animalDamage(spec: AnimalSpec, kind?: AnimalKind): number {
    let d = spec.damage;
    if (this.isNight() && (spec.aggressive || spec.predator)) {
      d *= BAL.nightPredatorDamageMult;
    }
    if (kind) d *= this.wolfMoonBoost(kind);
    return Math.ceil(d);
  }

  private animalAggroDurationTicks(spec: AnimalSpec, kind?: AnimalKind): number {
    let base = spec.aggroDurationSec;
    if (this.isNight() && (spec.aggressive || spec.predator)) {
      base *= BAL.nightPredatorAggroDurationMult;
    }
    if (kind) base *= this.wolfMoonBoost(kind);
    return Math.floor(base * TICK_RATE);
  }

  private animalSnap = (a: SimAnimal): AnimalSnapshot => {
    const spec = animalSpec(a.kind);
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
      if (this.isSick(u)) continue;
      u.autoFollowing = false;
      u.manualOrder = true;
      const blocked = this.blockedTilesFor(u, claimed);
      this.startHunt(u, a, blocked, false);
      const last = u.path[u.path.length - 1];
      if (last) claimed.add(`${Math.floor(last.gx)},${Math.floor(last.gy)}`);
      else claimed.add(`${Math.floor(u.gx)},${Math.floor(u.gy)}`);
    }
  }

  private startHunt(
    u: SimUnit,
    a: SimAnimal,
    blocked: Set<string>,
    auto: boolean,
  ): void {
    const bestPath = this.findHuntApproach(u, a, blocked);
    if (!bestPath) return;
    u.path =
      bestPath.length > 1
        ? bestPath.slice(1).map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }))
        : [];
    u.huntTarget = a.id;
    u.huntAuto = auto;
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
    const aquaticTarget = animalSpec(a.kind).aquatic;
    const walkable = (x: number, y: number) =>
      aquaticTarget ? this.unitHuntWalkable(x, y) : this.isWalkable(x, y);
    const adj: Array<[number, number]> = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    const ring1: Array<{ i: number; j: number }> = [];
    if (walkable(ti, tj)) ring1.push({ i: ti, j: tj });
    for (const [di, dj] of adj) {
      const ni = ti + di;
      const nj = tj + dj;
      if (walkable(ni, nj)) ring1.push({ i: ni, j: nj });
    }
    const ring2: Array<{ i: number; j: number }> = [];
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== 2) continue;
        const ni = ti + di;
        const nj = tj + dj;
        if (walkable(ni, nj)) ring2.push({ i: ni, j: nj });
      }
    }
    const tryRing = (
      ring: Array<{ i: number; j: number }>,
      blockSet: Set<string>,
    ): ReturnType<typeof findPath> => {
      let best: ReturnType<typeof findPath> = null;
      for (const c of ring) {
        if (blockSet.has(`${c.i},${c.j}`)) continue;
        const p = findPath(
          walkable,
          Math.floor(u.gx),
          Math.floor(u.gy),
          c.i,
          c.j,
          blockSet,
        );
        if (p && (!best || p.length < best.length)) best = p;
      }
      return best;
    };
    // Prefer an adjacent tile with the requested blocking; fall back to a
    // wider ring; finally ignore ally blocking so the unit can at least
    // approach when surrounded.
    return (
      tryRing(ring1, blocked) ??
      tryRing(ring2, blocked) ??
      tryRing(ring1, new Set()) ??
      tryRing(ring2, new Set())
    );
  }

  private rebuildOwnerCaches(): void {
    for (let p = 0; p < MAX_PLAYERS; p++) {
      const arr = this.byOwnerCache[p];
      if (arr.length > 0) arr.length = 0;
      this.chiefByOwnerCache[p] = null;
    }
    for (const u of this.units.values()) {
      this.byOwnerCache[u.owner].push(u);
      if (u.isChief) this.chiefByOwnerCache[u.owner] = u;
    }
  }

  private rebuildSpatialIndex(): void {
    this.animalGrid.clear();
    this.predatorGrid.clear();
    this.preyGrid.clear();
    this.unitGrid.clear();
    this.fishGrid.clear();
    const cs = SPATIAL_CELL;
    for (const a of this.animals.values()) {
      if (a.hp <= 0) continue;
      const k = gridKey(Math.floor(a.gx / cs), Math.floor(a.gy / cs));
      pushBucket(this.animalGrid, k, a);
      const spec = animalSpec(a.kind);
      if (spec.predator) pushBucket(this.predatorGrid, k, a);
      else if (!spec.aggressive) pushBucket(this.preyGrid, k, a);
    }
    for (const u of this.units.values()) {
      if (u.hp <= 0) continue;
      const k = gridKey(Math.floor(u.gx / cs), Math.floor(u.gy / cs));
      pushBucket(this.unitGrid, k, u);
    }
    for (const f of this.fishes.values()) {
      const k = gridKey(Math.floor(f.gx / cs), Math.floor(f.gy / cs));
      pushBucket(this.fishGrid, k, f);
    }
  }

  private rebuildActiveAnimalSet(): void {
    this.activeAnimalIds.clear();
    const radius = BAL.animalFullStepRadius;
    const r2 = radius * radius;
    const cs = SPATIAL_CELL;
    const rr = Math.ceil(radius / cs);
    const markNear = (gx: number, gy: number): void => {
      const ux = Math.floor(gx / cs);
      const uy = Math.floor(gy / cs);
      for (let cy = uy - rr; cy <= uy + rr; cy++) {
        for (let cx = ux - rr; cx <= ux + rr; cx++) {
          const arr = this.animalGrid.get(gridKey(cx, cy));
          if (!arr) continue;
          for (const a of arr) {
            const dx = a.gx - gx;
            const dy = a.gy - gy;
            if (dx * dx + dy * dy <= r2) this.activeAnimalIds.add(a.id);
          }
        }
      }
    };
    for (const u of this.units.values()) {
      if (u.hp > 0) markNear(u.gx, u.gy);
    }
    for (const f of this.campfires.values()) markNear(f.gx, f.gy);
  }

  visibleAnimalIds(
    viewers: Array<{ gx: number; gy: number }>,
    radius: number,
  ): Set<string> {
    const out = new Set<string>();
    if (viewers.length === 0) return out;
    const r2 = radius * radius;
    const cs = SPATIAL_CELL;
    const rr = Math.ceil(radius / cs);
    for (const u of viewers) {
      const ux = Math.floor(u.gx / cs);
      const uy = Math.floor(u.gy / cs);
      for (let cy = uy - rr; cy <= uy + rr; cy++) {
        for (let cx = ux - rr; cx <= ux + rr; cx++) {
          const arr = this.animalGrid.get(gridKey(cx, cy));
          if (!arr) continue;
          for (const a of arr) {
            if (out.has(a.id)) continue;
            const dx = a.gx - u.gx;
            const dy = a.gy - u.gy;
            if (dx * dx + dy * dy <= r2) out.add(a.id);
          }
        }
      }
    }
    return out;
  }

  visibleAnimalSnapshots(
    viewers: Array<{ gx: number; gy: number }>,
    radius: number,
  ): AnimalSnapshot[] {
    return this.animalSnapshotsForIds(this.visibleAnimalIds(viewers, radius));
  }

  visibleFishIds(
    viewers: Array<{ gx: number; gy: number }>,
    radius: number,
  ): Set<string> {
    const out = new Set<string>();
    if (viewers.length === 0) return out;
    const r2 = radius * radius;
    const cs = SPATIAL_CELL;
    const rr = Math.ceil(radius / cs);
    for (const u of viewers) {
      const ux = Math.floor(u.gx / cs);
      const uy = Math.floor(u.gy / cs);
      for (let cy = uy - rr; cy <= uy + rr; cy++) {
        for (let cx = ux - rr; cx <= ux + rr; cx++) {
          const arr = this.fishGrid.get(gridKey(cx, cy));
          if (!arr) continue;
          for (const f of arr) {
            if (out.has(f.id)) continue;
            const dx = f.gx - u.gx;
            const dy = f.gy - u.gy;
            if (dx * dx + dy * dy <= r2) out.add(f.id);
          }
        }
      }
    }
    return out;
  }

  visibleFishSnapshots(
    viewers: Array<{ gx: number; gy: number }>,
    radius: number,
  ): FishSnapshot[] {
    return this.fishSnapshotsForIds(this.visibleFishIds(viewers, radius));
  }

  forEachAnimalInRadius(
    gx: number,
    gy: number,
    radius: number,
    fn: (a: SimAnimal, distSq: number) => void,
  ): void {
    const r2 = radius * radius;
    const cs = SPATIAL_CELL;
    const rr = Math.ceil(radius / cs);
    const ux = Math.floor(gx / cs);
    const uy = Math.floor(gy / cs);
    for (let cy = uy - rr; cy <= uy + rr; cy++) {
      for (let cx = ux - rr; cx <= ux + rr; cx++) {
        const arr = this.animalGrid.get(gridKey(cx, cy));
        if (!arr) continue;
        for (const a of arr) {
          const dx = a.gx - gx;
          const dy = a.gy - gy;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r2) fn(a, d2);
        }
      }
    }
  }

  private stepAnimals(dt: number): void {
    const dead: string[] = [];
    const passiveBucket = this.tick % BAL.animalPassiveStepBuckets;
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
      const spec = animalSpec(a.kind);
      const fullStep =
        this.activeAnimalIds.has(a.id) ||
        a.attackTargetUnitId !== null;
      if (
        !fullStep &&
        updateBucketForId(a.id, BAL.animalPassiveStepBuckets) !== passiveBucket
      ) {
        continue;
      }

      if (spec.aggressive || spec.predator) {
        const nearestRepel = this.nearestRepellent(a.gx, a.gy);
        if (nearestRepel) {
          a.attackTargetUnitId = null;
          a.attackTargetAnimalId = null;
          a.state = "flee";
          a.fleeRepathTimer -= dt;
          if (a.path.length === 0 || a.fleeRepathTimer <= 0) {
            a.fleeRepathTimer = BAL.preyFleeRepathSec;
            const dx = a.gx - nearestRepel.gx;
            const dy = a.gy - nearestRepel.gy;
            const d = Math.hypot(dx, dy) || 1;
            const fd = D.campfireRepelRadius + 2;
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
        } else {
          const tdx = t.gx - a.gx;
          const tdy = t.gy - a.gy;
          const detect = this.animalDetectRange(spec, a.kind);
          const escapeR = detect * BAL.animalEscapeRangeMult;
          if (
            detect > 0 &&
            tdx * tdx + tdy * tdy > escapeR * escapeR
          ) {
            a.attackTargetUnitId = null;
            a.path = [];
            a.state = "idle";
          } else {
            const hdx = a.gx - (a.homeI + 0.5);
            const hdy = a.gy - (a.homeJ + 0.5);
            const wr3 = spec.wanderRadius * 3;
            if (hdx * hdx + hdy * hdy > wr3 * wr3) {
              a.attackTargetUnitId = null;
              a.path = [];
            }
          }
        }
      }

      if (!a.attackTargetUnitId && spec.aggressive && spec.detectRange > 0) {
        let nearest: SimUnit | null = null;
        const r = this.animalDetectRange(spec, a.kind);
        let nearestD2 = r * r;
        const cs = SPATIAL_CELL;
        const ax = Math.floor(a.gx / cs);
        const ay = Math.floor(a.gy / cs);
        const rr = Math.ceil(r / cs);
        for (let cy = ay - rr; cy <= ay + rr; cy++) {
          for (let cx = ax - rr; cx <= ax + rr; cx++) {
            const arr = this.unitGrid.get(gridKey(cx, cy));
            if (!arr) continue;
            for (const u of arr) {
              if (u.hp <= 0) continue;
              const dx = u.gx - a.gx;
              const dy = u.gy - a.gy;
              const d2 = dx * dx + dy * dy;
              if (d2 < nearestD2) {
                nearest = u;
                nearestD2 = d2;
              }
            }
          }
        }
        if (nearest) {
          a.attackTargetUnitId = nearest.id;
          a.path = [];
          a.repathTimer = 0;
          a.aggroExpireTick =
            this.tick + this.animalAggroDurationTicks(spec, a.kind);
          if (a.kind === "wolf") {
            this.alertWolfPack(a, nearest);
          }
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
            const hdx = a.gx - (a.homeI + 0.5);
            const hdy = a.gy - (a.homeJ + 0.5);
            const wr3 = spec.wanderRadius * 3;
            if (hdx * hdx + hdy * hdy > wr3 * wr3) {
              a.attackTargetAnimalId = null;
              a.path = [];
            }
          }
        }
        if (!a.attackTargetAnimalId) {
          let nearest: SimAnimal | null = null;
          const r = this.animalDetectRange(spec, a.kind);
          let nearestD2 = r * r;
          const cs = SPATIAL_CELL;
          const ax = Math.floor(a.gx / cs);
          const ay = Math.floor(a.gy / cs);
          const rr = Math.ceil(r / cs);
          for (let cy = ay - rr; cy <= ay + rr; cy++) {
            for (let cx = ax - rr; cx <= ax + rr; cx++) {
              const arr = this.preyGrid.get(gridKey(cx, cy));
              if (!arr) continue;
              for (const other of arr) {
                if (other === a) continue;
                if (other.hp <= 0) continue;
                const dx = other.gx - a.gx;
                const dy = other.gy - a.gy;
                const d2 = dx * dx + dy * dy;
                if (d2 < nearestD2) {
                  nearest = other;
                  nearestD2 = d2;
                }
              }
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
        let pdist2 = BAL.preyFleeRange * BAL.preyFleeRange;
        const cs = SPATIAL_CELL;
        const ax = Math.floor(a.gx / cs);
        const ay = Math.floor(a.gy / cs);
        const rr = Math.ceil(BAL.preyFleeRange / cs);
        for (let cy = ay - rr; cy <= ay + rr; cy++) {
          for (let cx = ax - rr; cx <= ax + rr; cx++) {
            const arr = this.predatorGrid.get(gridKey(cx, cy));
            if (!arr) continue;
            for (const other of arr) {
              if (other === a) continue;
              if (other.hp <= 0) continue;
              const dx = other.gx - a.gx;
              const dy = other.gy - a.gy;
              const d2 = dx * dx + dy * dy;
              if (d2 < pdist2) {
                predator = other;
                pdist2 = d2;
              }
            }
          }
        }
        if (predator) {
          a.state = "flee";
          a.fleeRepathTimer -= dt;
          if (a.path.length === 0 || a.fleeRepathTimer <= 0) {
            a.fleeRepathTimer = BAL.preyFleeRepathSec;
            const dx = a.gx - predator.gx;
            const dy = a.gy - predator.gy;
            const d = Math.hypot(dx, dy) || 1;
            const fd = BAL.preyFleeRange;
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
    this.animalReproTimer -= dt;
    if (this.animalReproTimer > 0) return;
    const stepDt = 1.0;
    this.animalReproTimer = stepDt;

    const kindCounts: Map<AnimalKind, number> = new Map();
    const buckets: Map<string, SimAnimal[]> = new Map();
    const cellSize = 2;
    for (const a of this.animals.values()) {
      kindCounts.set(a.kind, (kindCounts.get(a.kind) ?? 0) + 1);
      if (a.hp <= 0) continue;
      const spec = animalSpec(a.kind);
      if (a.ageSec < spec.matureAgeSec) continue;
      if (a.attackTargetUnitId || a.attackTargetAnimalId) continue;
      if (a.state === "flee" || a.state === "hunt") continue;
      const ci = Math.floor(a.gx / cellSize);
      const cj = Math.floor(a.gy / cellSize);
      const key = `${a.kind}|${ci}|${cj}`;
      const arr = buckets.get(key);
      if (arr) arr.push(a);
      else buckets.set(key, [a]);
    }
    const newborns: SimAnimal[] = [];
    for (const a of this.animals.values()) {
      if (a.hp <= 0) continue;
      const spec = animalSpec(a.kind);
      if (a.ageSec < spec.matureAgeSec) continue;
      if (a.attackTargetUnitId || a.attackTargetAnimalId) continue;
      if (a.state === "flee" || a.state === "hunt") continue;

      const ci = Math.floor(a.gx / cellSize);
      const cj = Math.floor(a.gy / cellSize);
      let mate: SimAnimal | null = null;
      outer: for (let dj = -1; dj <= 1 && !mate; dj++) {
        for (let di = -1; di <= 1; di++) {
          const arr = buckets.get(`${a.kind}|${ci + di}|${cj + dj}`);
          if (!arr) continue;
          for (const b of arr) {
            if (b === a) continue;
            if (b.id <= a.id) continue;
            const dx = b.gx - a.gx;
            const dy = b.gy - a.gy;
            if (dx * dx + dy * dy < D.animalBreedRangeSq) {
              mate = b;
              break outer;
            }
          }
        }
      }
      if (mate) {
        a.breedTimer += stepDt;
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
        a.breedTimer = Math.max(0, a.breedTimer - stepDt * 0.5);
      }
    }
    for (const n of newborns) this.animals.set(n.id, n);
  }

  private makeAnimalChild(parent: SimAnimal): SimAnimal | null {
    const spec = animalSpec(parent.kind);
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

  private stepAnimalRespawn(dt: number): void {
    this.animalRespawnTimer -= dt;
    if (this.animalRespawnTimer > 0) return;
    this.animalRespawnTimer = BAL.animalRespawnInterval;

    const counts: Map<AnimalKind, number> = new Map();
    for (const a of this.animals.values()) {
      counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
    }

    const deficits: Array<{ kind: AnimalKind; missing: number }> = [];
    for (const [kind, floor] of this.animalKindFloor) {
      const cur = counts.get(kind) ?? 0;
      if (cur < floor) deficits.push({ kind, missing: floor - cur });
    }
    if (deficits.length === 0) return;
    deficits.sort((a, b) => b.missing - a.missing);

    const r = BAL.animalSpawnRadius;
    const seasonBudget = Math.max(
      1,
      Math.round(BAL.animalRespawnPerTick * seasonAnimalSpawnMultiplier(seasonAt(this.gameTimeSec))),
    );
    let spawnedTotal = 0;
    const totalMissing = deficits.reduce((s, d) => s + d.missing, 0);
    for (const { kind, missing } of deficits) {
      if (spawnedTotal >= seasonBudget) break;
      const share = Math.max(
        1,
        Math.ceil((missing / totalMissing) * seasonBudget),
      );
      const budget = Math.min(share, missing, seasonBudget - spawnedTotal);
      const spec = animalSpec(kind);
      let spawnedHere = 0;
      let attempts = 0;
      const maxAttempts = BAL.animalRespawnTileAttempts * budget;
      while (spawnedHere < budget && attempts < maxAttempts) {
        attempts++;
        const i = Math.floor((Math.random() * 2 - 1) * r);
        const j = Math.floor((Math.random() * 2 - 1) * r);
        const b = biomeAt(this.seed, i, j);
        if (!spec.biomes.includes(b)) continue;
        if (!this.animalWalkable(spec, i, j)) continue;
        const cx = i + 0.5;
        const cy = j + 0.5;
        let nearUnit = false;
        const cs = SPATIAL_CELL;
        const gx = Math.floor(cx / cs);
        const gy = Math.floor(cy / cs);
        const rr = Math.ceil(Math.sqrt(D.animalRespawnMinUnitDistSq) / cs);
        outer: for (let dgy = -rr; dgy <= rr; dgy++) {
          for (let dgx = -rr; dgx <= rr; dgx++) {
            const arr = this.unitGrid.get(gridKey(gx + dgx, gy + dgy));
            if (!arr) continue;
            for (const u of arr) {
              if (u.hp <= 0) continue;
              const dx = cx - u.gx;
              const dy = cy - u.gy;
              if (dx * dx + dy * dy < D.animalRespawnMinUnitDistSq) {
                nearUnit = true;
                break outer;
              }
            }
          }
        }
        if (nearUnit) continue;
        if (kind === "wolf") {
          const packed = this.spawnWolfPackAround(i, j);
          spawnedHere += packed;
          spawnedTotal += packed;
        } else {
          const id = `a_${kind[0]}r${this.nextAnimalIdx++}`;
          const ageR = Math.random();
          this.animals.set(id, {
            id,
            kind,
            hp: spec.hp,
            hpMax: spec.hp,
            gx: cx,
            gy: cy,
            homeI: i,
            homeJ: j,
            state: "idle",
            path: [],
            decisionTimer: Math.random() * 4,
            attackTargetUnitId: null,
            attackTargetAnimalId: null,
            attackTimer: 0,
            repathTimer: 0,
            aggroExpireTick: 0,
            fleeRepathTimer: 0,
            ageSec: spec.matureAgeSec * (0.3 + ageR * 0.4),
            maxAgeSec: spec.maxAgeSec * (0.85 + Math.random() * 0.3),
            breedTimer: -spec.gestationSec * Math.random(),
          });
          spawnedHere++;
          spawnedTotal++;
        }
      }
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
      if (a.attackTimer >= BAL.animalAttackInterval) {
        a.attackTimer = 0;
        const dmg = this.animalDamage(spec, a.kind);
        if (dmg > 0) {
          const applied = Math.min(t.hp, dmg);
          t.hp = Math.max(0, t.hp - dmg);
          this.pushDamage(applied, t.gx, t.gy);
          a.aggroExpireTick =
            this.tick + this.animalAggroDurationTicks(spec, a.kind);
          this.callForHelp(t, a.id);
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
      const moveSpeed = spec.speed * (this.isNight() && (spec.aggressive || spec.predator) ? 0.85 : 0.7);
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
      if (a.attackTimer >= BAL.animalAttackInterval) {
        a.attackTimer = 0;
        if (spec.preyDamage > 0) {
          const applied = Math.min(t.hp, spec.preyDamage);
          t.hp = Math.max(0, t.hp - spec.preyDamage);
          this.pushDamage(applied, t.gx, t.gy);
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
    if (this.isSick(u)) return;
    let allyTarget: string | null = null;
    let allyD2 = BAL.groupFightRange * BAL.groupFightRange;
    const allies = this.byOwnerCache[u.owner];
    for (const ally of allies) {
      if (ally.id === u.id) continue;
      if (!ally.huntTarget) continue;
      if (ally.hp <= 0) continue;
      const dx = ally.gx - u.gx;
      const dy = ally.gy - u.gy;
      const d2 = dx * dx + dy * dy;
      if (d2 < allyD2) {
        allyD2 = d2;
        allyTarget = ally.huntTarget;
      }
    }
    if (allyTarget && this.animals.has(allyTarget)) {
      const a = this.animals.get(allyTarget)!;
      this.startHunt(u, a, new Set<string>(), true);
      return;
    }

    let bestAnimal: SimAnimal | null = null;
    let bestD2 = Infinity;
    const cs = SPATIAL_CELL;
    const ux = Math.floor(u.gx / cs);
    const uy = Math.floor(u.gy / cs);
    // Max autoHuntRange across kinds is small (≤6); 1 cell radius suffices.
    const rr = 1;
    for (let cy = uy - rr; cy <= uy + rr; cy++) {
      for (let cx = ux - rr; cx <= ux + rr; cx++) {
        const arr = this.animalGrid.get(gridKey(cx, cy));
        if (!arr) continue;
        for (const a of arr) {
          const spec = animalSpec(a.kind);
          if (!spec.autoHuntable) continue;
          if (a.hp <= 0) continue;
          const dx = a.gx - u.gx;
          const dy = a.gy - u.gy;
          const d2 = dx * dx + dy * dy;
          if (d2 > spec.autoHuntRange * spec.autoHuntRange) continue;
          if (d2 < bestD2) {
            bestD2 = d2;
            bestAnimal = a;
          }
        }
      }
    }
    if (bestAnimal) {
      this.startHunt(u, bestAnimal, new Set<string>(), true);
    }
  }

  private callForHelp(victim: SimUnit, animalId: string): void {
    const list = this.byOwnerCache[victim.owner];
    for (const u of list) {
      if (u.hp <= 0) continue;
      if (u.huntTarget === animalId) continue;
      u.huntTarget = animalId;
      u.harvestTarget = null;
      u.huntTimer = 0;
      u.huntWeapon = null;
      u.path = [];
      u.state = "hunting";
      u.autoFollowing = false;
    }
  }

  private alertWolfPack(source: SimAnimal, target: SimUnit): void {
    // Vollmond verdoppelt den Hilferuf-Radius — das ganze Rudel jagt mit.
    const baseR = 8;
    const r = isFullMoonNight(this.gameTimeSec) ? baseR * 2 : baseR;
    const r2 = r * r;
    const spec = animalSpec("wolf");
    const aggroTicks = this.animalAggroDurationTicks(spec, "wolf");
    const cs = SPATIAL_CELL;
    const ax = Math.floor(source.gx / cs);
    const ay = Math.floor(source.gy / cs);
    const rr = Math.ceil(r / cs);
    for (let cy = ay - rr; cy <= ay + rr; cy++) {
      for (let cx = ax - rr; cx <= ax + rr; cx++) {
        const arr = this.predatorGrid.get(gridKey(cx, cy));
        if (!arr) continue;
        for (const other of arr) {
          if (other === source) continue;
          if (other.kind !== "wolf") continue;
          if (other.hp <= 0) continue;
          if (other.attackTargetUnitId === target.id) continue;
          const dx = other.gx - source.gx;
          const dy = other.gy - source.gy;
          if (dx * dx + dy * dy > r2) continue;
          other.attackTargetUnitId = target.id;
          other.attackTargetAnimalId = null;
          other.aggroExpireTick = this.tick + aggroTicks;
          other.path = [];
          other.repathTimer = 0;
        }
      }
    }
  }

  private rallyAlliesToHunt(hunter: SimUnit, a: SimAnimal): void {
    const claimed = new Set<string>();
    const r2 = BAL.groupFightRange * BAL.groupFightRange;
    const list = this.byOwnerCache[hunter.owner];
    for (const u of list) {
      if (u.id === hunter.id) continue;
      if (u.huntTarget) continue;
      if (u.harvestTarget) continue;
      if (u.hp <= 0) continue;
      const dx = u.gx - a.gx;
      const dy = u.gy - a.gy;
      if (dx * dx + dy * dy > r2) continue;
      const blocked = this.blockedTilesFor(u, claimed);
      this.startHunt(u, a, blocked, hunter.huntAuto);
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
      u.huntAuto = false;
      u.huntWeapon = null;
      u.state = "idle";
      u.path = [];
      return true;
    }
    if (u.huntAuto && !u.isChief) {
      const c = this.chiefByOwnerCache[u.owner];
      if (c) {
        const cdx = u.gx - c.gx;
        const cdy = u.gy - c.gy;
        if (cdx * cdx + cdy * cdy > D.autoHuntAbortDist * D.autoHuntAbortDist) {
          u.huntTarget = null;
          u.huntAuto = false;
          u.huntWeapon = null;
          u.state = "idle";
          u.path = [];
          return true;
        }
      }
    }
    if (u.huntAuto && this.resourceRoom(u.owner, "fleisch") <= 0) {
      u.huntTarget = null;
      u.huntAuto = false;
      u.huntWeapon = null;
      u.state = "idle";
      u.path = [];
      return true;
    }
    const dx = a.gx - u.gx;
    const dy = a.gy - u.gy;
    const dist = Math.hypot(dx, dy);

    if (dist <= BAL.huntRange) {
      u.path = [];
      u.state = "hunting";
      u.huntFacing = a.gx >= u.gx ? 1 : -1;
      const ownerRes = this.resources[u.owner];
      const upgrade = craftBetterWeapon(u.weapon, ownerRes);
      if (upgrade) {
        payWeaponCost(upgrade, ownerRes);
        if (upgrade === "spear") {
          this.pushFlow(u.owner, "holz", -1, u.gx, u.gy);
          this.pushFlow(u.owner, "stein", -1, u.gx, u.gy);
        } else if (upgrade === "club") {
          this.pushFlow(u.owner, "holz", -1, u.gx, u.gy);
        } else if (upgrade === "stones") {
          this.pushFlow(u.owner, "stein", -1, u.gx, u.gy);
        }
        u.weapon = upgrade;
      }
      u.huntWeapon = u.weapon;
      u.huntTimer += dt;
      if (u.huntTimer >= BAL.huntInterval) {
        u.huntTimer = 0;
        let damage = BAL.fistHuntDamage;
        if (u.weapon === "spear") damage = BAL.spearHuntDamage;
        else if (u.weapon === "club") damage = BAL.clubHuntDamage;
        else if (u.weapon === "stones") damage = BAL.stoneHuntDamage;
        const applied = Math.min(a.hp, damage);
        a.hp -= damage;
        this.pushDamage(applied, a.gx, a.gy);
        const spec = animalSpec(a.kind);
        if (spec.damage > 0) {
          if (!a.attackTargetUnitId) a.attackTargetUnitId = u.id;
          a.aggroExpireTick =
            this.tick + this.animalAggroDurationTicks(spec, a.kind);
          if (a.kind === "wolf") {
            this.alertWolfPack(a, u);
          }
        } else {
          a.state = "flee";
        }
        this.rallyAlliesToHunt(u, a);
        if (a.hp <= 0) {
          this.gainResource(u.owner, "fleisch", spec.meat, a.gx, a.gy);
          if (spec.felle > 0) {
            this.gainResource(u.owner, "felle", spec.felle, a.gx, a.gy);
          }
          this.animals.delete(a.id);
          this.removedAnimalIds.push(a.id);
          u.huntTarget = null;
          u.huntAuto = false;
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
    const animalTile = `${ti},${tj}`;
    const adjacentToAnimal =
      last !== undefined &&
      last !== null &&
      Math.max(Math.abs(Math.floor(last.gx) - ti), Math.abs(Math.floor(last.gy) - tj)) <= 1;
    // Repath when the animal moved tiles OR our path can't reach it.
    if (lastTile !== animalTile && !adjacentToAnimal) {
      this.repathToHuntable(u, a, this.blockedTilesFor(u, new Set()));
    } else if (u.path.length === 0) {
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
        const speedMul = this.isNight() ? 0.2 : 1;
        const step = Math.min(u.speed * speedMul * dt, sd);
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
    this.tribeOrigin[p] = p;
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
      const isParent = k < 2;
      const startAge = isParent ? BAL.childAgeSec * 2 : BAL.childAgeSec;
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
        weapon: "fists",
        huntFacing: 1,
        huntAuto: false,
        harvestTimer: 0,
        lastFootprintTile: { i: a.cx + di, j: a.cy + dj },
        hp: BAL.unitHpMax,
        hpMax: BAL.unitHpMax,
        eatCooldown: 0,
        autoHuntScanTimer: rand01(this.seed ^ 0xb33, k, p) * BAL.unitAutoHuntScanInterval,
        ageSec: startAge,
        gender,
        firstName,
        isChief: false,
        hasFell: true,
        autoFollowing: false,
        autoFollowScanTimer: 0,
        idleSec: 0,
        manualOrder: false,
      };
      this.units.set(u.id, u);
      created.push(u);
    }
    this.updateChiefs();
    return created.map(this.snap);
  }

  respawnTribe(p: PlayerId, language?: NameLanguage): UnitSnapshot[] {
    this.active[p] = true;
    this.tribeOrigin[p] = p;
    this.clearPregnanciesFor(p);
    this.resources[p] = emptyResources();
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
      const isParent = k < 2;
      const startAge = isParent ? BAL.childAgeSec * 2 : BAL.childAgeSec;
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
        weapon: "fists",
        huntFacing: 1,
        huntAuto: false,
        harvestTimer: 0,
        lastFootprintTile: { i: a.cx + di, j: a.cy + dj },
        hp: BAL.unitHpMax,
        hpMax: BAL.unitHpMax,
        eatCooldown: 0,
        autoHuntScanTimer: rand01(this.seed ^ 0xb33, idx, p) * BAL.unitAutoHuntScanInterval,
        ageSec: startAge,
        gender,
        firstName,
        isChief: false,
        hasFell: true,
        idleSec: 0,
        autoFollowing: false,
        autoFollowScanTimer: 0,
        manualOrder: false,
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
    this.tribeOrigin[p] = p;
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

  campfireIdFor(p: PlayerId): string {
    return `cf_p${p}`;
  }

  isWalkable(i: number, j: number): boolean {
    const ov = this.tileOverrides.get(`${i},${j}`);
    if (ov) {
      if (ov.kind === "flood" || ov.kind === "lava" || ov.kind === "crack") return false;
      if (ov.kind === "ice" || ov.kind === "ash") return true;
    }
    if (isLandTile(this.seed, i, j)) return true;
    if (this.isWinterSeason) {
      const b = biomeAt(this.seed, i, j);
      if (b === "lake" || b === "river") return true;
    }
    return false;
  }

  private isWaterTile(i: number, j: number): boolean {
    const ov = this.tileOverrides.get(`${i},${j}`);
    if (ov?.kind === "flood") return true;
    if (ov?.kind === "ice" || ov?.kind === "ash") return false;
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

  private isNearWater(i: number, j: number, range: number): boolean {
    if (range <= 0) return false;
    for (let dj = -range; dj <= range; dj++) {
      for (let di = -range; di <= range; di++) {
        if (this.isWaterTile(i + di, j + dj)) return true;
      }
    }
    return false;
  }

  private animalWalkable(spec: AnimalSpec, i: number, j: number): boolean {
    if (spec.aquatic) {
      if (this.isWaterTile(i, j)) return true;
      if (
        spec.amphibianRange > 0 &&
        this.isWalkable(i, j) &&
        this.isNearWater(i, j, spec.amphibianRange)
      ) {
        return true;
      }
      return false;
    }
    return this.isWalkable(i, j);
  }

  private aquaticPathTarget(
    spec: AnimalSpec,
    ti: number,
    tj: number,
  ): { i: number; j: number } | null {
    if (!spec.aquatic) return { i: ti, j: tj };
    if (this.isWaterTile(ti, tj)) return { i: ti, j: tj };
    if (
      spec.amphibianRange > 0 &&
      this.isWalkable(ti, tj) &&
      this.isNearWater(ti, tj, spec.amphibianRange)
    ) {
      return { i: ti, j: tj };
    }
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
      hasFell: u.hasFell,
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
      u.manualOrder = true;
      u.huntTarget = null;
      u.harvestTarget = null;
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
    if (this.isNight()) {
      this.cmdMove(owner, unitIds, i, j);
      return;
    }
    const kind = this.objectKindAt(i, j);
    if (!kind) {
      this.cmdMove(owner, unitIds, i, j);
      return;
    }
    const claimed = new Set<string>();
    for (const id of unitIds) {
      const u = this.units.get(id);
      if (!u || u.owner !== owner) continue;
      if (this.isSick(u)) continue;
      u.autoFollowing = false;
      u.manualOrder = true;
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
    const cx = i + 0.5;
    const cy = j + 0.5;
    const id = this.campfireIdFor(owner);
    const existing = this.campfires.get(id);
    if (existing) {
      const ddx = existing.gx - cx;
      const ddy = existing.gy - cy;
      const closeEnough =
        ddx * ddx + ddy * ddy <= BAL.campfireGrowRadius * BAL.campfireGrowRadius;
      if (closeEnough) {
        if (existing.size >= BAL.campfireMaxSize) return;
        r.holz -= 1;
        r.stein -= 1;
        this.pushFlow(owner, "holz", -1, existing.gx, existing.gy);
        this.pushFlow(owner, "stein", -1, existing.gx, existing.gy);
        existing.size += 1;
        existing.fuelTimer = this.campfireBurnPerFuelSec();
        existing.fuelMax = existing.fuelTimer;
        return;
      }
      this.campfires.delete(id);
      this.removedCampfireIds.push(id);
    }
    r.holz -= 1;
    r.stein -= 1;
    this.pushFlow(owner, "holz", -1, cx, cy);
    this.pushFlow(owner, "stein", -1, cx, cy);
    const hasTent = r.felle >= BAL.tentFelleThreshold;
    const burn = this.campfireBurnPerFuelSec();
    this.campfires.set(id, {
      id,
      owner,
      gx: cx,
      gy: cy,
      fuelTimer: burn,
      fuelMax: burn,
      size: 1,
      hasTent,
    });
  }

  cmdGreetTribe(owner: PlayerId, targetUnitId: string): void {
    if (!this.active[owner]) return;
    const target = this.units.get(targetUnitId);
    if (!target) return;
    if (!target.isChief) return;
    if (target.owner === owner) return;
    const other = target.owner;
    if (!this.active[other]) return;

    const lo = Math.min(owner, other);
    const hi = Math.max(owner, other);
    const key = `${lo}_${hi}`;
    const last = this.lastEncounterTick.get(key) ?? -D.encounterCooldownTicks;
    if (this.tick - last < D.encounterCooldownTicks) return;
    this.lastEncounterTick.set(key, this.tick);

    const listA: SimUnit[] = [];
    const listB: SimUnit[] = [];
    for (const u of this.units.values()) {
      if (u.owner === owner) listA.push(u);
      else if (u.owner === other) listB.push(u);
    }
    const { aToB, bToA } = this.transferWomenForBalance(
      owner, other, listA, listB,
    );
    this.encounterEvents.push({
      a: owner,
      b: other,
      transfersAtoB: aToB,
      transfersBtoA: bToA,
    });
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
      hasStoneAt(this.seed, i, j) &&
      !this.removedKeys.has(objKey("stone", i, j))
    ) return "stone";
    if (
      hasCactusAt(this.seed, i, j) &&
      !this.removedKeys.has(objKey("cactus", i, j))
    ) return "cactus";
    if (
      hasKreuterAt(this.seed, i, j) &&
      !this.removedKeys.has(objKey("kreuter", i, j))
    ) return "kreuter";
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
      u.huntAuto = false;
      u.huntWeapon = null;
      u.state = "idle";
      return;
    }
    u.path = path.slice(1).map((c) => ({ gx: c.i + 0.5, gy: c.j + 0.5 }));
    u.state = "moving";
    u.harvestTarget = null;
    u.huntTarget = null;
    u.huntAuto = false;
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
    u.huntAuto = false;
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
    if (!this.unitAtAnyFire(u)) {
      u.hp = Math.max(0, u.hp - u.hpMax * BAL.unitHpLossPercentPerTile / 100);
    }
    this.tryAutoPick(u, ti, tj);
    this.tryEngageAnimalOnTile(u, ti, tj);
  }

  private tryEngageAnimalOnTile(u: SimUnit, ti: number, tj: number): void {
    if (u.huntTarget) return;
    if (this.resourceRoom(u.owner, "fleisch") <= 0) return;
    for (const a of this.animals.values()) {
      if (a.hp <= 0) continue;
      if (Math.floor(a.gx) !== ti) continue;
      if (Math.floor(a.gy) !== tj) continue;
      this.startHunt(u, a, this.blockedTilesFor(u, new Set()), true);
      return;
    }
  }

  private tryAutoPick(u: SimUnit, ti: number, tj: number): void {
    if (hasTreeAt(this.seed, ti, tj)) {
      const k = objKey("tree", ti, tj);
      if (!this.removedKeys.has(k)) {
        // Felling a tree yields its full wood content (clamped to free room).
        const full = treeWoodAt(this.seed, ti, tj);
        const room = this.resourceRoom(u.owner, "holz");
        const gain = Math.min(full, room);
        if (gain > 0) {
          this.autoPickAndRegrow(
            u, "tree", ti, tj, "holz",
            gain, D.treeRegrowTicks,
          );
          return;
        }
      }
    }
    const season = seasonAt(this.gameTimeSec);
    const regrowMult = seasonRegrowMultiplier(season);
    if (hasBushAt(this.seed, ti, tj) && seasonAllowsBush(season)) {
      const k = objKey("bush", ti, tj);
      if (
        !this.removedKeys.has(k) &&
        this.resourceRoom(u.owner, "beeren") >= BAL.bushAutopickGain
      ) {
        this.autoPickAndRegrow(
          u, "bush", ti, tj, "beeren",
          BAL.bushAutopickGain,
          Math.max(1, Math.round(D.bushRegrowTicks * regrowMult)),
        );
        return;
      }
    }
    if (hasMushroomAt(this.seed, ti, tj) && seasonAllowsMushroom(season)) {
      const k = objKey("mushroom", ti, tj);
      const gain = Math.max(
        1,
        Math.round(BAL.mushroomAutopickGain * seasonMushroomYieldMultiplier(season)),
      );
      if (
        !this.removedKeys.has(k) &&
        this.resourceRoom(u.owner, "pilze") >= gain
      ) {
        this.autoPickAndRegrow(
          u, "mushroom", ti, tj, "pilze",
          gain,
          Math.max(1, Math.round(D.mushroomRegrowTicks * regrowMult)),
        );
        return;
      }
    }
    if (hasStoneAt(this.seed, ti, tj)) {
      const k = objKey("stone", ti, tj);
      if (
        !this.removedKeys.has(k) &&
        this.resourceRoom(u.owner, "stein") >= BAL.stoneAutopickGain
      ) {
        this.autoPickAndRegrow(
          u, "stone", ti, tj, "stein",
          BAL.stoneAutopickGain, D.stoneRegrowTicks,
        );
      }
    }
    if (hasCactusAt(this.seed, ti, tj)) {
      const k = objKey("cactus", ti, tj);
      if (
        !this.removedKeys.has(k) &&
        (this.resourceRoom(u.owner, "holz") >= BAL.cactusAutopickHolz ||
          this.resourceRoom(u.owner, "wasser") >= BAL.cactusAutopickWasser)
      ) {
        this.autoPickAndRegrow(
          u, "cactus", ti, tj, "holz",
          BAL.cactusAutopickHolz, D.cactusRegrowTicks,
        );
        this.gainResource(u.owner, "wasser", BAL.cactusAutopickWasser, ti + 0.5, tj + 0.5);
        return;
      }
    }
    if (hasKreuterAt(this.seed, ti, tj) && seasonAllowsKreuter(season)) {
      const k = objKey("kreuter", ti, tj);
      const gain = Math.max(
        1,
        Math.round(BAL.kreuterAutopickGain * seasonKreuterYieldMultiplier(season)),
      );
      if (
        !this.removedKeys.has(k) &&
        this.resourceRoom(u.owner, "kreuter") >= gain
      ) {
        this.autoPickAndRegrow(
          u, "kreuter", ti, tj, "kreuter",
          gain, D.kreuterRegrowTicks,
        );
        return;
      }
    }
    this.tryAutoPickShallowFish(u, ti, tj);
    this.tryAutoPickWater(u, ti, tj);
  }

  private tryAutoPickWater(u: SimUnit, ti: number, tj: number): void {
    if (this.resourceRoom(u.owner, "wasser") <= 0) return;
    const adj: Array<[number, number]> = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (const [di, dj] of adj) {
      const b = biomeAt(this.seed, ti + di, tj + dj);
      if (b === "lake" || b === "river") {
        this.gainResource(u.owner, "wasser", BAL.waterAutopickGain, u.gx, u.gy);
        return;
      }
    }
  }

  private tryAutoPickShallowFish(u: SimUnit, ti: number, tj: number): void {
    if (this.resourceRoom(u.owner, "fisch") <= 0) return;
    const catchProb = seasonFishCatchMultiplier(seasonAt(this.gameTimeSec));
    if (catchProb < 1 && Math.random() >= catchProb) return;
    const cx = ti + 0.5;
    const cy = tj + 0.5;
    const r2 = BAL.fishCatchRadius * BAL.fishCatchRadius;
    let caught: SimFish | null = null;
    let bestD = Infinity;
    for (const f of this.fishes.values()) {
      if (f.kind !== "small") continue;
      const fi = Math.floor(f.gx);
      const fj = Math.floor(f.gy);
      if (!this.isWaterTileAt(fi, fj)) continue;
      if (Math.abs(fi - ti) > 1 || Math.abs(fj - tj) > 1) continue;
      const dx = f.gx - cx;
      const dy = f.gy - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      if (d2 < bestD) {
        bestD = d2;
        caught = f;
      }
    }
    if (!caught) return;
    this.fishes.delete(caught.id);
    this.removedFishIds.push(caught.id);
    this.gainResource(u.owner, "fisch", BAL.fishAutopickGain, caught.gx, caught.gy);
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
      if (kind === "tree") {
        this.treeRegrow.set(k, {
          i: ti,
          j: tj,
          stage: 0,
          nextStageTick: this.tick + D.treeStageTicks,
        });
      } else {
        this.regrow.set(k, this.tick + regrowTicks);
      }
    }
    this.gainResource(u.owner, resKey, gain, ti + 0.5, tj + 0.5);
  }

  private hpGainForResource(resKey: keyof Resources): number {
    if (resKey === "fleisch") return BAL.hpGainFleisch;
    if (resKey === "fisch") return BAL.hpGainFisch;
    if (resKey === "beeren") return BAL.hpGainBeeren;
    if (resKey === "pilze") return BAL.hpGainPilze;
    if (resKey === "kreuter") return BAL.hpGainKreuter;
    return 0;
  }

  private autoEat(u: SimUnit): void {
    const r = this.resources[u.owner];
    const hurt = u.hp < u.hpMax * BAL.autoeatHpThreshold;
    // Kräuter first: they heal injuries/illness, so consume them before food when hurt.
    const order: Array<keyof Resources> = [
      "kreuter", "fleisch", "fisch", "pilze", "beeren",
    ];
    if (hurt) {
      const inTent = this.isSick(u) && this.unitNearTent(u);
      for (const key of order) {
        if (r[key] <= 0) continue;
        let heal = this.hpGainForResource(key);
        if (heal <= 0) continue;
        if (inTent && key === "kreuter") heal *= 2; // tent boosts kräuter healing for the sick
        r[key] -= 1;
        u.hp = Math.min(u.hpMax, u.hp + heal);
        this.pushFlow(u.owner, key, -1, u.gx, u.gy);
        return;
      }
      return;
    }
    // Healthy units eat anyway when storage of a food is at cap so the next
    // kill/harvest does not get clamped — keeps food from going to waste.
    const tribe = this.tribeSizeOf(u.owner);
    for (const key of order) {
      if (r[key] <= 0) continue;
      const cap = resourceCap(key, tribe);
      if (cap <= 0 || r[key] < cap) continue;
      const heal = this.hpGainForResource(key);
      if (heal <= 0) continue;
      r[key] -= 1;
      u.hp = Math.min(u.hpMax, u.hp + heal);
      this.pushFlow(u.owner, key, -1, u.gx, u.gy);
      return;
    }
  }

  private consumeWater(dt: number): void {
    const seasonMult = seasonWaterMultiplier(seasonAt(this.gameTimeSec));
    const ratePerUnit =
      (BAL.waterPerUnitPerDay / DAY_LENGTH_SEC) * seasonMult * this.droughtMult;
    for (let p = 0; p < MAX_PLAYERS; p++) {
      if (!this.active[p]) continue;
      const count = this.byOwnerCache[p].length;
      if (count === 0) {
        this.waterDebt[p] = 0;
        continue;
      }
      this.waterDebt[p] += count * ratePerUnit * dt;
      const r = this.resources[p];
      while (this.waterDebt[p] >= 1 && r.wasser > 0) {
        r.wasser -= 1;
        this.waterDebt[p] -= 1;
        const ref = this.chiefByOwnerCache[p] ?? this.byOwnerCache[p][0];
        if (ref) this.pushFlow(p, "wasser", -1, ref.gx, ref.gy);
      }
      if (r.wasser <= 0 && this.waterDebt[p] > 1) this.waterDebt[p] = 1;
    }
  }

  private expireRegrows(): void {
    if (this.regrow.size > 0) {
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
    if (this.treeRegrow.size > 0) {
      for (const [k, entry] of this.treeRegrow) {
        if (this.tick < entry.nextStageTick) continue;
        entry.stage++;
        if (entry.stage >= 4) {
          this.treeRegrow.delete(k);
          this.removedKeys.delete(k);
          const idx = this.removedObjects.findIndex(
            (o) => objKey(o.kind, o.i, o.j) === k,
          );
          if (idx >= 0) {
            const ro = this.removedObjects[idx];
            this.removedObjects.splice(idx, 1);
            this.respawnedObjects.push(ro);
          }
          this.treeGrowthEvents.push({
            i: entry.i,
            j: entry.j,
            stage: 4,
          });
        } else {
          entry.nextStageTick = this.tick + D.treeStageTicks;
          this.treeGrowthEvents.push({
            i: entry.i,
            j: entry.j,
            stage: entry.stage as TreeGrowthStage,
          });
        }
      }
    }
  }

  consumeTreeGrowthEvents(): TreeGrowthEvent[] {
    const out = this.treeGrowthEvents;
    this.treeGrowthEvents = [];
    return out;
  }

  treeGrowthSnapshot(): TreeGrowthEvent[] {
    const out: TreeGrowthEvent[] = [];
    for (const entry of this.treeRegrow.values()) {
      if (entry.stage >= 1 && entry.stage <= 3) {
        out.push({ i: entry.i, j: entry.j, stage: entry.stage as TreeGrowthStage });
      }
    }
    return out;
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
    this.gameTimeSec += dt;
    const prevPhase = this.lastPhase;
    this.lastPhase = phaseAt(this.gameTimeSec);
    this.isWinterSeason = seasonAt(this.gameTimeSec) === "winter";
    if (prevPhase !== "night" && this.lastPhase === "night") this.onNightfall();
    this.rebuildSpatialIndex();
    this.rebuildActiveAnimalSet();
    this.rebuildOwnerCaches();
    this.stepAnimals(dt);
    this.stepAnimalReproduction(dt);
    this.stepAnimalRespawn(dt);
    this.stepFishes(dt);
    for (const u of this.units.values()) {
      u.eatCooldown -= dt;
      if (u.eatCooldown <= 0) {
        u.eatCooldown = BAL.eatInterval;
        this.autoEat(u);
      }
      if (this.resources[u.owner].wasser <= 0) {
        u.hp = Math.max(0, u.hp - (BAL.unitHpMax / D.dayLengthSec) * dt);
      } else if (this.unitAtAnyFire(u)) {
        u.hp = Math.min(u.hpMax, u.hp + BAL.campfireHpRegenPerSec * 1.5 * dt);
      } else {
        u.hp = Math.max(0, u.hp - BAL.unitHpLossPerSecIdle * dt);
      }
      // Cold penalty: at night, units without a fell suffer extra HP loss
      // unless sheltered (own campfire range or tent).
      if (
        !u.hasFell &&
        this.isNight() &&
        !this.unitAtAnyFire(u) &&
        !this.unitNearTent(u)
      ) {
        u.hp = Math.max(0, u.hp - BAL.unitColdHpLossPerSecAtNight * dt);
      }
      // Auto-equip a fell from the pool when standing near own campfire.
      if (!u.hasFell && this.resources[u.owner]?.felle >= 1 && this.unitAtAnyFire(u)) {
        this.resources[u.owner].felle -= 1;
        this.pushFlow(u.owner, "felle", -1, u.gx, u.gy);
        u.hasFell = true;
      }
      u.ageSec += dt;
      if (u.ageSec >= BAL.maxAgeSec) u.hp = 0;
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
            u.manualOrder = false;
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
            const speedMul = this.isNight() ? 0.2 : 1;
            const step = Math.min(u.speed * speedMul * dt, dist);
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
        if (u.harvestTimer >= BAL.harvestInterval) {
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
        u.manualOrder = false;
      } else {
        u.idleSec = 0;
      }
    }
    this.consumeWater(dt);
    this.expireFootprints();
    this.expireRegrows();
    this.reapDeadUnits();
    this.stepDropPiles(dt);
    this.growthCheck(dt);
    this.encounterCheck();
    // reapDeadUnits / growthCheck / encounterCheck can add, remove, or
    // change the owner of units. Refresh the cache so the remaining
    // tribe-scoped helpers see the post-mutation state.
    this.rebuildOwnerCaches();
    this.updateChiefs();
    this.spreadIdleUnits();
    this.cohereTribes();
    this.followChief(dt);
    this.campfireStep(dt);
    this.gatherAtCampfireStep();
    this.checkArtifactDiscovery();
    this.maybeTriggerDailyCatastrophes();
    this.stepCatastrophes(dt);
  }

  private hasNearbyForageOrHunt(p: PlayerId, cx: number, cy: number, r: number): boolean {
    const r2 = r * r;
    for (const a of this.animals.values()) {
      if (a.hp <= 0) continue;
      const spec = animalSpec(a.kind);
      if (!spec.autoHuntable) continue;
      const dx = a.gx - cx;
      const dy = a.gy - cy;
      if (dx * dx + dy * dy <= r2) return true;
    }
    const ri = Math.ceil(r);
    const ti0 = Math.floor(cx - ri);
    const ti1 = Math.floor(cx + ri);
    const tj0 = Math.floor(cy - ri);
    const tj1 = Math.floor(cy + ri);
    for (let j = tj0; j <= tj1; j++) {
      for (let i = ti0; i <= ti1; i++) {
        const ddx = i + 0.5 - cx;
        const ddy = j + 0.5 - cy;
        if (ddx * ddx + ddy * ddy > r2) continue;
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
          hasStoneAt(this.seed, i, j) &&
          !this.removedKeys.has(objKey("stone", i, j))
        ) return true;
        if (
          hasCactusAt(this.seed, i, j) &&
          !this.removedKeys.has(objKey("cactus", i, j))
        ) return true;
        if (
          hasKreuterAt(this.seed, i, j) &&
          !this.removedKeys.has(objKey("kreuter", i, j))
        ) return true;
      }
    }
    return false;
  }

  private gatherAtCampfireStep(): void {
    // Afternoon: the tribe heads home and is held at the fire.
    // Night: members are locked at the fire — player move/hunt/harvest
    // commands are rejected by cmd* and stray paths are rerouted home.
    // The campfire is auto-removed in the morning.
    if (this.tick % 5 !== 3) return;
    const isNight = this.isNight();
    const GATHER_RADIUS = CAMPFIRE_RANGE - 0.4;
    const gatherR2 = GATHER_RADIUS * GATHER_RADIUS;
    const fireR2 = CAMPFIRE_RANGE * CAMPFIRE_RANGE;
    const DEFEND_R2 = 4;
    for (let p = 0; p < MAX_PLAYERS; p++) {
      if (!this.active[p]) continue;
      const f = this.campfires.get(this.campfireIdFor(p));
      if (!f) continue;

      const targetI = Math.floor(f.gx);
      const targetJ = Math.floor(f.gy);
      const claimed = new Set<string>();
      for (const u of this.byOwnerCache[p]) {
        if (u.manualOrder) {
          if (u.path.length > 0) {
            const lastWp = u.path[u.path.length - 1];
            claimed.add(`${Math.floor(lastWp.gx)},${Math.floor(lastWp.gy)}`);
          } else {
            claimed.add(`${Math.floor(u.gx)},${Math.floor(u.gy)}`);
          }
          continue;
        }
        if (!isNight) u.harvestTarget = null;
        if (u.huntTarget) {
          const a = this.animals.get(u.huntTarget);
          if (!a || a.hp <= 0) {
            u.huntTarget = null;
            u.huntAuto = false;
            u.huntWeapon = null;
          } else if (!isNight) {
            const adx = a.gx - u.gx;
            const ady = a.gy - u.gy;
            if (adx * adx + ady * ady > DEFEND_R2) {
              u.huntTarget = null;
              u.huntAuto = false;
              u.huntWeapon = null;
            }
          }
        }
        if (u.huntTarget) continue;

        const dx = u.gx - f.gx;
        const dy = u.gy - f.gy;
        const atFire = dx * dx + dy * dy <= gatherR2;

        if (atFire) {
          if (u.path.length > 0) u.path = [];
          if (u.state !== "idle") u.state = "idle";
          claimed.add(`${Math.floor(u.gx)},${Math.floor(u.gy)}`);
          continue;
        }

        if (this.unitAtAnyFire(u)) {
          if (u.path.length > 0) u.path = [];
          if (u.state !== "idle") u.state = "idle";
          claimed.add(`${Math.floor(u.gx)},${Math.floor(u.gy)}`);
          continue;
        }

        if (u.path.length > 0) {
          const last = u.path[u.path.length - 1];
          const ldx = last.gx - f.gx;
          const ldy = last.gy - f.gy;
          if (ldx * ldx + ldy * ldy <= fireR2) {
            claimed.add(`${Math.floor(last.gx)},${Math.floor(last.gy)}`);
            continue;
          }
          u.path = [];
        }

        const blocked = this.blockedTilesFor(u, claimed);
        let target: { i: number; j: number } | null = null;
        if (this.isWalkable(targetI, targetJ) && !blocked.has(`${targetI},${targetJ}`)) {
          target = { i: targetI, j: targetJ };
        } else {
          target = this.findFreeTileNear(targetI, targetJ, blocked);
        }
        if (!target) continue;
        this.startMove(u, target.i, target.j, blocked);
        const last = u.path[u.path.length - 1];
        if (last) claimed.add(`${Math.floor(last.gx)},${Math.floor(last.gy)}`);
      }
    }
  }

  private unitAtAnyFire(u: SimUnit): boolean {
    const r2 = CAMPFIRE_RANGE * CAMPFIRE_RANGE;
    for (const f of this.campfires.values()) {
      const dx = f.gx - u.gx;
      const dy = f.gy - u.gy;
      if (dx * dx + dy * dy <= r2) return true;
    }
    if (this.isNight()) {
      for (const v of this.volcanoes) {
        const dx = v.gx - u.gx;
        const dy = v.gy - u.gy;
        if (dx * dx + dy * dy <= r2) return true;
      }
    }
    return false;
  }

  private nearestRepellent(
    ax: number,
    ay: number,
  ): { gx: number; gy: number; d2: number } | null {
    let best: { gx: number; gy: number; d2: number } | null = null;
    const limit = D.campfireRepelRadius * D.campfireRepelRadius;
    for (const f of this.campfires.values()) {
      const dx = f.gx - ax;
      const dy = f.gy - ay;
      const d2 = dx * dx + dy * dy;
      if (d2 < limit && (!best || d2 < best.d2)) {
        best = { gx: f.gx, gy: f.gy, d2 };
      }
    }
    if (this.isNight()) {
      for (const v of this.volcanoes) {
        const dx = v.gx - ax;
        const dy = v.gy - ay;
        const d2 = dx * dx + dy * dy;
        if (d2 < limit && (!best || d2 < best.d2)) {
          best = { gx: v.gx, gy: v.gy, d2 };
        }
      }
    }
    return best;
  }

  private nearVolcanoNight(gx: number, gy: number, r: number): boolean {
    if (!this.isNight()) return false;
    const r2 = r * r;
    for (const v of this.volcanoes) {
      const dx = v.gx - gx;
      const dy = v.gy - gy;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  private campfireStep(dt: number): void {
    const phase = this.lastPhase;
    const isNight = phase === "night";

    if (isNight || phase === "afternoon") {
      for (let p = 0; p < MAX_PLAYERS; p++) {
        if (!this.active[p]) continue;
        this.tickIgniteFor(p, dt);
      }
    }

    if (phase === "morning" && this.campfires.size > 0) {
      for (const f of [...this.campfires.values()]) {
        this.campfires.delete(f.id);
        this.removedCampfireIds.push(f.id);
      }
      return;
    }

    if (!isNight) return;

    for (const f of [...this.campfires.values()]) {
      f.fuelTimer -= dt;
      if (f.fuelTimer > 0) continue;
      const r = this.resources[f.owner];
      const cost = f.size;
      if (r.holz >= cost) {
        r.holz -= cost;
        this.pushFlow(f.owner, "holz", -cost, f.gx, f.gy);
        f.fuelTimer = this.campfireBurnPerFuelSec();
        f.fuelMax = f.fuelTimer;
      } else {
        this.campfires.delete(f.id);
        this.removedCampfireIds.push(f.id);
      }
    }
  }

  private tickIgniteFor(p: PlayerId, _dt: number): void {
    if (this.campfires.has(this.campfireIdFor(p))) return;
    const r = this.resources[p];
    if (r.holz < BAL.campfireIgniteHolzCost) return;
    if (r.stein < BAL.campfireIgniteSteinCost) return;
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
    if (stationary < BAL.campfireIgniteMinUnits) return;
    cx /= stationary;
    cy /= stationary;
    let cluster = 0;
    const r2 = BAL.campfireIgniteClusterRadius * BAL.campfireIgniteClusterRadius;
    for (const u of this.units.values()) {
      if (u.owner !== p) continue;
      if (u.path.length > 0) continue;
      if (u.huntTarget) continue;
      if (u.harvestTarget) continue;
      const dx = u.gx - cx;
      const dy = u.gy - cy;
      if (dx * dx + dy * dy <= r2) cluster++;
    }
    if (cluster < BAL.campfireIgniteMinUnits) return;
    const volR2 = CAMPFIRE_RANGE * CAMPFIRE_RANGE;
    for (const v of this.volcanoes) {
      const dx = v.gx - cx;
      const dy = v.gy - cy;
      if (dx * dx + dy * dy <= volR2) return;
    }
    r.holz -= BAL.campfireIgniteHolzCost;
    r.stein -= BAL.campfireIgniteSteinCost;
    this.pushFlow(p, "holz", -BAL.campfireIgniteHolzCost, cx, cy);
    this.pushFlow(p, "stein", -BAL.campfireIgniteSteinCost, cx, cy);
    const id = this.campfireIdFor(p);
    const hasTent = r.felle >= BAL.tentFelleThreshold;
    const burn = this.campfireBurnPerFuelSec();
    this.campfires.set(id, {
      id,
      owner: p,
      gx: cx,
      gy: cy,
      fuelTimer: burn,
      fuelMax: burn,
      size: 1,
      hasTent,
    });
  }

  private encounterCheck(): void {
    // Encounter cooldown is 60s; running this every 10 ticks (~500ms)
    // is indistinguishable from every tick gameplay-wise but cuts the
    // O(players² × units²) pair scan to a tenth.
    if (this.tick % 10 !== 0) return;
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

    const centers: ({ x: number; y: number } | null)[] = new Array(MAX_PLAYERS).fill(null);
    for (let p = 0; p < MAX_PLAYERS; p++) {
      const list = byPlayer[p];
      if (!this.active[p] || list.length === 0) continue;
      let sx = 0;
      let sy = 0;
      for (const u of list) { sx += u.gx; sy += u.gy; }
      centers[p] = { x: sx / list.length, y: sy / list.length };
    }

    const r2 = BAL.encounterRange * BAL.encounterRange;
    for (let a = 0; a < MAX_PLAYERS; a++) {
      const cA = centers[a];
      if (!cA) continue;
      for (let b = a + 1; b < MAX_PLAYERS; b++) {
        const cB = centers[b];
        if (!cB) continue;
        const key = `${a}_${b}`;
        const last = this.lastEncounterTick.get(key) ?? -D.encounterCooldownTicks;
        if (this.tick - last < D.encounterCooldownTicks) continue;

        const dx = cA.x - cB.x;
        const dy = cA.y - cB.y;
        if (dx * dx + dy * dy > r2) continue;

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
    // Kinder werden bei Geschlechter-Bilanz ignoriert und auch nie übergeben —
    // sie wachsen mit dem Stamm auf, in dem sie geboren wurden.
    const surplus = (list: SimUnit[]) => {
      let m = 0;
      let f = 0;
      for (const u of list) {
        if (u.ageSec < BAL.childAgeSec) continue;
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
      if (u.ageSec < BAL.childAgeSec) continue;
      u.owner = targetOwner;
      u.color = newColor;
      u.isChief = false;
      u.path = [];
      u.harvestTarget = null;
      u.huntTarget = null;
      u.huntAuto = false;
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

      let matureMales = 0;
      let cx = 0;
      let cy = 0;
      for (const u of list) {
        if (u.gender === "m" && u.ageSec >= BAL.childAgeSec) matureMales++;
        cx += u.gx;
        cy += u.gy;
      }
      const canConceive = matureMales >= 1 && list.length >= 2;
      const centerX = cx / list.length;
      const centerY = cy / list.length;

      let birthsRemaining = list.length < MAX_TRIBE_SIZE
        ? MAX_TRIBE_SIZE - list.length
        : 1;

      for (const u of list) {
        if (u.gender !== "f") continue;
        if (u.ageSec < BAL.childAgeSec || u.ageSec >= BAL.oldThresholdSec) {
          this.pregnancyTimer.delete(u.id);
          continue;
        }
        const frac = u.hpMax > 0 ? u.hp / u.hpMax : 0;
        if (!canConceive || frac < BAL.pregnancyHealthMinFrac) {
          this.pregnancyTimer.delete(u.id);
          continue;
        }
        const t = (this.pregnancyTimer.get(u.id) ?? 0) + dt;
        if (t < BAL.growthRequiredSec || birthsRemaining <= 0) {
          this.pregnancyTimer.set(u.id, Math.min(t, BAL.growthRequiredSec));
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
            this.pregnancyTimer.set(u.id, BAL.growthRequiredSec);
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
    this.tribeOrigin[target] = this.tribeOrigin[parent];
    this.followChiefEnabled[target] = this.followChiefEnabled[parent];
    this.resources[target] = emptyResources();
    this.spawns[target] = { cx: Math.floor(ax), cy: Math.floor(ay) };

    const newColor = PLAYER_COLORS[target % PLAYER_COLORS.length];
    for (const u of founders) {
      u.owner = target;
      u.color = newColor;
      u.isChief = false;
      u.path = [];
      u.harvestTarget = null;
      u.huntTarget = null;
      u.huntAuto = false;
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
      const frac = Math.min(1, t / BAL.growthRequiredSec);
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
    // Newborn gets a fell from the pool if one is in stock — else cold-vulnerable.
    const pool = this.resources[p];
    let hasFell = false;
    if (pool && pool.felle >= 1) {
      pool.felle -= 1;
      this.pushFlow(p, "felle", -1, spot.i + 0.5, spot.j + 0.5);
      hasFell = true;
    }
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
      weapon: "fists",
      huntFacing: 1,
      huntAuto: false,
      harvestTimer: 0,
      lastFootprintTile: { i: spot.i, j: spot.j },
      hp: BAL.unitHpMax,
      hpMax: BAL.unitHpMax,
      eatCooldown: 0,
      autoHuntScanTimer: 0,
      ageSec: 0,
      gender,
      firstName,
      isChief: false,
      hasFell,
      idleSec: 0,
      autoFollowing: false,
      autoFollowScanTimer: 0,
      manualOrder: false,
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
    for (let p = 0; p < MAX_PLAYERS; p++) {
      const list = this.byOwnerCache[p];
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
        if (best) {
          best.isChief = true;
          chief = best;
        }
      }
      this.chiefByOwnerCache[p] = chief;
    }
  }

  private reapDeadUnits(): void {
    const before: number[] = new Array(MAX_PLAYERS).fill(0);
    for (const u of this.units.values()) before[u.owner]++;
    const remaining: number[] = before.slice();
    for (const u of this.units.values()) {
      if (u.hp <= 0) {
        this.dropFromDeadUnit(u, remaining[u.owner]);
        remaining[u.owner]--;
        this.deadUnitIds.push(u.id);
        this.units.delete(u.id);
      }
    }
    for (let p = 0; p < MAX_PLAYERS; p++) {
      if (this.active[p] && before[p] > 0 && remaining[p] === 0) {
        this.extinctTribes.push(p);
      }
    }
  }

  private dropFromDeadUnit(u: SimUnit, tribeSizeBefore: number): void {
    if (tribeSizeBefore <= 0) return;
    const pool = this.resources[u.owner];
    const drop = emptyResources();
    let any = false;
    if (tribeSizeBefore === 1) {
      for (const k of RESOURCE_KEYS) {
        const amt = pool[k];
        if (amt > 0) {
          drop[k] = amt;
          pool[k] = 0;
          any = true;
        }
      }
    } else {
      for (const k of RESOURCE_KEYS) {
        const share = Math.floor(pool[k] / tribeSizeBefore);
        if (share > 0) {
          drop[k] = share;
          pool[k] -= share;
          any = true;
        }
      }
    }
    if (!any) return;
    this.createDropPile(u.gx, u.gy, drop);
  }

  private createDropPile(gx: number, gy: number, resources: Resources): void {
    const id = `drop_${this.nextDropPileIdx++}`;
    const pile: SimDropPile = {
      id,
      gx,
      gy,
      resources,
      decaySec: DROP_PILE_LIFETIME_SEC,
      pickupDelaySec: DROP_PILE_PICKUP_DELAY_SEC,
    };
    this.dropPiles.set(id, pile);
    this.newDropPiles.push(pile);
  }

  private stepDropPiles(dt: number): void {
    if (this.dropPiles.size === 0) return;
    const r2 = DROP_PILE_PICKUP_RADIUS * DROP_PILE_PICKUP_RADIUS;
    const cs = SPATIAL_CELL;
    const toRemove: string[] = [];
    for (const pile of this.dropPiles.values()) {
      if (pile.pickupDelaySec > 0) pile.pickupDelaySec -= dt;
      let picker: SimUnit | null = null;
      if (pile.pickupDelaySec <= 0) {
        // Pickup radius is well below one spatial cell, but a pile near
        // a cell boundary may have eligible pickers in neighbouring
        // cells, so scan a 3x3 window.
        const cgx = Math.floor(pile.gx / cs);
        const cgy = Math.floor(pile.gy / cs);
        outer: for (let dgy = -1; dgy <= 1; dgy++) {
          for (let dgx = -1; dgx <= 1; dgx++) {
            const arr = this.unitGrid.get(gridKey(cgx + dgx, cgy + dgy));
            if (!arr) continue;
            for (const u of arr) {
              if (u.hp <= 0) continue;
              const dx = u.gx - pile.gx;
              const dy = u.gy - pile.gy;
              if (dx * dx + dy * dy <= r2) {
                picker = u;
                break outer;
              }
            }
          }
        }
      }
      if (picker) {
        let total = 0;
        for (const k of RESOURCE_KEYS) {
          const amt = pile.resources[k];
          if (amt <= 0) continue;
          const gained = this.gainResource(
            picker.owner,
            k,
            amt,
            pile.gx,
            pile.gy,
          );
          pile.resources[k] -= gained;
          total += pile.resources[k];
        }
        if (total <= 0) {
          toRemove.push(pile.id);
          continue;
        }
      }
      pile.decaySec -= dt;
      if (pile.decaySec <= 0) toRemove.push(pile.id);
    }
    for (const id of toRemove) {
      this.dropPiles.delete(id);
      this.removedDropPileIds.push(id);
    }
  }

  dropPilesSnapshot(): DropPileSnapshot[] {
    const out: DropPileSnapshot[] = [];
    for (const p of this.dropPiles.values()) {
      out.push({
        id: p.id,
        gx: p.gx,
        gy: p.gy,
        resources: { ...p.resources },
        decaySec: p.decaySec,
      });
    }
    return out;
  }

  consumeNewDropPiles(): DropPileSnapshot[] {
    const out: DropPileSnapshot[] = this.newDropPiles.map((p) => ({
      id: p.id,
      gx: p.gx,
      gy: p.gy,
      resources: { ...p.resources },
      decaySec: p.decaySec,
    }));
    this.newDropPiles = [];
    return out;
  }

  consumeRemovedDropPileIds(): string[] {
    const out = this.removedDropPileIds;
    this.removedDropPileIds = [];
    return out;
  }

  private spreadIdleUnits(): void {
    // Idle de-stacking is a slow cosmetic correction; running it every
    // 5 ticks (~250ms) is invisible to the player but spares many A*
    // calls per second. Offset from cohere/gather/encounter.
    if (this.tick % 5 !== 1) return;
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
          this.startHunt(u, a, blocked, u.huntAuto);
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
    // Tribe cohesion is a slow drift correction; every 5 ticks
    // (~250ms) keeps the same gameplay feel at 1/5 the cost.
    // Offset from spread/gather/encounter.
    if (this.tick % 5 !== 2) return;
    const r2 = BAL.followChiefNear * BAL.followChiefNear;
    const claimed = new Set<string>();
    for (const u of this.units.values()) {
      if (u.isChief) continue;
      if (u.path.length > 0) continue;
      if (u.harvestTarget || u.huntTarget) continue;
      if (u.state !== "idle") continue;
      // Campfire takes priority: gatherAtCampfireStep herds the tribe home.
      if (this.campfires.has(this.campfireIdFor(u.owner))) continue;
      const c = this.chiefByOwnerCache[u.owner];
      if (!c) continue;
      const dx = u.gx - c.gx;
      const dy = u.gy - c.gy;
      if (dx * dx + dy * dy <= r2) continue;
      const ti = Math.floor(c.gx);
      const tj = Math.floor(c.gy);
      const blocked = this.blockedTilesFor(u, claimed);
      let target: { i: number; j: number } | null = null;
      if (this.isWalkable(ti, tj) && !blocked.has(`${ti},${tj}`)) {
        target = { i: ti, j: tj };
      } else {
        target = this.findFreeTileNear(ti, tj, blocked);
      }
      if (!target) continue;
      this.startMove(u, target.i, target.j, blocked);
      const last = u.path[u.path.length - 1];
      if (last) claimed.add(`${Math.floor(last.gx)},${Math.floor(last.gy)}`);
    }
  }

  private followChief(dt: number): void {
    for (const u of this.units.values()) {
      if (u.isChief) continue;
      if (!this.active[u.owner]) continue;
      if (!this.followChiefEnabled[u.owner]) continue;
      if (u.huntTarget) continue;
      if (u.harvestTarget) continue;
      // Campfire takes priority — sleeping at the fire, not foraging.
      if (this.campfires.has(this.campfireIdFor(u.owner))) {
        u.autoFollowing = false;
        continue;
      }

      u.autoFollowScanTimer -= dt;

      const c = this.chiefByOwnerCache[u.owner];
      if (!c) {
        u.autoFollowing = false;
        continue;
      }

      if (u.autoFollowScanTimer > 0) continue;
      u.autoFollowScanTimer = BAL.followChiefScanInterval;

      const foraged = this.tryAutoForage(u, c);
      if (foraged) {
        u.autoFollowing = true;
        continue;
      }

      // Nothing left to gather or hunt in the chief's sight — rally back.
      if (u.path.length === 0) {
        const dx = u.gx - c.gx;
        const dy = u.gy - c.gy;
        if (dx * dx + dy * dy > BAL.followChiefNear * BAL.followChiefNear) {
          const ti = Math.floor(c.gx);
          const tj = Math.floor(c.gy);
          const blocked = this.blockedTilesFor(u, new Set());
          let target: { i: number; j: number } | null = null;
          if (this.isWalkable(ti, tj) && !blocked.has(`${ti},${tj}`)) {
            target = { i: ti, j: tj };
          } else {
            target = this.findFreeTileNear(ti, tj, blocked);
          }
          if (target) this.startMove(u, target.i, target.j, blocked);
        }
      }
      u.autoFollowing = false;
    }
  }

  private isSick(u: SimUnit): boolean {
    return u.hp < u.hpMax * 0.3;
  }

  private unitNearTent(u: SimUnit): boolean {
    const r2 = CAMPFIRE_RANGE * CAMPFIRE_RANGE;
    for (const f of this.campfires.values()) {
      if (!f.hasTent) continue;
      if (f.owner !== u.owner) continue;
      const dx = f.gx - u.gx;
      const dy = f.gy - u.gy;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  private onNightfall(): void {
    // Tents require a stockpile of felle (≥ BAL.tentFelleThreshold) at nightfall
    // and consume BAL.tentFellePerNight per night to stay up.
    for (const f of this.campfires.values()) {
      const r = this.resources[f.owner];
      if (!r) continue;
      if (r.felle >= BAL.tentFelleThreshold) {
        f.hasTent = true;
        r.felle -= BAL.tentFellePerNight;
        this.pushFlow(f.owner, "felle", -BAL.tentFellePerNight, f.gx, f.gy);
      } else {
        f.hasTent = false;
      }
    }
  }

  private tryAutoForage(u: SimUnit, chief: SimUnit): boolean {
    if (this.isSick(u)) return false;
    const seed = this.seed;
    const R = BAL.chiefVisionRadius;
    const R2 = R * R;
    const ci0 = Math.floor(chief.gx);
    const cj0 = Math.floor(chief.gy);
    const roomPilze = this.resourceRoom(u.owner, "pilze") > 0;
    const roomBeeren = this.resourceRoom(u.owner, "beeren") > 0;
    const roomStein = this.resourceRoom(u.owner, "stein") > 0;
    const roomHolz = this.resourceRoom(u.owner, "holz") > 0;
    const roomWasser = this.resourceRoom(u.owner, "wasser") > 0;
    const roomFleisch = this.resourceRoom(u.owner, "fleisch") > 0;
    const roomKreuter = this.resourceRoom(u.owner, "kreuter") > 0;
    const roomCactus = roomHolz || roomWasser;
    let bestGather: { kind: ObjectKind; i: number; j: number; d2: number } | null = null;
    if (roomPilze || roomBeeren || roomStein || roomCactus || roomKreuter) {
      for (let dj = -R; dj <= R; dj++) {
        for (let di = -R; di <= R; di++) {
          const cdx = di + 0.5 - (chief.gx - ci0);
          const cdy = dj + 0.5 - (chief.gy - cj0);
          if (cdx * cdx + cdy * cdy > R2) continue;
          const i = ci0 + di;
          const j = cj0 + dj;
          let kind: ObjectKind | null = null;
          if (
            roomPilze &&
            hasMushroomAt(seed, i, j) &&
            !this.removedKeys.has(objKey("mushroom", i, j))
          ) {
            kind = "mushroom";
          } else if (
            roomBeeren &&
            hasBushAt(seed, i, j) &&
            !this.removedKeys.has(objKey("bush", i, j))
          ) {
            kind = "bush";
          } else if (
            roomStein &&
            hasStoneAt(seed, i, j) &&
            !this.removedKeys.has(objKey("stone", i, j))
          ) {
            kind = "stone";
          } else if (
            roomCactus &&
            hasCactusAt(seed, i, j) &&
            !this.removedKeys.has(objKey("cactus", i, j))
          ) {
            kind = "cactus";
          } else if (
            roomKreuter &&
            hasKreuterAt(seed, i, j) &&
            !this.removedKeys.has(objKey("kreuter", i, j))
          ) {
            kind = "kreuter";
          }
          if (!kind) continue;
          const mdx = i + 0.5 - u.gx;
          const mdy = j + 0.5 - u.gy;
          const d2 = mdx * mdx + mdy * mdy;
          if (!bestGather || d2 < bestGather.d2) bestGather = { kind, i, j, d2 };
        }
      }
    }

    let bestHunt: { animal: SimAnimal; d2: number } | null = null;
    if (roomFleisch) {
      const cs = SPATIAL_CELL;
      const cellR = Math.ceil(R / cs);
      const ccx = Math.floor(chief.gx / cs);
      const ccy = Math.floor(chief.gy / cs);
      for (let cy = ccy - cellR; cy <= ccy + cellR; cy++) {
        for (let cx = ccx - cellR; cx <= ccx + cellR; cx++) {
          const arr = this.animalGrid.get(gridKey(cx, cy));
          if (!arr) continue;
          for (const a of arr) {
            if (a.hp <= 0) continue;
            const spec = animalSpec(a.kind);
            if (!spec.autoHuntable) continue;
            const cdx = a.gx - chief.gx;
            const cdy = a.gy - chief.gy;
            if (cdx * cdx + cdy * cdy > R2) continue;
            const mdx = a.gx - u.gx;
            const mdy = a.gy - u.gy;
            const d2 = mdx * mdx + mdy * mdy;
            if (!bestHunt || d2 < bestHunt.d2) bestHunt = { animal: a, d2 };
          }
        }
      }
    }

    const blocked = this.blockedTilesFor(u, new Set());
    if (bestHunt && (!bestGather || bestHunt.d2 < bestGather.d2)) {
      this.startHunt(u, bestHunt.animal, blocked, true);
      return u.huntTarget !== null;
    }
    if (bestGather) {
      this.startHarvest(u, bestGather.kind, bestGather.i, bestGather.j, blocked);
      return u.harvestTarget !== null;
    }
    return false;
  }

  private objectStillThere(t: { kind: ObjectKind; i: number; j: number }): boolean {
    const k = objKey(t.kind, t.i, t.j);
    if (this.removedKeys.has(k)) return false;
    if (t.kind === "tree") return hasTreeAt(this.seed, t.i, t.j);
    if (t.kind === "bush") return hasBushAt(this.seed, t.i, t.j);
    if (t.kind === "mushroom") return hasMushroomAt(this.seed, t.i, t.j);
    if (t.kind === "cactus") return hasCactusAt(this.seed, t.i, t.j);
    if (t.kind === "kreuter") return hasKreuterAt(this.seed, t.i, t.j);
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
      amount = BAL.treeHarvestAmount;
      resKey = "holz";
      baseTotal = treeWoodAt(this.seed, t.i, t.j);
    } else if (t.kind === "bush") {
      amount = BAL.bushHarvestAmount;
      resKey = "beeren";
      baseTotal = bushBerriesAt(this.seed, t.i, t.j);
    } else if (t.kind === "mushroom") {
      amount = BAL.mushHarvestAmount;
      resKey = "pilze";
      baseTotal = mushroomBerriesAt(this.seed, t.i, t.j);
    } else if (t.kind === "cactus") {
      amount = BAL.cactusHarvestHolz;
      resKey = "holz";
      baseTotal = cactusYieldAt(this.seed, t.i, t.j);
    } else if (t.kind === "kreuter") {
      amount = BAL.kreuterHarvestAmount;
      resKey = "kreuter";
      baseTotal = kreuterAmountAt(this.seed, t.i, t.j);
    } else {
      amount = BAL.stoneHarvestAmount;
      resKey = "stein";
      baseTotal = stoneAmountAt(this.seed, t.i, t.j);
    }
    const gained = this.gainResource(
      u.owner, resKey, amount, t.i + 0.5, t.j + 0.5, false,
    );
    if (t.kind === "cactus" && gained > 0) {
      this.gainResource(
        u.owner, "wasser", BAL.cactusHarvestWasser, t.i + 0.5, t.j + 0.5, false,
      );
    }
    if (gained <= 0) {
      u.harvestTarget = null;
      u.state = "idle";
      return;
    }
    const remaining = (this.remaining.get(k) ?? baseTotal) - gained;
    if (remaining <= 0) {
      this.removedKeys.add(k);
      this.remaining.delete(k);
      const ro: RemovedObject = { kind: t.kind, i: t.i, j: t.j };
      this.removedObjects.push(ro);
      this.newRemovedObjects.push(ro);
      // Stein-Regrow: nur via aktive Ernte gilt (Tile bleibt sonst „leer"),
      // sodass abgebaute Felsbrocken nach D.stoneRegrowTicks zurückkommen.
      if (t.kind === "stone" && D.stoneRegrowTicks > 0) {
        this.regrow.set(k, this.tick + D.stoneRegrowTicks);
      }
      u.harvestTarget = null;
      u.state = "idle";
    } else {
      this.remaining.set(k, remaining);
    }
  }

  // ========================================================================
  // CATASTROPHES
  // ========================================================================

  consumeCatastropheEvents(): CatastropheEvent[] {
    const out = this.catastropheEvents;
    this.catastropheEvents = [];
    return out;
  }

  consumeTileOverrideEvents(): TileOverrideEvent[] {
    const out = this.tileOverrideEvents;
    this.tileOverrideEvents = [];
    return out;
  }

  tileOverridesSnapshot(): TileOverrideEvent[] {
    const out: TileOverrideEvent[] = [];
    for (const [key, v] of this.tileOverrides) {
      const [is, js] = key.split(",");
      out.push({ i: Number(is), j: Number(js), kind: v.kind });
    }
    return out;
  }

  getTileOverride(i: number, j: number): TileOverride | null {
    const v = this.tileOverrides.get(`${i},${j}`);
    return v ? v.kind : null;
  }

  /** True if a catastrophe override blocks walking through this tile. */
  isOverrideBlocked(i: number, j: number): boolean {
    const o = this.getTileOverride(i, j);
    // ice is walkable; ash/flood/lava/crack block; (callers can override).
    return o === "flood" || o === "lava" || o === "crack";
  }

  /** Allows movement onto frozen water (ice override). */
  isOverrideWalkOverWater(i: number, j: number): boolean {
    return this.getTileOverride(i, j) === "ice";
  }

  private setTileOverride(
    i: number,
    j: number,
    kind: TileOverride | null,
    durationSec: number,
  ): void {
    const key = `${i},${j}`;
    if (kind === null) {
      if (!this.tileOverrides.has(key)) return;
      this.tileOverrides.delete(key);
      this.tileOverrideEvents.push({ i, j, kind: null });
      return;
    }
    const expiresTick =
      durationSec > 0
        ? this.tick + Math.ceil(durationSec * TICK_RATE)
        : Number.POSITIVE_INFINITY;
    const prev = this.tileOverrides.get(key);
    this.tileOverrides.set(key, { kind, expiresTick });
    if (!prev || prev.kind !== kind) {
      this.tileOverrideEvents.push({ i, j, kind });
    }
  }

  private expireTileOverrides(): void {
    if (this.tileOverrides.size === 0) return;
    for (const [key, v] of this.tileOverrides) {
      if (this.tick < v.expiresTick) continue;
      this.tileOverrides.delete(key);
      const [is, js] = key.split(",");
      this.tileOverrideEvents.push({ i: Number(is), j: Number(js), kind: null });
    }
  }

  private nextRand(): number {
    this.rngCounter = (this.rngCounter + 1) | 0;
    return rand01(this.seed ^ 0xc47a51, this.tick & 0xffff, this.rngCounter);
  }

  /** Tile pick around a center, ignoring water/sequoia/spawn-guard. */
  private pickRandomTileInRange(
    cx: number,
    cy: number,
    minR: number,
    maxR: number,
    filter: (i: number, j: number) => boolean,
    tries = 30,
  ): { i: number; j: number } | null {
    for (let t = 0; t < tries; t++) {
      const ang = this.nextRand() * Math.PI * 2;
      const r = minR + this.nextRand() * (maxR - minR);
      const i = Math.round(cx + Math.cos(ang) * r);
      const j = Math.round(cy + Math.sin(ang) * r);
      if (filter(i, j)) return { i, j };
    }
    return null;
  }

  /** Sums HP-damage on all units in radius (also kills if applicable). */
  private aoeDamageUnits(cx: number, cy: number, radius: number, damage: number): void {
    if (damage <= 0) return;
    const r2 = radius * radius;
    for (const u of this.units.values()) {
      if (u.hp <= 0) continue;
      const dx = u.gx - cx;
      const dy = u.gy - cy;
      if (dx * dx + dy * dy > r2) continue;
      const applied = Math.min(damage, u.hp);
      u.hp = Math.max(0, u.hp - damage);
      this.pushDamage(applied, u.gx, u.gy);
    }
  }

  private aoeDamageAnimals(cx: number, cy: number, radius: number, damage: number): void {
    if (damage <= 0) return;
    const r2 = radius * radius;
    for (const a of this.animals.values()) {
      if (a.hp <= 0) continue;
      const dx = a.gx - cx;
      const dy = a.gy - cy;
      if (dx * dx + dy * dy > r2) continue;
      const applied = Math.min(damage, a.hp);
      a.hp = Math.max(0, a.hp - damage);
      this.pushDamage(applied, a.gx, a.gy);
    }
  }

  /** Destroys a world object (tree, bush, mushroom, kreuter, stone) at a tile. */
  private destroyObjectAt(
    kind: ObjectKind,
    i: number,
    j: number,
    regrowTicks = 0,
  ): boolean {
    if (!this.objectIsThere(kind, i, j)) return false;
    const k = objKey(kind, i, j);
    if (this.removedKeys.has(k)) return false;
    this.removedKeys.add(k);
    this.remaining.delete(k);
    const ro: RemovedObject = { kind, i, j };
    this.removedObjects.push(ro);
    this.newRemovedObjects.push(ro);
    if (regrowTicks > 0) {
      if (kind === "tree") {
        this.treeRegrow.set(k, {
          i,
          j,
          stage: 0,
          nextStageTick: this.tick + regrowTicks,
        });
      } else {
        this.regrow.set(k, this.tick + regrowTicks);
      }
    }
    return true;
  }

  private objectIsThere(kind: ObjectKind, i: number, j: number): boolean {
    const k = objKey(kind, i, j);
    if (this.removedKeys.has(k)) return false;
    switch (kind) {
      case "tree": return hasTreeAt(this.seed, i, j);
      case "bush": return hasBushAt(this.seed, i, j);
      case "mushroom": return hasMushroomAt(this.seed, i, j);
      case "fish": return hasFishAt(this.seed, i, j);
      case "stone": return hasStoneAt(this.seed, i, j);
      case "cactus": return hasCactusAt(this.seed, i, j);
      case "kreuter": return hasKreuterAt(this.seed, i, j);
    }
    return false;
  }

  /** Destroy all destructible vegetation/stone within radius. */
  private destroyVegetationIn(
    cx: number,
    cy: number,
    radius: number,
    opts: { trees?: number; bush?: number; mushroom?: number; kreuter?: number; stone?: number } = {},
  ): void {
    const r = Math.ceil(radius);
    const r2 = radius * radius;
    const ci = Math.round(cx);
    const cj = Math.round(cy);
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (di * di + dj * dj > r2) continue;
        const i = ci + di;
        const j = cj + dj;
        if (opts.trees && this.nextRand() < opts.trees) this.destroyObjectAt("tree", i, j, D.treeStageTicks);
        if (opts.bush && this.nextRand() < opts.bush) this.destroyObjectAt("bush", i, j, TICK_RATE * 120);
        if (opts.mushroom && this.nextRand() < opts.mushroom) this.destroyObjectAt("mushroom", i, j, TICK_RATE * 90);
        if (opts.kreuter && this.nextRand() < opts.kreuter) this.destroyObjectAt("kreuter", i, j, TICK_RATE * 150);
        if (opts.stone && this.nextRand() < opts.stone) this.destroyObjectAt("stone", i, j, TICK_RATE * 240);
      }
    }
  }

  private extinguishCampfiresIn(cx: number, cy: number, radius: number): void {
    const r2 = radius * radius;
    const toRemove: string[] = [];
    for (const f of this.campfires.values()) {
      const dx = f.gx - cx;
      const dy = f.gy - cy;
      if (dx * dx + dy * dy <= r2) toRemove.push(f.id);
    }
    for (const id of toRemove) {
      this.campfires.delete(id);
      this.removedCampfireIds.push(id);
    }
  }

  /** Push a Catastrophe event for the client (toast + FX). */
  private pushCatastrophe(
    kind: CatastropheKind,
    cx: number,
    cy: number,
    radius: number,
    severity: CatastropheSeverity,
    durationSec: number,
    leadSec?: number,
  ): void {
    this.catastropheEvents.push({
      kind, cx, cy, radius, severity, durationSec,
      ...(leadSec !== undefined ? { leadSec } : {}),
    });
  }

  /** External trigger e.g. for debug or chain effects. */
  triggerCatastrophe(
    kind: CatastropheKind,
    cx?: number,
    cy?: number,
    severity: CatastropheSeverity = 2,
  ): boolean {
    const loc = this.pickLocationFor(kind, cx, cy);
    if (!loc) return false;
    this.startCatastrophe(kind, loc.cx, loc.cy, severity);
    return true;
  }

  /** Default location picker per catastrophe kind. */
  private pickLocationFor(
    kind: CatastropheKind,
    cx?: number,
    cy?: number,
  ): { cx: number; cy: number } | null {
    if (cx !== undefined && cy !== undefined) return { cx, cy };
    // pick around a random tribe so the event is observable
    const actives: PlayerId[] = [];
    for (let p = 0; p < MAX_PLAYERS; p++) if (this.active[p]) actives.push(p);
    let baseX = 0;
    let baseY = 0;
    if (actives.length > 0) {
      const p = actives[Math.floor(this.nextRand() * actives.length)];
      const ref = this.chiefByOwnerCache[p] ?? this.byOwnerCache[p][0];
      if (ref) {
        baseX = ref.gx;
        baseY = ref.gy;
      }
    }
    const searchR = 18;
    const filterFor = (i: number, j: number): boolean => {
      const b = biomeAt(this.seed, i, j);
      switch (kind) {
        case "flood":
          // start over/near water and spread inland in step
          return b === "lake" || b === "river";
        case "wildfire": {
          if (b !== "wald" && b !== "wiesen" && b !== "savanne") return false;
          return hasTreeAt(this.seed, i, j) &&
            !this.removedKeys.has(objKey("tree", i, j));
        }
        case "eruption":
          // tile that has a volcano nearby
          for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
              if (this.volcanoes.some(v => Math.floor(v.gx) === i + di && Math.floor(v.gy) === j + dj)) return true;
            }
          }
          return false;
        case "landslide":
          return b === "felsen" || b === "gebirge" || b === "canyon";
        case "drought":
        case "freeze":
          return isLandTile(this.seed, i, j);
        case "locusts":
          return b === "wiesen" || b === "wald" || b === "savanne";
        case "quake":
        case "meteor":
        case "storm":
        case "lightning":
        default:
          return isLandTile(this.seed, i, j);
      }
    };
    const pick = this.pickRandomTileInRange(baseX, baseY, 4, searchR, filterFor, 80) ??
      this.pickRandomTileInRange(0, 0, 6, 120, filterFor, 200);
    if (!pick) return null;
    return { cx: pick.i + 0.5, cy: pick.j + 0.5 };
  }

  /** Decide whether and what catastrophe to trigger at a season-day boundary. */
  private maybeTriggerDailyCatastrophes(): void {
    const dayIdx = Math.floor(this.gameTimeSec / DAY_LENGTH_SEC);
    if (dayIdx === this.lastCatastropheDayIdx) return;
    this.lastCatastropheDayIdx = dayIdx;
    // Schonzeit: erste 3 In-Game-Tage komplett katastrophenfrei, damit ein
    // frischer Stamm Zeit zum Hochlaufen bekommt.
    if (dayIdx < 3) return;
    const season = seasonAt(this.gameTimeSec);
    // Pro Tag wird höchstens EINE Katastrophe ausgelöst. Wir sammeln alle
    // Kandidaten mit positiver Tageschance und ziehen gewichtet einen Typ.
    // So bleibt das Verhältnis der Katastrophen-Typen erhalten, aber kein
    // Tag bekommt mehr als ein Ereignis.
    let totalChance = 0;
    const candidates: Array<{ kind: CatastropheKind; chance: number }> = [];
    for (const [kindStr, byS] of Object.entries(CATASTROPHE_DAILY_CHANCE)) {
      const kind = kindStr as CatastropheKind;
      const chance = byS[season];
      if (chance <= 0) continue;
      candidates.push({ kind, chance });
      totalChance += chance;
    }
    if (candidates.length === 0) return;
    // Wahrscheinlichkeit für "überhaupt etwas heute" entspricht 1 −
    // ∏(1 − p_i); approximation via Summe (alle p sehr klein), aber durch
    // Min(totalChance, 0.95) geclampt damit dauer-Trigger-Tage selten bleiben.
    const trigger = Math.min(totalChance, 0.95);
    if (this.nextRand() > trigger) return;
    let roll = this.nextRand() * totalChance;
    let pickedKind: CatastropheKind = candidates[0].kind;
    for (const c of candidates) {
      roll -= c.chance;
      if (roll <= 0) {
        pickedKind = c.kind;
        break;
      }
    }
    const sevRoll = this.nextRand();
    const severity: CatastropheSeverity = sevRoll > 0.92 ? 3 : sevRoll > 0.65 ? 2 : 1;
    this.triggerCatastrophe(pickedKind, undefined, undefined, severity);
  }

  /** Start a catastrophe with all kind-specific initial side effects. */
  private startCatastrophe(
    kind: CatastropheKind,
    cx: number,
    cy: number,
    severity: CatastropheSeverity,
  ): void {
    const sev = severity;
    switch (kind) {
      case "quake": {
        const radius = 4 + sev * 2;
        const dmg = 18 + sev * 22; // sev3 -> ~84 dmg
        this.aoeDamageUnits(cx, cy, radius, dmg);
        this.aoeDamageAnimals(cx, cy, radius, dmg * 0.7);
        this.destroyVegetationIn(cx, cy, radius, {
          trees: 0.25 + sev * 0.1,
          stone: 0.05,
        });
        this.extinguishCampfiresIn(cx, cy, radius * 0.5);
        // Open a few permanent cracks near the epicenter
        const cracks = 2 + sev * 2;
        for (let n = 0; n < cracks; n++) {
          const pick = this.pickRandomTileInRange(
            cx, cy, 0, radius * 0.6,
            (i, j) => isLandTile(this.seed, i, j) && !this.tileOverrides.has(`${i},${j}`),
            20,
          );
          if (pick) this.setTileOverride(pick.i, pick.j, "crack", 9999 * 60);
        }
        // Spawn a couple of new stones at rims as compensation (regrow stones)
        this.pushCatastrophe(kind, cx, cy, radius, sev, 0);
        break;
      }
      case "flood": {
        const radius = 5 + sev * 2;
        const dur = 60 + sev * 60; // 2-4 minutes
        this.activeCatastrophes.push({
          kind, cx, cy, radius, severity: sev,
          startTick: this.tick,
          endTick: this.tick + Math.ceil(dur * TICK_RATE),
        });
        // Pre-flood a tight inner ring
        const r = Math.ceil(radius);
        const r2 = radius * radius;
        for (let dj = -r; dj <= r; dj++) {
          for (let di = -r; di <= r; di++) {
            if (di * di + dj * dj > r2) continue;
            const i = Math.round(cx) + di;
            const j = Math.round(cy) + dj;
            const b = biomeAt(this.seed, i, j);
            if (b === "gebirge") continue;
            if (b === "lake" || b === "river") continue;
            const elev = di * di + dj * dj;
            if (elev <= (radius * 0.65) * (radius * 0.65)) {
              this.setTileOverride(i, j, "flood", dur);
              this.destroyObjectAt("bush", i, j, TICK_RATE * 120);
              this.destroyObjectAt("mushroom", i, j, TICK_RATE * 90);
              this.destroyObjectAt("kreuter", i, j, TICK_RATE * 150);
            }
          }
        }
        this.extinguishCampfiresIn(cx, cy, radius * 0.7);
        this.pushCatastrophe(kind, cx, cy, radius, sev, dur);
        break;
      }
      case "drought": {
        const radius = 14 + sev * 6;
        const dur = 90 + sev * 60;
        this.droughtMult = Math.max(this.droughtMult, 1 + 0.25 * sev);
        this.activeCatastrophes.push({
          kind, cx, cy, radius, severity: sev,
          startTick: this.tick,
          endTick: this.tick + Math.ceil(dur * TICK_RATE),
        });
        // Dry up small lakes inside
        const r = Math.ceil(radius);
        const r2 = radius * radius;
        for (let dj = -r; dj <= r; dj++) {
          for (let di = -r; di <= r; di++) {
            if (di * di + dj * dj > r2) continue;
            const i = Math.round(cx) + di;
            const j = Math.round(cy) + dj;
            const b = biomeAt(this.seed, i, j);
            if (b === "lake" && this.nextRand() < 0.25 + 0.15 * sev) {
              this.setTileOverride(i, j, "ash", dur);
            }
          }
        }
        this.pushCatastrophe(kind, cx, cy, radius, sev, dur);
        break;
      }
      case "freeze": {
        const radius = 12 + sev * 5;
        const dur = 80 + sev * 50;
        this.freezeMult = Math.max(this.freezeMult, 1 + 0.4 * sev);
        this.activeCatastrophes.push({
          kind, cx, cy, radius, severity: sev,
          startTick: this.tick,
          endTick: this.tick + Math.ceil(dur * TICK_RATE),
        });
        // Freeze water tiles -> ice (walkable but not drinkable)
        const r = Math.ceil(radius);
        const r2 = radius * radius;
        for (let dj = -r; dj <= r; dj++) {
          for (let di = -r; di <= r; di++) {
            if (di * di + dj * dj > r2) continue;
            const i = Math.round(cx) + di;
            const j = Math.round(cy) + dj;
            const b = biomeAt(this.seed, i, j);
            if (b === "lake" || b === "river") {
              this.setTileOverride(i, j, "ice", dur);
            }
          }
        }
        this.pushCatastrophe(kind, cx, cy, radius, sev, dur);
        break;
      }
      case "meteor": {
        const radius = 5 + sev * 3;
        const leadSec = 6;
        this.pendingMeteors.push({
          cx, cy, radius, severity: sev,
          impactTick: this.tick + Math.ceil(leadSec * TICK_RATE),
        });
        // Warning event right now
        this.pushCatastrophe(kind, cx, cy, radius, sev, 0, leadSec);
        break;
      }
      case "eruption": {
        const radius = 5 + sev * 2;
        const dur = 30 + sev * 30;
        this.activeCatastrophes.push({
          kind, cx, cy, radius, severity: sev,
          startTick: this.tick,
          endTick: this.tick + Math.ceil(dur * TICK_RATE),
        });
        // Initial damage burst
        this.aoeDamageUnits(cx, cy, radius * 0.6, 30 + sev * 25);
        this.aoeDamageAnimals(cx, cy, radius * 0.6, 25 + sev * 20);
        this.destroyVegetationIn(cx, cy, radius * 0.7, {
          trees: 0.35,
          bush: 0.5,
          mushroom: 0.6,
          kreuter: 0.6,
        });
        this.extinguishCampfiresIn(cx, cy, radius * 0.5);
        // A few permanent lava tiles near epicenter
        const lavaCount = 3 + sev * 3;
        for (let n = 0; n < lavaCount; n++) {
          const p = this.pickRandomTileInRange(cx, cy, 0, radius * 0.5,
            (i, j) => isLandTile(this.seed, i, j) && !this.tileOverrides.has(`${i},${j}`), 20);
          if (p) this.setTileOverride(p.i, p.j, "lava", 9999 * 60);
        }
        // Chain: try to start a wildfire in forest within radius
        const fireSeed = this.pickRandomTileInRange(cx, cy, radius * 0.3, radius,
          (i, j) => biomeAt(this.seed, i, j) === "wald" &&
            hasTreeAt(this.seed, i, j) && !this.removedKeys.has(objKey("tree", i, j)), 30);
        if (fireSeed) this.startCatastrophe("wildfire", fireSeed.i + 0.5, fireSeed.j + 0.5, sev);
        this.pushCatastrophe(kind, cx, cy, radius, sev, dur);
        break;
      }
      case "wildfire": {
        const radius = 6 + sev * 2;
        const dur = 60 + sev * 40;
        const burning = new Map<string, number>();
        const frontier: string[] = [];
        // seed at center if tree
        const ci = Math.round(cx);
        const cj = Math.round(cy);
        const tryIgnite = (i: number, j: number): void => {
          if (!this.objectIsThere("tree", i, j)) return;
          const k = `${i},${j}`;
          if (burning.has(k)) return;
          burning.set(k, this.tick + Math.ceil(8 * TICK_RATE));
          frontier.push(k);
        };
        tryIgnite(ci, cj);
        if (frontier.length === 0) {
          // find a nearby tree
          for (let r = 1; r <= 3 && frontier.length === 0; r++) {
            for (let dj = -r; dj <= r; dj++) {
              for (let di = -r; di <= r; di++) {
                if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
                tryIgnite(ci + di, cj + dj);
                if (frontier.length) break;
              }
              if (frontier.length) break;
            }
          }
        }
        if (frontier.length === 0) return; // nothing to burn
        this.activeCatastrophes.push({
          kind, cx, cy, radius, severity: sev,
          startTick: this.tick,
          endTick: this.tick + Math.ceil(dur * TICK_RATE),
          burning, frontier,
        });
        this.pushCatastrophe(kind, cx, cy, radius, sev, dur);
        break;
      }
      case "storm": {
        const radius = 5 + sev * 2;
        const dur = 30 + sev * 25;
        const ang = this.nextRand() * Math.PI * 2;
        const speed = 0.3 + 0.15 * sev; // tiles per sec
        this.activeCatastrophes.push({
          kind, cx, cy, radius, severity: sev,
          startTick: this.tick,
          endTick: this.tick + Math.ceil(dur * TICK_RATE),
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
        });
        this.pushCatastrophe(kind, cx, cy, radius, sev, dur);
        break;
      }
      case "lightning": {
        const radius = 1.5;
        const ci = Math.round(cx);
        const cj = Math.round(cy);
        // Direct damage at center
        this.aoeDamageUnits(cx, cy, radius, 40 + sev * 25);
        this.aoeDamageAnimals(cx, cy, radius, 35 + sev * 20);
        // Hit a tree if one is there -> start a wildfire
        if (this.objectIsThere("tree", ci, cj) || this.objectIsThere("tree", ci + 1, cj) || this.objectIsThere("tree", ci, cj + 1)) {
          this.startCatastrophe("wildfire", cx, cy, Math.max(1, sev - 1) as CatastropheSeverity);
        }
        this.pushCatastrophe(kind, cx, cy, radius, sev, 0);
        break;
      }
      case "locusts": {
        const radius = 4 + sev * 2;
        const dur = 60 + sev * 30;
        const ang = this.nextRand() * Math.PI * 2;
        const speed = 0.4 + 0.2 * sev;
        this.activeCatastrophes.push({
          kind, cx, cy, radius, severity: sev,
          startTick: this.tick,
          endTick: this.tick + Math.ceil(dur * TICK_RATE),
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
        });
        this.pushCatastrophe(kind, cx, cy, radius, sev, dur);
        break;
      }
      case "landslide": {
        const radius = 3 + sev;
        const dur = 8 + sev * 4;
        // Build a path of tiles down-slope (toward center 0,0 as proxy)
        const len = 6 + sev * 3;
        const ang = this.nextRand() * Math.PI * 2;
        const dirX = Math.cos(ang);
        const dirY = Math.sin(ang);
        const path: Array<{ i: number; j: number }> = [];
        for (let t = 0; t < len; t++) {
          path.push({
            i: Math.round(cx + dirX * t),
            j: Math.round(cy + dirY * t),
          });
        }
        this.activeCatastrophes.push({
          kind, cx, cy, radius, severity: sev,
          startTick: this.tick,
          endTick: this.tick + Math.ceil(dur * TICK_RATE),
          pathTiles: path,
          pathIdx: 0,
        });
        this.pushCatastrophe(kind, cx, cy, radius, sev, dur);
        break;
      }
    }
  }

  private stepCatastrophes(dt: number): void {
    // Pending meteors -> impact
    if (this.pendingMeteors.length > 0) {
      const stillPending: PendingMeteor[] = [];
      for (const m of this.pendingMeteors) {
        if (this.tick < m.impactTick) {
          stillPending.push(m);
          continue;
        }
        // Impact: inner kill ring + outer damage ring
        const inner = m.radius * 0.45;
        const outer = m.radius;
        this.aoeDamageUnits(m.cx, m.cy, inner, 999);
        this.aoeDamageUnits(m.cx, m.cy, outer, 35 + m.severity * 25);
        this.aoeDamageAnimals(m.cx, m.cy, outer, 50 + m.severity * 25);
        this.destroyVegetationIn(m.cx, m.cy, outer, {
          trees: 0.9, bush: 0.9, mushroom: 0.9, kreuter: 0.9, stone: 0.3,
        });
        this.extinguishCampfiresIn(m.cx, m.cy, outer);
        // Permanent crater (felsen/rock) tiles
        const cR = Math.ceil(inner);
        for (let dj = -cR; dj <= cR; dj++) {
          for (let di = -cR; di <= cR; di++) {
            if (di * di + dj * dj > inner * inner) continue;
            const i = Math.round(m.cx) + di;
            const j = Math.round(m.cy) + dj;
            if (biomeAt(this.seed, i, j) === "gebirge") continue;
            this.setTileOverride(i, j, "ash", 9999 * 60);
          }
        }
      }
      this.pendingMeteors = stillPending;
    }

    // Reset per-step multipliers (will be re-set by active drought/freeze)
    this.droughtMult = 1;
    this.freezeMult = 1;

    const stillActive: ActiveCatastrophe[] = [];
    for (const c of this.activeCatastrophes) {
      const expired = this.tick >= c.endTick;
      switch (c.kind) {
        case "flood": {
          if (!expired) {
            this.aoeDamageUnits(c.cx, c.cy, c.radius * 0.5, 3 * dt);
            this.aoeDamageAnimals(c.cx, c.cy, c.radius * 0.5, 2 * dt);
          }
          break;
        }
        case "drought": {
          if (!expired) {
            this.droughtMult = Math.max(this.droughtMult, 1 + 0.25 * c.severity);
            // small chance to burn out a bush/kreuter per tick (rare)
            if (this.nextRand() < 0.02 * dt) {
              const p = this.pickRandomTileInRange(c.cx, c.cy, 0, c.radius,
                (i, j) => hasBushAt(this.seed, i, j) && !this.removedKeys.has(objKey("bush", i, j)), 10);
              if (p) this.destroyObjectAt("bush", p.i, p.j, TICK_RATE * 240);
            }
            if (this.nextRand() < 0.02 * dt) {
              const p = this.pickRandomTileInRange(c.cx, c.cy, 0, c.radius,
                (i, j) => hasKreuterAt(this.seed, i, j) && !this.removedKeys.has(objKey("kreuter", i, j)), 10);
              if (p) this.destroyObjectAt("kreuter", p.i, p.j, TICK_RATE * 240);
            }
          }
          break;
        }
        case "freeze": {
          if (!expired) {
            this.freezeMult = Math.max(this.freezeMult, 1 + 0.4 * c.severity);
            // Damage units in radius that are NOT at a campfire
            const r2 = c.radius * c.radius;
            const dmg = (1 + c.severity * 0.8) * dt;
            for (const u of this.units.values()) {
              if (u.hp <= 0) continue;
              const dx = u.gx - c.cx;
              const dy = u.gy - c.cy;
              if (dx * dx + dy * dy > r2) continue;
              if (this.unitAtAnyFire(u) || this.nearVolcanoNight(u.gx, u.gy, 3)) continue;
              const applied = Math.min(dmg, u.hp);
              u.hp = Math.max(0, u.hp - dmg);
              if (applied > 0.5) this.pushDamage(applied, u.gx, u.gy);
            }
          }
          break;
        }
        case "eruption": {
          if (!expired) {
            // Periodic lava bomb landings within radius
            if (this.nextRand() < 0.6 * dt) {
              const p = this.pickRandomTileInRange(c.cx, c.cy, 0, c.radius,
                () => true, 10);
              if (p) {
                this.aoeDamageUnits(p.i + 0.5, p.j + 0.5, 1.5, 18 + c.severity * 10);
                this.aoeDamageAnimals(p.i + 0.5, p.j + 0.5, 1.5, 15 + c.severity * 8);
                this.destroyObjectAt("tree", p.i, p.j, D.treeStageTicks);
              }
            }
          }
          break;
        }
        case "wildfire": {
          const burning = c.burning!;
          const frontier = c.frontier!;
          // Damage units inside burning tiles
          for (const k of burning.keys()) {
            const [is, js] = k.split(",");
            const i = Number(is);
            const j = Number(js);
            this.aoeDamageUnits(i + 0.5, j + 0.5, 0.8, 8 * dt);
            this.aoeDamageAnimals(i + 0.5, j + 0.5, 0.8, 6 * dt);
          }
          // Burn out finished trees
          const finished: string[] = [];
          for (const [k, outTick] of burning) {
            if (this.tick >= outTick) finished.push(k);
          }
          for (const k of finished) {
            burning.delete(k);
            const idx = frontier.indexOf(k);
            if (idx >= 0) frontier.splice(idx, 1);
            const [is, js] = k.split(",");
            const i = Number(is);
            const j = Number(js);
            this.destroyObjectAt("tree", i, j, D.treeStageTicks * 3);
            this.destroyObjectAt("bush", i, j, TICK_RATE * 240);
            this.destroyObjectAt("mushroom", i, j, TICK_RATE * 240);
            this.destroyObjectAt("kreuter", i, j, TICK_RATE * 240);
          }
          // Spread: 5% chance per frontier tile per second to a tree neighbor
          if (!expired) {
            const spreadChance = 0.18 * dt;
            const newFront: string[] = [];
            for (const k of frontier) {
              if (this.nextRand() > spreadChance) continue;
              const [is, js] = k.split(",");
              const i = Number(is);
              const j = Number(js);
              const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
              const [di, dj] = dirs[Math.floor(this.nextRand() * dirs.length)];
              const ni = i + di;
              const nj = j + dj;
              const nk = `${ni},${nj}`;
              if (burning.has(nk)) continue;
              if (!this.objectIsThere("tree", ni, nj)) continue;
              burning.set(nk, this.tick + Math.ceil(8 * TICK_RATE));
              newFront.push(nk);
            }
            frontier.push(...newFront);
          }
          // End when nothing burns anymore
          if (burning.size === 0) c.endTick = Math.min(c.endTick, this.tick);
          break;
        }
        case "storm": {
          if (!expired) {
            c.cx += (c.vx ?? 0) * dt;
            c.cy += (c.vy ?? 0) * dt;
            // Occasionally fell a tree
            if (this.nextRand() < 0.15 * dt) {
              const p = this.pickRandomTileInRange(c.cx, c.cy, 0, c.radius,
                (i, j) => hasTreeAt(this.seed, i, j) && !this.removedKeys.has(objKey("tree", i, j)), 12);
              if (p) {
                this.destroyObjectAt("tree", p.i, p.j, D.treeStageTicks);
                this.pushDamage(2, p.i + 0.5, p.j + 0.5);
              }
            }
            // Occasionally spawn a lightning strike inside
            if (this.nextRand() < 0.1 * dt) {
              const p = this.pickRandomTileInRange(c.cx, c.cy, 0, c.radius,
                () => true, 8);
              if (p) this.startCatastrophe("lightning", p.i + 0.5, p.j + 0.5, c.severity);
            }
          }
          break;
        }
        case "locusts": {
          if (!expired) {
            c.cx += (c.vx ?? 0) * dt;
            c.cy += (c.vy ?? 0) * dt;
            // Aggressively destroy plant resources in the swarm radius
            const eat = 0.6 * dt; // chance per tick per kind
            if (this.nextRand() < eat) {
              const p = this.pickRandomTileInRange(c.cx, c.cy, 0, c.radius,
                (i, j) => hasBushAt(this.seed, i, j) && !this.removedKeys.has(objKey("bush", i, j)), 14);
              if (p) this.destroyObjectAt("bush", p.i, p.j, TICK_RATE * 180);
            }
            if (this.nextRand() < eat) {
              const p = this.pickRandomTileInRange(c.cx, c.cy, 0, c.radius,
                (i, j) => hasMushroomAt(this.seed, i, j) && !this.removedKeys.has(objKey("mushroom", i, j)), 14);
              if (p) this.destroyObjectAt("mushroom", p.i, p.j, TICK_RATE * 120);
            }
            if (this.nextRand() < eat) {
              const p = this.pickRandomTileInRange(c.cx, c.cy, 0, c.radius,
                (i, j) => hasKreuterAt(this.seed, i, j) && !this.removedKeys.has(objKey("kreuter", i, j)), 14);
              if (p) this.destroyObjectAt("kreuter", p.i, p.j, TICK_RATE * 180);
            }
          }
          break;
        }
        case "landslide": {
          const path = c.pathTiles ?? [];
          const idx = c.pathIdx ?? 0;
          // Advance ~1 tile per second
          const step = Math.max(1, Math.floor(dt * TICK_RATE / 8));
          for (let s = 0; s < step && (c.pathIdx ?? 0) < path.length; s++) {
            const t = path[c.pathIdx as number];
            this.aoeDamageUnits(t.i + 0.5, t.j + 0.5, c.radius, 25 + c.severity * 15);
            this.aoeDamageAnimals(t.i + 0.5, t.j + 0.5, c.radius, 20 + c.severity * 12);
            this.destroyVegetationIn(t.i + 0.5, t.j + 0.5, c.radius, {
              trees: 0.5, bush: 0.6, mushroom: 0.7, kreuter: 0.7,
            });
            if (!this.tileOverrides.has(`${t.i},${t.j}`)) {
              this.setTileOverride(t.i, t.j, "ash", 9999 * 60);
            }
            c.pathIdx = (c.pathIdx ?? 0) + 1;
          }
          if ((c.pathIdx ?? 0) >= path.length) c.endTick = Math.min(c.endTick, this.tick);
          break;
        }
      }
      if (!expired) stillActive.push(c);
      else {
        // wildfire/landslide finalize: clear overrides if any temporary marks
        // (nothing to do for now — overrides expire on their own timers)
      }
    }
    this.activeCatastrophes = stillActive;

    this.expireTileOverrides();
  }

  // Public accessors for external multipliers used by other systems
  catastropheWaterMultiplier(): number {
    return this.droughtMult;
  }
  catastropheColdMultiplier(): number {
    return this.freezeMult;
  }
}
