export const TICK_RATE = 20;
export const MAX_PLAYERS = 10;
export let MAX_TRIBE_SIZE = 12;

export let MORNING_LEN_SEC = 50;
export let NOON_LEN_SEC = 30;
export let AFTERNOON_LEN_SEC = 40;
export let NIGHT_LEN_SEC = 120;
export let DAY_LENGTH_SEC =
  MORNING_LEN_SEC + NOON_LEN_SEC + AFTERNOON_LEN_SEC + NIGHT_LEN_SEC;
export let SUNSET_AT_SEC = MORNING_LEN_SEC + NOON_LEN_SEC + AFTERNOON_LEN_SEC;
export let PHASE_LENGTH_SEC = NIGHT_LEN_SEC;
export let NIGHT_CAMPFIRE_HOLZ_PER_NIGHT = 40;

export type DayPhase = "morning" | "noon" | "afternoon" | "night";

export type Season = "spring" | "summer" | "autumn" | "winter";

export const SEASON_LEN_DAYS = 4;
export const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];
export const YEAR_LEN_DAYS = SEASON_LEN_DAYS * SEASONS.length;

function dayIndexAt(timeSec: number): number {
  return Math.floor(timeSec / DAY_LENGTH_SEC);
}

export function seasonAt(timeSec: number): Season {
  const d = dayIndexAt(timeSec);
  const idx = ((d % YEAR_LEN_DAYS) + YEAR_LEN_DAYS) % YEAR_LEN_DAYS;
  return SEASONS[Math.floor(idx / SEASON_LEN_DAYS)];
}

export function dayOfSeasonAt(timeSec: number): number {
  const d = dayIndexAt(timeSec);
  const idx = ((d % YEAR_LEN_DAYS) + YEAR_LEN_DAYS) % YEAR_LEN_DAYS;
  return (idx % SEASON_LEN_DAYS) + 1;
}

export function yearAt(timeSec: number): number {
  return Math.floor(dayIndexAt(timeSec) / YEAR_LEN_DAYS) + 1;
}

// === Seasonal modifiers ===
// Night length scales (1.0 = baseline). Daylight phases scale inversely so a
// full day always equals DAY_LENGTH_SEC.
export function seasonNightFactor(season: Season): number {
  switch (season) {
    case "summer": return 0.5;   // short nights
    case "winter": return 1.6;   // long nights (capped against daylight below)
    default: return 1.0;
  }
}

// Summer: hotter -> more thirst. Winter: less.
export function seasonWaterMultiplier(season: Season): number {
  switch (season) {
    case "summer": return 1.6;
    case "winter": return 0.8;
    default: return 1.0;
  }
}

// Autumn: abundance. Faster regrow + more animal respawn budget.
export function seasonRegrowMultiplier(season: Season): number {
  return season === "autumn" ? 0.6 : 1.0;
}
export function seasonAnimalSpawnMultiplier(season: Season): number {
  switch (season) {
    case "spring": return 0.8; // Jungtiere noch klein, Bestand niedrig
    case "autumn": return 1.8; // Maximum vor Winter
    case "winter": return 0.5; // Verluste, Winterruhe
    default: return 1.0;
  }
}

// Bushes only bear berries in summer + autumn (no spring berries, no winter).
export function seasonAllowsBush(season: Season): boolean {
  return season === "summer" || season === "autumn";
}
// Mushrooms only in summer + autumn, with autumn yielding more.
export function seasonAllowsMushroom(season: Season): boolean {
  return season === "summer" || season === "autumn";
}
export function seasonMushroomYieldMultiplier(season: Season): number {
  if (season === "autumn") return 1.5;
  if (season === "summer") return 0.5;
  return 0;
}
// Herbs bloom in spring (best), good in summer, sparse in autumn, none in winter.
export function seasonAllowsKreuter(season: Season): boolean {
  return season !== "winter";
}
export function seasonKreuterYieldMultiplier(season: Season): number {
  switch (season) {
    case "spring": return 1.5;
    case "summer": return 1.0;
    case "autumn": return 0.5;
    default: return 0;
  }
}
// Fish are harder to catch in winter (under ice) and spring (laichzeit/schonzeit).
export function seasonFishCatchMultiplier(season: Season): number {
  if (season === "winter" || season === "spring") return 0.5;
  return 1.0;
}

export interface PhaseLengths {
  morning: number;
  noon: number;
  afternoon: number;
  night: number;
  sunsetAt: number;
}

export function phaseLengthsFor(season: Season): PhaseLengths {
  const baseDaylight = MORNING_LEN_SEC + NOON_LEN_SEC + AFTERNOON_LEN_SEC;
  const total = baseDaylight + NIGHT_LEN_SEC;
  // Reserve at least 10% of the day for daylight even in deep winter.
  const maxNight = total * 0.9;
  const minNight = total * 0.1;
  const wantNight = NIGHT_LEN_SEC * seasonNightFactor(season);
  const night = Math.min(maxNight, Math.max(minNight, wantNight));
  const daylight = total - night;
  const ratio = baseDaylight > 0 ? daylight / baseDaylight : 0;
  const morning = MORNING_LEN_SEC * ratio;
  const noon = NOON_LEN_SEC * ratio;
  const afternoon = AFTERNOON_LEN_SEC * ratio;
  return { morning, noon, afternoon, night, sunsetAt: morning + noon + afternoon };
}

export function phaseLengthsAt(timeSec: number): PhaseLengths {
  return phaseLengthsFor(seasonAt(timeSec));
}

export function phaseAt(timeSec: number): DayPhase {
  const t = ((timeSec % DAY_LENGTH_SEC) + DAY_LENGTH_SEC) % DAY_LENGTH_SEC;
  const p = phaseLengthsAt(timeSec);
  if (t < p.morning) return "morning";
  if (t < p.morning + p.noon) return "noon";
  if (t < p.sunsetAt) return "afternoon";
  return "night";
}

export interface ProtocolBalance {
  morningLenSec?: number;
  noonLenSec?: number;
  afternoonLenSec?: number;
  nightLenSec?: number;
  nightCampfireHolzPerNight?: number;
  maxTribeSize?: number;
  campfireRange?: number;
  artifactDiscoveryRadius?: number;
  dropPileLifetimeSec?: number;
  dropPilePickupRadius?: number;
  dropPilePickupDelaySec?: number;
  footprintLifetimeTicks?: number;
}

export function applyProtocolBalance(b: ProtocolBalance): void {
  if (typeof b.morningLenSec === "number") MORNING_LEN_SEC = b.morningLenSec;
  if (typeof b.noonLenSec === "number") NOON_LEN_SEC = b.noonLenSec;
  if (typeof b.afternoonLenSec === "number") AFTERNOON_LEN_SEC = b.afternoonLenSec;
  if (typeof b.nightLenSec === "number") NIGHT_LEN_SEC = b.nightLenSec;
  DAY_LENGTH_SEC =
    MORNING_LEN_SEC + NOON_LEN_SEC + AFTERNOON_LEN_SEC + NIGHT_LEN_SEC;
  SUNSET_AT_SEC = MORNING_LEN_SEC + NOON_LEN_SEC + AFTERNOON_LEN_SEC;
  PHASE_LENGTH_SEC = NIGHT_LEN_SEC;
  if (typeof b.nightCampfireHolzPerNight === "number") {
    NIGHT_CAMPFIRE_HOLZ_PER_NIGHT = b.nightCampfireHolzPerNight;
  }
  if (typeof b.maxTribeSize === "number") MAX_TRIBE_SIZE = b.maxTribeSize;
  if (typeof b.campfireRange === "number") CAMPFIRE_RANGE = b.campfireRange;
  if (typeof b.artifactDiscoveryRadius === "number") {
    ARTIFACT_DISCOVERY_RADIUS = b.artifactDiscoveryRadius;
  }
  if (typeof b.dropPileLifetimeSec === "number") DROP_PILE_LIFETIME_SEC = b.dropPileLifetimeSec;
  if (typeof b.dropPilePickupRadius === "number") DROP_PILE_PICKUP_RADIUS = b.dropPilePickupRadius;
  if (typeof b.dropPilePickupDelaySec === "number") {
    DROP_PILE_PICKUP_DELAY_SEC = b.dropPilePickupDelaySec;
  }
  if (typeof b.footprintLifetimeTicks === "number") {
    FOOTPRINT_LIFETIME_TICKS = b.footprintLifetimeTicks;
  }
}

export type PlayerId = number;

export type UnitGender = "m" | "f";

export type HuntWeapon = "fists" | "stones" | "club" | "spear";

export interface UnitSnapshot {
  id: string;
  owner: PlayerId;
  gx: number;
  gy: number;
  state: "idle" | "moving" | "harvesting" | "hunting";
  color: number;
  hp: number;
  hpMax: number;
  ageSec: number;
  gender: UnitGender;
  firstName: string;
  isChief: boolean;
  huntWeapon?: HuntWeapon;
  huntFacing?: 1 | -1;
}

export interface SpawnInfo {
  cx: number;
  cy: number;
}

export interface Resources {
  holz: number;
  wasser: number;
  beeren: number;
  pilze: number;
  fleisch: number;
  fisch: number;
  stein: number;
  kreuter: number;
  felle: number;
}

export const RESOURCE_KEYS: Array<keyof Resources> = [
  "holz",
  "wasser",
  "beeren",
  "pilze",
  "fleisch",
  "fisch",
  "stein",
  "kreuter",
  "felle",
];

export const RESOURCE_CAP_PER_PERSON: Resources = {
  holz: 10,
  wasser: 4,
  beeren: 5,
  pilze: 4,
  fleisch: 8,
  fisch: 4,
  stein: 5,
  kreuter: 3,
  felle: 3,
};

export function resourceCap(
  key: keyof Resources,
  tribeSize: number,
): number {
  return RESOURCE_CAP_PER_PERSON[key] * Math.max(0, tribeSize);
}

export function emptyResources(): Resources {
  return {
    holz: 0, wasser: 0, beeren: 0, pilze: 0,
    fleisch: 0, fisch: 0, stein: 0, kreuter: 0,
    felle: 0,
  };
}

export type ObjectKind = "tree" | "bush" | "mushroom" | "fish" | "stone" | "cactus" | "kreuter";

export type AnimalKind =
  | "hare"
  | "reindeer"
  | "megaloceros"
  | "bison"
  | "caveLion"
  | "mammoth"
  | "alligator"
  | "bear";

export interface AnimalSnapshot {
  id: string;
  kind: AnimalKind;
  gx: number;
  gy: number;
  hp: number;
  hpMax: number;
  state: "idle" | "wander" | "flee" | "hunt";
  maturity: number;
}

export interface FishSnapshot {
  id: string;
  gx: number;
  gy: number;
}

export interface RemovedObject {
  kind: ObjectKind;
  i: number;
  j: number;
}

export type TreeGrowthStage = 1 | 2 | 3 | 4;

export interface TreeGrowthEvent {
  i: number;
  j: number;
  stage: TreeGrowthStage;
}

export interface CampfireSnapshot {
  id: string;
  owner: PlayerId;
  gx: number;
  gy: number;
  fuel: number;
  size: number;
}

export let CAMPFIRE_RANGE = 2.5;

export type ArtifactKind = "stonehenge" | "stoneCircle" | "monolith";

export type ArtifactRewardKind =
  | "newMember"
  | "fleisch"
  | "fisch"
  | "beeren"
  | "pilze";

export interface ArtifactReward {
  kind: ArtifactRewardKind;
  amount: number;
}

export interface ArtifactSnapshot {
  id: string;
  kind: ArtifactKind;
  gx: number;
  gy: number;
  reward: ArtifactReward;
  foundBy: PlayerId | null;
}

export interface ArtifactFindEvent {
  id: string;
  finder: PlayerId;
  reward: ArtifactReward;
}

export let ARTIFACT_DISCOVERY_RADIUS = 4;

export interface DropPileSnapshot {
  id: string;
  gx: number;
  gy: number;
  resources: Resources;
  decaySec: number;
}

export let DROP_PILE_LIFETIME_SEC = 180;
export let DROP_PILE_PICKUP_RADIUS = 0.7;
export let DROP_PILE_PICKUP_DELAY_SEC = 4;

export interface Footprint {
  o: PlayerId;
  i: number;
  j: number;
  t: number;
}

export let FOOTPRINT_LIFETIME_TICKS = TICK_RATE * 25;

export interface BalancingFieldMeta {
  key: string;
  group: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export interface BalancingSnapshotMsg {
  fields: BalancingFieldMeta[];
  values: Record<string, number>;
}

export interface InitMessage {
  type: "init";
  playerId: PlayerId;
  seed: number;
  tick: number;
  units: UnitSnapshot[];
  removedObjects: RemovedObject[];
  spawn: SpawnInfo;
  resources: Resources[];
  names: string[];
  languages: string[];
  tribeNameIndices: number[];
  botSlots: PlayerId[];
  footprints: Footprint[];
  animals: AnimalSnapshot[];
  fishes: FishSnapshot[];
  campfires: CampfireSnapshot[];
  tribeCounts: number[];
  artifacts: ArtifactSnapshot[];
  dropPiles: DropPileSnapshot[];
  gameTimeSec: number;
  treeGrowth: TreeGrowthEvent[];
  tribeOrigin: PlayerId[];
  balancing: BalancingSnapshotMsg;
  resourceCapPerPerson: Resources;
  tileOverrides: TileOverrideEvent[];
}

export interface EncounterEvent {
  a: PlayerId;
  b: PlayerId;
  transfersAtoB: number;
  transfersBtoA: number;
}

export interface TribeSplit {
  from: PlayerId;
  to: PlayerId;
}

export interface ResourceFlowEvent {
  owner: PlayerId;
  resource: keyof Resources;
  amount: number;
  gx: number;
  gy: number;
}

export interface DamageEvent {
  amount: number;
  gx: number;
  gy: number;
}

export type CatastropheKind =
  | "quake"
  | "flood"
  | "drought"
  | "freeze"
  | "meteor"
  | "eruption"
  | "wildfire"
  | "storm"
  | "lightning"
  | "locusts"
  | "landslide";

export type CatastropheSeverity = 1 | 2 | 3;

export interface CatastropheEvent {
  kind: CatastropheKind;
  cx: number;
  cy: number;
  radius: number;
  severity: CatastropheSeverity;
  durationSec: number;
  // For meteors: warning lead-time before impact (s). Renders an inbound visual.
  leadSec?: number;
}

export type TileOverride = "flood" | "lava" | "ash" | "ice" | "crack";

export interface TileOverrideEvent {
  i: number;
  j: number;
  kind: TileOverride | null;
}

export const CATASTROPHE_DAILY_CHANCE: Record<CatastropheKind, Record<Season, number>> = {
  quake:     { spring: 0.02, summer: 0.02, autumn: 0.02, winter: 0.02 },
  flood:     { spring: 0.18, summer: 0.01, autumn: 0.06, winter: 0.02 },
  drought:   { spring: 0.00, summer: 0.18, autumn: 0.04, winter: 0.00 },
  freeze:    { spring: 0.00, summer: 0.00, autumn: 0.03, winter: 0.20 },
  meteor:    { spring: 0.005, summer: 0.005, autumn: 0.005, winter: 0.005 },
  eruption:  { spring: 0.03, summer: 0.04, autumn: 0.03, winter: 0.03 },
  wildfire:  { spring: 0.03, summer: 0.22, autumn: 0.12, winter: 0.00 },
  storm:     { spring: 0.10, summer: 0.06, autumn: 0.14, winter: 0.05 },
  lightning: { spring: 0.04, summer: 0.06, autumn: 0.05, winter: 0.01 },
  locusts:   { spring: 0.00, summer: 0.06, autumn: 0.04, winter: 0.00 },
  landslide: { spring: 0.06, summer: 0.02, autumn: 0.03, winter: 0.02 },
};

export const CATASTROPHE_KINDS: CatastropheKind[] = [
  "quake", "flood", "drought", "freeze", "meteor", "eruption",
  "wildfire", "storm", "lightning", "locusts", "landslide",
];

export interface StateMessage {
  type: "state";
  tick: number;
  units: UnitSnapshot[];
  resources: Resources[];
  newRemovedObjects: RemovedObject[];
  respawnedObjects: RemovedObject[];
  newFootprints: Footprint[];
  animals: AnimalSnapshot[];
  removedAnimalIds: string[];
  fishes: FishSnapshot[];
  removedFishIds: string[];
  deadUnitIds: string[];
  outOfSightUnitIds: string[];
  newUnits: UnitSnapshot[];
  encounters: EncounterEvent[];
  growthProgress: number[];
  growthActive: boolean[];
  extinctTribes: PlayerId[];
  respawnedTribes: PlayerId[];
  campfires: CampfireSnapshot[];
  removedCampfireIds: string[];
  tribeCounts: number[];
  artifactFinds: ArtifactFindEvent[];
  tribeSplits: TribeSplit[];
  resourceFlows: ResourceFlowEvent[];
  damageEvents: DamageEvent[];
  dropPiles: DropPileSnapshot[];
  removedDropPileIds: string[];
  serverTickMs?: number;
  animalCount?: number;
  unitCount?: number;
  fishCount?: number;
  gameTimeSec: number;
  treeGrowthEvents: TreeGrowthEvent[];
  tribeOrigin: PlayerId[];
  winnerOrigin: PlayerId | null;
  catastropheEvents: CatastropheEvent[];
  tileOverrides: TileOverrideEvent[];
}

export interface OpponentJoinedMessage {
  type: "opponentJoined";
  playerId: PlayerId;
  name: string;
  language: string;
  tribeNameIndex?: number;
  units: UnitSnapshot[];
  isBot?: boolean;
  splitFrom?: PlayerId;
}

export interface OpponentLeftMessage {
  type: "opponentLeft";
  playerId: PlayerId;
  removedUnitIds: string[];
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export interface ScoreEntry {
  name: string;
  timeSec: number;
  collected: number;
  tribe: number;
  score: number;
  ts: number;
}

export interface LeaderboardMessage {
  type: "leaderboard";
  entries: ScoreEntry[];
  myRank: number;
  myEntryTs: number;
}

export interface BalancingUpdateMessage {
  type: "balancingUpdate";
  values: Record<string, number>;
  resourceCapPerPerson?: Resources;
}

export type ServerMessage =
  | InitMessage
  | StateMessage
  | OpponentJoinedMessage
  | OpponentLeftMessage
  | ErrorMessage
  | LeaderboardMessage
  | BalancingUpdateMessage;

export interface JoinCommand {
  type: "join";
  name: string;
  language?: string;
}

export interface MoveCommand {
  type: "move";
  unitIds: string[];
  i: number;
  j: number;
}

export interface HarvestCommand {
  type: "harvest";
  unitIds: string[];
  i: number;
  j: number;
}

export interface HuntCommand {
  type: "hunt";
  unitIds: string[];
  animalId: string;
}

export interface IgniteCampfireCommand {
  type: "igniteCampfire";
  i: number;
  j: number;
}

export interface SubmitScoreCommand {
  type: "submitScore";
  entry: ScoreEntry;
}

export interface FetchLeaderboardCommand {
  type: "fetchLeaderboard";
}

export interface SetBalancingCommand {
  type: "setBalancing";
  updates: Array<{ key: string; value: number }>;
}

export interface ResetBalancingCommand {
  type: "resetBalancing";
}

export type ClientMessage =
  | JoinCommand
  | MoveCommand
  | HarvestCommand
  | HuntCommand
  | IgniteCampfireCommand
  | SubmitScoreCommand
  | FetchLeaderboardCommand
  | SetBalancingCommand
  | ResetBalancingCommand;
