import { WebSocketServer, WebSocket } from "ws";
import { Sim } from "./sim";
import {
  ClientMessage,
  PlayerId,
  ServerMessage,
  TICK_RATE,
  MAP_SIZE,
} from "../shared/protocol";

interface PlayerSlot {
  ws: WebSocket;
  name: string;
  id: PlayerId;
  match: Match | null;
}

interface Match {
  players: [PlayerSlot, PlayerSlot];
  sim: Sim;
  loop: NodeJS.Timeout;
  lastTick: number;
}

let waiting: PlayerSlot | null = null;
const matches = new Set<Match>();
const slots = new Map<WebSocket, PlayerSlot>();

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(match: Match, msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const p of match.players) {
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(data);
  }
}

function startMatch(a: PlayerSlot, b: PlayerSlot): void {
  a.id = 0;
  b.id = 1;
  const sim = new Sim(Date.now() & 0xffffffff);
  const match: Match = {
    players: [a, b],
    sim,
    lastTick: Date.now(),
    loop: setInterval(() => tickMatch(match), 1000 / TICK_RATE),
  };
  a.match = match;
  b.match = match;
  matches.add(match);

  const names: [string, string] = [a.name, b.name];
  for (const p of match.players) {
    send(p.ws, {
      type: "init",
      playerId: p.id,
      mapSize: MAP_SIZE,
      trees: sim.treesSnapshot(),
      units: sim.unitsSnapshot(),
      wood: [...sim.wood] as [number, number],
      names,
    });
  }
}

function tickMatch(match: Match): void {
  const now = Date.now();
  const dt = (now - match.lastTick) / 1000;
  match.lastTick = now;
  match.sim.step(dt);
  broadcast(match, {
    type: "state",
    tick: match.sim.tick,
    units: match.sim.unitsSnapshot(),
    wood: [...match.sim.wood] as [number, number],
    removedTrees: match.sim.consumeRemovedTrees(),
  });
}

function endMatch(match: Match, leaver: PlayerSlot | null): void {
  clearInterval(match.loop);
  matches.delete(match);
  for (const p of match.players) {
    p.match = null;
    if (p !== leaver) send(p.ws, { type: "opponentLeft" });
  }
}

function disconnect(ws: WebSocket): void {
  const slot = slots.get(ws);
  if (!slot) return;
  slots.delete(ws);
  if (waiting === slot) waiting = null;
  if (slot.match) endMatch(slot.match, slot);
}

const port = Number(process.env.PORT ?? 8787);
const wss = new WebSocketServer({ port });
console.log(`[rts-server] listening on ws://0.0.0.0:${port}`);

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      send(ws, { type: "error", message: "invalid json" });
      return;
    }

    if (msg.type === "join") {
      if (slots.has(ws)) {
        send(ws, { type: "error", message: "already joined" });
        return;
      }
      const name = (msg.name || "Spieler").trim().slice(0, 20) || "Spieler";
      const slot: PlayerSlot = { ws, name, id: 0, match: null };
      slots.set(ws, slot);

      if (waiting && waiting.ws.readyState === waiting.ws.OPEN) {
        const opp = waiting;
        waiting = null;
        startMatch(opp, slot);
      } else {
        waiting = slot;
        send(ws, { type: "queued" });
      }
      return;
    }

    const slot = slots.get(ws);
    if (!slot || !slot.match) return;

    if (msg.type === "move") {
      slot.match.sim.cmdMove(slot.id, msg.unitIds, msg.i, msg.j);
    } else if (msg.type === "harvest") {
      slot.match.sim.cmdHarvest(slot.id, msg.unitIds, msg.treeId);
    }
  });

  ws.on("close", () => disconnect(ws));
  ws.on("error", () => disconnect(ws));
});
