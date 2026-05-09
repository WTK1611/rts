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

export interface InitMessage {
  type: "init";
  playerId: PlayerId;
  seed: number;
  units: UnitSnapshot[];
  destroyedTrees: string[];
  spawn: SpawnInfo;
  wood: number[];
  names: string[];
}

export interface StateMessage {
  type: "state";
  tick: number;
  units: UnitSnapshot[];
  wood: number[];
  removedTrees: string[];
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
  treeId: string;
}

export type ClientMessage = JoinCommand | MoveCommand | HarvestCommand;
