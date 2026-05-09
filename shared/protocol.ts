export const TICK_RATE = 20;
export const MAX_PLAYERS = 10;
export const MAX_TRIBE_SIZE = 12;

export type PlayerId = number;

export type UnitGender = "m" | "f";

export interface UnitSnapshot {
  id: string;
  owner: PlayerId;
  gx: number;
  gy: number;
  state: "idle" | "moving" | "harvesting";
  color: number;
  hp: number;
  hpMax: number;
  ageSec: number;
  gender: UnitGender;
  firstName: string;
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
}

export interface RemovedObject {
  kind: ObjectKind;
  i: number;
  j: number;
}

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
  footprints: Footprint[];
  animals: AnimalSnapshot[];
}

export interface EncounterEvent {
  a: PlayerId;
  b: PlayerId;
  bornForA: boolean;
  bornForB: boolean;
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

export type ServerMessage =
  | InitMessage
  | StateMessage
  | OpponentJoinedMessage
  | OpponentLeftMessage
  | ErrorMessage;

export interface JoinCommand {
  type: "join";
  name: string;
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

export type ClientMessage = JoinCommand | MoveCommand | HarvestCommand | HuntCommand;
