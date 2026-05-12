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

export function phaseAt(timeSec: number): DayPhase {
  const t = ((timeSec % DAY_LENGTH_SEC) + DAY_LENGTH_SEC) % DAY_LENGTH_SEC;
  if (t < MORNING_LEN_SEC) return "morning";
  if (t < MORNING_LEN_SEC + NOON_LEN_SEC) return "noon";
  if (t < SUNSET_AT_SEC) return "afternoon";
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
}

export const RESOURCE_KEYS: Array<keyof Resources> = [
  "holz",
  "wasser",
  "beeren",
  "pilze",
  "fleisch",
  "fisch",
  "stein",
];

export const RESOURCE_CAP_PER_PERSON: Resources = {
  holz: 10,
  wasser: 4,
  beeren: 5,
  pilze: 4,
  fleisch: 8,
  fisch: 4,
  stein: 5,
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
    fleisch: 0, fisch: 0, stein: 0,
  };
}

export type ObjectKind = "tree" | "bush" | "mushroom" | "fish" | "stone" | "cactus";

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
