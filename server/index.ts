import { WebSocketServer, WebSocket } from "ws";
import { Sim } from "./sim";
import {
  AnimalSnapshot,
  ClientMessage,
  MAX_PLAYERS,
  PlayerId,
  ServerMessage,
  TICK_RATE,
  UnitSnapshot,
} from "../shared/protocol";

interface PlayerSlot {
  ws: WebSocket;
  name: string;
  id: PlayerId;
}

const ANIMAL_VIEW_RADIUS = 10;
const ANIMAL_VIEW_RADIUS_SQ = ANIMAL_VIEW_RADIUS * ANIMAL_VIEW_RADIUS;

const world = {
  sim: new Sim((Date.now() ^ Math.floor(Math.random() * 0xffffff)) >>> 0),
  players: new Array<PlayerSlot | null>(MAX_PLAYERS).fill(null),
  lastTick: Date.now(),
  knownAnimals: Array.from(
    { length: MAX_PLAYERS },
    () => new Set<string>(),
  ),
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

function visibleAnimalsFor(
  ownerId: PlayerId,
  units: UnitSnapshot[],
  allAnimals: AnimalSnapshot[],
): AnimalSnapshot[] {
  const myUnits: UnitSnapshot[] = [];
  for (const u of units) if (u.owner === ownerId) myUnits.push(u);
  if (myUnits.length === 0) return [];
  const out: AnimalSnapshot[] = [];
  for (const a of allAnimals) {
    for (const u of myUnits) {
      const dx = a.gx - u.gx;
      const dy = a.gy - u.gy;
      if (dx * dx + dy * dy <= ANIMAL_VIEW_RADIUS_SQ) {
        out.push(a);
        break;
      }
    }
  }
  return out;
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

  const allUnits = world.sim.unitsSnapshot();
  const allAnimals = world.sim.animalsSnapshot();
  const visibleAnimals = visibleAnimalsFor(slotId, allUnits, allAnimals);
  const known = world.knownAnimals[slotId];
  known.clear();
  for (const a of visibleAnimals) known.add(a.id);

  send(ws, {
    type: "init",
    playerId: slotId,
    seed: world.sim.seed,
    tick: world.sim.tick,
    units: allUnits,
    removedObjects: [...world.sim.removedObjects],
    spawn: world.sim.spawns[slotId],
    resources: world.sim.resources.map((r) => ({ ...r })),
    names: namesOf(),
    footprints: [...world.sim.footprints],
    animals: visibleAnimals,
  });

  const newUnits = allUnits.filter((u) => u.owner === slotId);
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

  const units = world.sim.unitsSnapshot();
  const allAnimals = world.sim.animalsSnapshot();
  const resources = world.sim.resources.map((r) => ({ ...r }));
  const newRemovedObjects = world.sim.consumeNewRemovedObjects();
  const respawnedObjects = world.sim.consumeRespawnedObjects();
  const newFootprints = world.sim.consumeNewFootprints();
  const deadUnitIds = world.sim.consumeDeadUnitIds();
  const newUnits = world.sim.consumeNewUnits();
  const encounters = world.sim.consumeEncounterEvents();
  // Drain the sim's per-tick removed-animal queue; per-client diff below
  // already handles deaths (dead ids land in known\visible).
  world.sim.consumeRemovedAnimalIds();
  const tickNo = world.sim.tick;

  for (const slot of world.players) {
    if (!slot) continue;
    if (slot.ws.readyState !== slot.ws.OPEN) continue;

    const visible = visibleAnimalsFor(slot.id, units, allAnimals);
    const visibleIds = new Set<string>();
    for (const a of visible) visibleIds.add(a.id);

    const known = world.knownAnimals[slot.id];
    const removedAnimalIds: string[] = [];
    for (const id of known) {
      if (!visibleIds.has(id)) removedAnimalIds.push(id);
    }
    world.knownAnimals[slot.id] = visibleIds;

    send(slot.ws, {
      type: "state",
      tick: tickNo,
      units,
      resources,
      newRemovedObjects,
      respawnedObjects,
      newFootprints,
      animals: visible,
      removedAnimalIds,
      deadUnitIds,
      newUnits,
      encounters,
    });
  }
}

setInterval(tick, 1000 / TICK_RATE);

function disconnect(ws: WebSocket): void {
  const slot = slots.get(ws);
  if (!slot) return;
  slots.delete(ws);
  world.players[slot.id] = null;
  world.knownAnimals[slot.id] = new Set();
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
    } else if (msg.type === "hunt") {
      world.sim.cmdHunt(slot.id, msg.unitIds, msg.animalId);
    }
  });

  ws.on("close", () => disconnect(ws));
  ws.on("error", () => disconnect(ws));
});
