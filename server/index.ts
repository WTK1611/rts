import { WebSocketServer, WebSocket } from "ws";
import { Sim } from "./sim";
import { AIBot } from "./aiBot";
import {
  AnimalSnapshot,
  ClientMessage,
  MAX_PLAYERS,
  PlayerId,
  ServerMessage,
  TICK_RATE,
  UnitSnapshot,
} from "../shared/protocol";
import { Language, languageForSlot } from "../shared/names";

interface PlayerSlot {
  ws: WebSocket | null;
  name: string;
  id: PlayerId;
  language: Language;
  bot?: AIBot;
}

const BOT_COUNT = 3;

const TRIBE_NAMES_BY_LANG: Record<Language, string[]> = {
  de: [
    "Wölfe", "Bären", "Adler", "Mammuts", "Falken",
    "Wisente", "Luchse", "Raben", "Hirsche", "Eber",
    "Füchse", "Steinböcke",
  ],
  en: [
    "Wolves", "Bears", "Eagles", "Hawks", "Lions",
    "Stags", "Ravens", "Bison", "Lynx", "Boars",
    "Foxes", "Ibex",
  ],
  it: [
    "Lupi", "Orsi", "Aquile", "Falchi", "Cervi",
    "Corvi", "Linci", "Bisonti", "Cinghiali", "Volpi",
    "Stambecchi", "Camosci",
  ],
  es: [
    "Lobos", "Osos", "Águilas", "Halcones", "Ciervos",
    "Cuervos", "Linces", "Bisontes", "Jabalíes", "Zorros",
    "Íbices", "Sarrios",
  ],
  fr: [
    "Loups", "Ours", "Aigles", "Faucons", "Cerfs",
    "Corbeaux", "Lynx", "Bisons", "Sangliers", "Renards",
    "Bouquetins", "Chamois",
  ],
};

function pickBotNames(
  count: number,
): Array<{ name: string; language: Language }> {
  const pool: Array<{ name: string; language: Language }> = [];
  for (const lang of Object.keys(TRIBE_NAMES_BY_LANG) as Language[]) {
    for (const name of TRIBE_NAMES_BY_LANG[lang]) {
      pool.push({ name, language: lang });
    }
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

const ANIMAL_VIEW_RADIUS = 10;
const ANIMAL_VIEW_RADIUS_SQ = ANIMAL_VIEW_RADIUS * ANIMAL_VIEW_RADIUS;
const UNIT_VIEW_RADIUS = 10;
const UNIT_VIEW_RADIUS_SQ = UNIT_VIEW_RADIUS * UNIT_VIEW_RADIUS;

const world = {
  sim: new Sim((Date.now() ^ Math.floor(Math.random() * 0xffffff)) >>> 0),
  players: new Array<PlayerSlot | null>(MAX_PLAYERS).fill(null),
  lastTick: Date.now(),
  knownAnimals: Array.from(
    { length: MAX_PLAYERS },
    () => new Set<string>(),
  ),
  knownUnits: Array.from(
    { length: MAX_PLAYERS },
    () => new Set<string>(),
  ),
  bots: [] as AIBot[],
};

const slots = new Map<WebSocket, PlayerSlot>();

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const p of world.players) {
    if (!p || !p.ws) continue;
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(data);
  }
}

function spawnBots(): void {
  const picks = pickBotNames(BOT_COUNT);
  for (const pick of picks) {
    let slotId = -1;
    for (let i = MAX_PLAYERS - 1; i >= 0; i--) {
      if (world.players[i] === null) {
        slotId = i;
        break;
      }
    }
    if (slotId === -1) return;
    world.sim.addPlayer(slotId, pick.language);
    const bot = new AIBot(world.sim, slotId);
    world.players[slotId] = {
      ws: null,
      name: pick.name,
      id: slotId,
      language: pick.language,
      bot,
    };
    world.bots.push(bot);
  }
}

function namesOf(): string[] {
  return world.players.map((p) => p?.name ?? "");
}

function languagesOf(): string[] {
  return world.players.map((p) => p?.language ?? "");
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

function botSlotIds(): PlayerId[] {
  const out: PlayerId[] = [];
  for (const p of world.players) {
    if (p && p.bot) out.push(p.id);
  }
  return out;
}

function visibleUnitsFor(
  ownerId: PlayerId,
  units: UnitSnapshot[],
): UnitSnapshot[] {
  const botOwners = new Set(botSlotIds());
  const myUnits: UnitSnapshot[] = [];
  const others: UnitSnapshot[] = [];
  const out: UnitSnapshot[] = [];
  for (const u of units) {
    if (u.owner === ownerId) {
      myUnits.push(u);
      out.push(u);
    } else if (botOwners.has(u.owner)) {
      out.push(u);
    } else {
      others.push(u);
    }
  }
  if (myUnits.length === 0) return out;
  for (const a of others) {
    for (const u of myUnits) {
      const dx = a.gx - u.gx;
      const dy = a.gy - u.gy;
      if (dx * dx + dy * dy <= UNIT_VIEW_RADIUS_SQ) {
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

  const language = languageForSlot(world.sim.seed, slotId);
  const slot: PlayerSlot = { ws, name, id: slotId, language };
  world.players[slotId] = slot;
  slots.set(ws, slot);
  world.sim.addPlayer(slotId, language);

  const allUnits = world.sim.unitsSnapshot();
  const allAnimals = world.sim.animalsSnapshot();
  const visibleAnimals = visibleAnimalsFor(slotId, allUnits, allAnimals);
  const known = world.knownAnimals[slotId];
  known.clear();
  for (const a of visibleAnimals) known.add(a.id);

  const knownU = world.knownUnits[slotId];
  knownU.clear();
  for (const u of allUnits) knownU.add(u.id);

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
    languages: languagesOf(),
    botSlots: botSlotIds(),
    footprints: [...world.sim.footprints],
    animals: visibleAnimals,
  });

  const newUnits = allUnits.filter((u) => u.owner === slotId);
  for (const other of world.players) {
    if (!other || other.id === slotId) continue;
    if (!other.ws) continue;
    send(other.ws, {
      type: "opponentJoined",
      playerId: slotId,
      name,
      language,
      units: newUnits,
    });
    const otherKnown = world.knownUnits[other.id];
    for (const u of newUnits) otherKnown.add(u.id);
  }
}

function tick(): void {
  const now = Date.now();
  const dt = (now - world.lastTick) / 1000;
  world.lastTick = now;
  for (const bot of world.bots) bot.update(dt);
  world.sim.step(dt);

  const units = world.sim.unitsSnapshot();
  const allAnimals = world.sim.animalsSnapshot();
  const resources = world.sim.resources.map((r) => ({ ...r }));
  const newRemovedObjects = world.sim.consumeNewRemovedObjects();
  const respawnedObjects = world.sim.consumeRespawnedObjects();
  const newFootprints = world.sim.consumeNewFootprints();
  const deadUnitIds = world.sim.consumeDeadUnitIds();
  const extinctTribes = world.sim.consumeExtinctTribes();
  const newUnits = world.sim.consumeNewUnits();
  const encounters = world.sim.consumeEncounterEvents();
  const growth = world.sim.growthSnapshot();
  // Drain the sim's per-tick removed-animal queue; per-client diff below
  // already handles deaths (dead ids land in known\visible).
  world.sim.consumeRemovedAnimalIds();
  const tickNo = world.sim.tick;

  for (const slot of world.players) {
    if (!slot) continue;
    if (!slot.ws) continue;
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

    const visibleUnits = visibleUnitsFor(slot.id, units);
    const visibleUnitIds = new Set<string>();
    for (const u of visibleUnits) visibleUnitIds.add(u.id);

    const knownU = world.knownUnits[slot.id];
    const outOfSightUnitIds: string[] = [];
    const deadSet = new Set(deadUnitIds);
    for (const id of knownU) {
      if (!visibleUnitIds.has(id) && !deadSet.has(id)) {
        outOfSightUnitIds.push(id);
      }
    }
    world.knownUnits[slot.id] = visibleUnitIds;

    const visibleNewUnits: UnitSnapshot[] = [];
    for (const nu of newUnits) {
      if (nu.owner === slot.id || visibleUnitIds.has(nu.id)) {
        visibleNewUnits.push(nu);
      }
    }

    send(slot.ws, {
      type: "state",
      tick: tickNo,
      units: visibleUnits,
      resources,
      newRemovedObjects,
      respawnedObjects,
      newFootprints,
      animals: visible,
      removedAnimalIds,
      deadUnitIds,
      outOfSightUnitIds,
      newUnits: visibleNewUnits,
      encounters,
      growthProgress: growth.progress,
      growthActive: growth.active,
      extinctTribes,
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
  world.knownUnits[slot.id] = new Set();
  const removedUnitIds = world.sim.removePlayer(slot.id);
  for (const other of world.players) {
    if (!other || !other.ws) continue;
    send(other.ws, {
      type: "opponentLeft",
      playerId: slot.id,
      removedUnitIds,
    });
  }
}

spawnBots();

const port = Number(process.env.PORT ?? 8787);
const wss = new WebSocketServer({ port });
console.log(`[rts-server] listening on ws://0.0.0.0:${port}`);
console.log(`[rts-server] ${world.bots.length} KI-Stämme aktiv`);

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
