export const MAP_SIZE = 20;
export const TICK_RATE = 20;

export type PlayerId = 0 | 1;

export interface UnitSnapshot {
  id: string;
  owner: PlayerId;
  gx: number;
  gy: number;
  state: "idle" | "moving" | "harvesting";
  color: number;
}

export interface TreeSnapshot {
  id: string;
  i: number;
  j: number;
  alive: boolean;
}

export interface InitMessage {
  type: "init";
  playerId: PlayerId;
  mapSize: number;
  trees: TreeSnapshot[];
  units: UnitSnapshot[];
  wood: [number, number];
  names: [string, string];
}

export interface StateMessage {
  type: "state";
  tick: number;
  units: UnitSnapshot[];
  wood: [number, number];
  removedTrees: string[];
}

export interface QueuedMessage {
  type: "queued";
}

export interface OpponentLeftMessage {
  type: "opponentLeft";
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type ServerMessage =
  | InitMessage
  | StateMessage
  | QueuedMessage
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
  treeId: string;
}

export type ClientMessage = JoinCommand | MoveCommand | HarvestCommand;
