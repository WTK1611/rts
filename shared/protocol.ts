export const TICK_RATE = 20;
export const MAX_PLAYERS = 10;

export type PlayerId = number;

export interface UnitSnapshot {
  id: string;
  owner: PlayerId;
  gx: number;
  gy: number;
  state: "idle" | "moving" | "harvesting";
  color: number;
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
  footprints: Footprint[];
}

export interface StateMessage {
  type: "state";
  tick: number;
  units: UnitSnapshot[];
  resources: Resources[];
  newRemovedObjects: RemovedObject[];
  respawnedObjects: RemovedObject[];
  newFootprints: Footprint[];
}

export interface OpponentJoinedMessage {
  type: "opponentJoined";
  playerId: PlayerId;
  name: string;
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

export type ClientMessage = JoinCommand | MoveCommand | HarvestCommand;
