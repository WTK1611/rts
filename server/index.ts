import { WebSocketServer, WebSocket } from "ws";
import { Sim } from "./sim";
import {
  ClientMessage,
  MAX_PLAYERS,
  PlayerId,
  ServerMessage,
  TICK_RATE,
} from "../shared/protocol";

interface PlayerSlot {
  ws: WebSocket;
  name: string;
  id: PlayerId;
}

const world = {
  sim: new Sim((Date.now() ^ Math.floor(Math.random() * 0xffffff)) >>> 0),
  players: new Array<PlayerSlot | null>(MAX_PLAYERS).fill(null),
  lastTick: Date.now(),
};

const slots = new Map<WebSocket, PlayerSlot>();

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const p of world.players) {
    if (p && p.ws.readyState === p.ws.OPEN) p.ws.send(data);
  }
}

function namesOf(): string[] {
  return world.players.map((p) => p?.name ?? "");
}

function joinPlayer(ws: WebSocket, name: string): void {
  const slotId = world.players.findIndex((p) => p === null);
  if (slotId === -1) {
    send(ws, {
      type: "error",
      message: `Welt ist voll (max. ${MAX_PLAYERS} Spieler)`,
    });
    return;
  }

  const slot: PlayerSlot = { ws, name, id: slotId };
  world.players[slotId] = slot;
  slots.set(ws, slot);
  world.sim.addPlayer(slotId);

  send(ws, {
    type: "init",
    playerId: slotId,
    seed: world.sim.seed,
    tick: world.sim.tick,
    units: world.sim.unitsSnapshot(),
    removedObjects: [...world.sim.removedObjects],
    spawn: world.sim.spawns[slotId],
    resources: world.sim.resources.map((r) => ({ ...r })),
    names: namesOf(),
    footprints: [...world.sim.footprints],
  });

  const newUnits = world.sim.unitsSnapshot().filter((u) => u.owner === slotId);
  for (const other of world.players) {
    if (!other || other.id === slotId) continue;
    send(other.ws, {
      type: "opponentJoined",
      playerId: slotId,
      name,
      units: newUnits,
    });
  }
}

function tick(): void {
  const now = Date.now();
  const dt = (now - world.lastTick) / 1000;
  world.lastTick = now;
  world.sim.step(dt);
  broadcast({
    type: "state",
    tick: world.sim.tick,
    units: world.sim.unitsSnapshot(),
    resources: world.sim.resources.map((r) => ({ ...r })),
    newRemovedObjects: world.sim.consumeNewRemovedObjects(),
    respawnedObjects: world.sim.consumeRespawnedObjects(),
    newFootprints: world.sim.consumeNewFootprints(),
  });
}

setInterval(tick, 1000 / TICK_RATE);

function disconnect(ws: WebSocket): void {
  const slot = slots.get(ws);
  if (!slot) return;
  slots.delete(ws);
  world.players[slot.id] = null;
  const removedUnitIds = world.sim.removePlayer(slot.id);
  for (const other of world.players) {
    if (!other) continue;
    send(other.ws, {
      type: "opponentLeft",
      playerId: slot.id,
      removedUnitIds,
    });
  }
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
      joinPlayer(ws, name);
      return;
    }

    const slot = slots.get(ws);
    if (!slot) return;

    if (msg.type === "move") {
      world.sim.cmdMove(slot.id, msg.unitIds, msg.i, msg.j);
    } else if (msg.type === "harvest") {
      world.sim.cmdHarvest(slot.id, msg.unitIds, msg.i, msg.j);
    }
  });

  ws.on("close", () => disconnect(ws));
  ws.on("error", () => disconnect(ws));
});
