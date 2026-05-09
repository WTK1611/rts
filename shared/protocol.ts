export const TICK_RATE = 20;
export const MAX_PLAYERS = 10;
export const MAX_TRIBE_SIZE = 12;

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

export function emptyResources(): Resources {
  return {
    holz: 0, wasser: 0, beeren: 0, pilze: 0,
    fleisch: 0, fisch: 0, stein: 0,
  };
}

export type ObjectKind = "tree" | "bush" | "mushroom" | "fish" | "stone";

export type AnimalKind =
  | "hare"
  | "reindeer"
  | "megaloceros"
  | "bison"
  | "caveLion"
  | "mammoth";

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

export interface RemovedObject {
  kind: ObjectKind;
  i: number;
  j: number;
}

export interface CampfireSnapshot {
  id: string;
  owner: PlayerId;
  gx: number;
  gy: number;
  fuel: number;
}

export const CAMPFIRE_RANGE = 2.5;

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

export const ARTIFACT_DISCOVERY_RADIUS = 4;

export interface Footprint {
  o: PlayerId;
  i: number;
  j: number;
  t: number;
}

export const FOOTPRINT_LIFETIME_TICKS = TICK_RATE * 25;

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
  botSlots: PlayerId[];
  footprints: Footprint[];
  animals: AnimalSnapshot[];
  campfires: CampfireSnapshot[];
  tribeCounts: number[];
  artifacts: ArtifactSnapshot[];
}

export interface EncounterEvent {
  a: PlayerId;
  b: PlayerId;
  transfersAtoB: number;
  transfersBtoA: number;
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
}

export interface OpponentJoinedMessage {
  type: "opponentJoined";
  playerId: PlayerId;
  name: string;
  language: string;
  units: UnitSnapshot[];
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

export type ServerMessage =
  | InitMessage
  | StateMessage
  | OpponentJoinedMessage
  | OpponentLeftMessage
  | ErrorMessage
  | LeaderboardMessage;

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

export type ClientMessage =
  | JoinCommand
  | MoveCommand
  | HarvestCommand
  | HuntCommand
  | IgniteCampfireCommand
  | SubmitScoreCommand
  | FetchLeaderboardCommand;
