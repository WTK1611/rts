import { WebSocketServer, WebSocket } from "ws";
import { Sim } from "./sim";
import { AIBot } from "./aiBot";
import {
  AnimalSnapshot,
  BalancingSnapshotMsg,
  ClientMessage,
  FishSnapshot,
  MAX_PLAYERS,
  PlayerId,
  RESOURCE_CAP_PER_PERSON,
  RESOURCE_KEYS,
  Resources,
  ScoreEntry,
  ServerMessage,
  TICK_RATE,
  UnitSnapshot,
} from "../shared/protocol";
import {
  Language,
  LANGUAGES,
  NameLanguage,
  NAME_LANGUAGES,
  TRIBE_NAME_POOL_SIZE,
  languageForSlot,
  tribeNameAt,
} from "../shared/names";
import {
  addScore,
  loadBalancing,
  rankFor,
  resetBalancing as dbResetBalancing,
  saveBalancing,
  topScores,
} from "./db";
import {
  ALL_DEFS,
  applyValue,
  defOf,
  getCurrentValue,
  hydrateFromMap,
  isValidKey,
} from "./balancing";

// Hydrate live balancing state from SQLite overrides on startup.
hydrateFromMap(loadBalancing());

function balancingSnapshotMsg(): BalancingSnapshotMsg {
  const values: Record<string, number> = {};
  for (const d of ALL_DEFS) {
    const v = getCurrentValue(d.key);
    values[d.key] = v ?? d.defaultValue;
  }
  return {
    fields: ALL_DEFS.map((d) => ({
      key: d.key,
      group: d.group,
      label: d.label,
      min: d.min,
      max: d.max,
      step: d.step,
      defaultValue: d.defaultValue,
    })),
    values,
  };
}

function resourceCapsSnapshot(): Resources {
  return {
    holz: RESOURCE_CAP_PER_PERSON.holz,
    wasser: RESOURCE_CAP_PER_PERSON.wasser,
    beeren: RESOURCE_CAP_PER_PERSON.beeren,
    pilze: RESOURCE_CAP_PER_PERSON.pilze,
    fleisch: RESOURCE_CAP_PER_PERSON.fleisch,
    fisch: RESOURCE_CAP_PER_PERSON.fisch,
    stein: RESOURCE_CAP_PER_PERSON.stein,
  };
}

const LEADERBOARD_TOP_N = 50;

function sanitizeScore(raw: unknown): ScoreEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const name = typeof e.name === "string" ? e.name.trim().slice(0, 20) : "";
  const timeSec = typeof e.timeSec === "number" ? Math.max(0, Math.floor(e.timeSec)) : -1;
  const collected = typeof e.collected === "number" ? Math.max(0, Math.floor(e.collected)) : -1;
  const tribe = typeof e.tribe === "number" ? Math.max(0, Math.floor(e.tribe)) : -1;
  const score = typeof e.score === "number" ? Math.max(0, Math.floor(e.score)) : -1;
  const ts = typeof e.ts === "number" && Number.isFinite(e.ts) ? Math.floor(e.ts) : Date.now();
  if (!name || timeSec < 0 || collected < 0 || tribe < 0 || score < 0) return null;
  return { name, timeSec, collected, tribe, score, ts };
}

interface PlayerSlot {
  ws: WebSocket | null;
  name: string;
  id: PlayerId;
  language: NameLanguage;
  tribeNameIndex: number; // -1 for human players (use typed name)
  bot?: AIBot;
}

const BOT_COUNT = Number(process.env.RTS_BOT_COUNT ?? 5);
const BOT_RESPAWN_DELAY_MS = 12000;
const pendingBotRespawns: Map<PlayerId, number> = new Map();

function pickBotTribes(
  count: number,
): Array<{ tribeNameIndex: number; language: NameLanguage }> {
  const indices = Array.from({ length: TRIBE_NAME_POOL_SIZE }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const out: Array<{ tribeNameIndex: number; language: NameLanguage }> = [];
  for (let i = 0; i < count; i++) {
    const tribeNameIndex = indices[i % indices.length];
    const language =
      NAME_LANGUAGES[Math.floor(Math.random() * NAME_LANGUAGES.length)];
    out.push({ tribeNameIndex, language });
  }
  return out;
}

function pickFreshTribeNameIndex(): number {
  const used = new Set<number>();
  for (const p of world.players) {
    if (p && p.tribeNameIndex >= 0) used.add(p.tribeNameIndex);
  }
  const free: number[] = [];
  for (let i = 0; i < TRIBE_NAME_POOL_SIZE; i++) {
    if (!used.has(i)) free.push(i);
  }
  if (free.length > 0) return free[Math.floor(Math.random() * free.length)];
  return Math.floor(Math.random() * TRIBE_NAME_POOL_SIZE);
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
  knownCampfires: Array.from(
    { length: MAX_PLAYERS },
    () => new Set<string>(),
  ),
  knownFishes: Array.from(
    { length: MAX_PLAYERS },
    () => new Set<string>(),
  ),
  bots: [] as AIBot[],
  tickMsAvg: 0,
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
  const picks = pickBotTribes(BOT_COUNT);
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
    world.sim.followChiefEnabled[slotId] = true;
    const bot = new AIBot(world.sim, slotId);
    world.players[slotId] = {
      ws: null,
      name: tribeNameAt(pick.language, pick.tribeNameIndex),
      id: slotId,
      language: pick.language,
      tribeNameIndex: pick.tribeNameIndex,
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

function tribeNameIndicesOf(): number[] {
  return world.players.map((p) => p?.tribeNameIndex ?? -1);
}

function visibleAnimalsFor(
  ownerId: PlayerId,
  units: UnitSnapshot[],
): AnimalSnapshot[] {
  const myUnits: UnitSnapshot[] = [];
  for (const u of units) if (u.owner === ownerId) myUnits.push(u);
  if (myUnits.length === 0) return [];
  return world.sim.visibleAnimalSnapshots(myUnits, ANIMAL_VIEW_RADIUS);
}

function visibleFishesFor(
  ownerId: PlayerId,
  units: UnitSnapshot[],
): FishSnapshot[] {
  const myUnits: UnitSnapshot[] = [];
  for (const u of units) if (u.owner === ownerId) myUnits.push(u);
  if (myUnits.length === 0) return [];
  return world.sim.visibleFishSnapshots(myUnits, ANIMAL_VIEW_RADIUS);
}

function botSlotIds(): PlayerId[] {
  const out: PlayerId[] = [];
  for (const p of world.players) {
    if (p && p.bot) out.push(p.id);
  }
  return out;
}

function evictBotSlot(): PlayerId {
  let victim: PlayerId = -1;
  let smallest = Infinity;
  for (const p of world.players) {
    if (!p || !p.bot) continue;
    let count = 0;
    for (const u of world.sim.units.values()) if (u.owner === p.id) count++;
    if (count < smallest) {
      smallest = count;
      victim = p.id;
    }
  }
  if (victim === -1) return -1;

  const removedUnitIds = world.sim.removePlayer(victim);
  const idx = world.bots.findIndex((b) => b.id === victim);
  if (idx >= 0) world.bots.splice(idx, 1);
  pendingBotRespawns.delete(victim);
  world.players[victim] = null;
  world.knownAnimals[victim] = new Set();
  world.knownUnits[victim] = new Set();
  world.knownCampfires[victim] = new Set();
  world.knownFishes[victim] = new Set();

  for (const other of world.players) {
    if (!other || !other.ws) continue;
    send(other.ws, {
      type: "opponentLeft",
      playerId: victim,
      removedUnitIds,
    });
  }
  console.log(`[rts-server] evicted bot slot ${victim} to make room for human`);
  return victim;
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

function joinPlayer(
  ws: WebSocket,
  name: string,
  requestedLanguage?: string,
): void {
  let slotId = world.players.findIndex((p) => p === null);
  if (slotId === -1) slotId = evictBotSlot();
  if (slotId === -1) {
    send(ws, {
      type: "error",
      message: `world full (max. ${MAX_PLAYERS} players)`,
    });
    return;
  }

  const language: NameLanguage =
    requestedLanguage &&
    (LANGUAGES as readonly string[]).includes(requestedLanguage)
      ? (requestedLanguage as Language)
      : languageForSlot(world.sim.seed, slotId);
  const slot: PlayerSlot = {
    ws,
    name,
    id: slotId,
    language,
    tribeNameIndex: -1,
  };
  world.players[slotId] = slot;
  slots.set(ws, slot);
  world.sim.addPlayer(slotId, language);
  world.sim.followChiefEnabled[slotId] = true;

  const allUnits = world.sim.unitsSnapshot();
  const allCampfires = world.sim.campfiresSnapshot();
  const visibleAnimals = visibleAnimalsFor(slotId, allUnits);
  const visibleFishes = visibleFishesFor(slotId, allUnits);
  const known = world.knownAnimals[slotId];
  known.clear();
  for (const a of visibleAnimals) known.add(a.id);

  const knownU = world.knownUnits[slotId];
  knownU.clear();
  for (const u of allUnits) knownU.add(u.id);

  const knownF = world.knownCampfires[slotId];
  knownF.clear();
  for (const f of allCampfires) knownF.add(f.id);

  const knownFi = world.knownFishes[slotId];
  knownFi.clear();
  for (const f of visibleFishes) knownFi.add(f.id);

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
    tribeNameIndices: tribeNameIndicesOf(),
    botSlots: botSlotIds(),
    footprints: [...world.sim.footprints],
    animals: visibleAnimals,
    fishes: visibleFishes,
    campfires: allCampfires,
    tribeCounts: world.sim.tribeCounts(),
    artifacts: world.sim.artifactsSnapshot(),
    dropPiles: world.sim.dropPilesSnapshot(),
    gameTimeSec: world.sim.gameTimeSec,
    treeGrowth: world.sim.treeGrowthSnapshot(),
    tribeOrigin: [...world.sim.tribeOrigin],
    balancing: balancingSnapshotMsg(),
    resourceCapPerPerson: resourceCapsSnapshot(),
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
  const tickStart = performance.now();
  const now = Date.now();
  const dt = (now - world.lastTick) / 1000;
  world.lastTick = now;
  for (const bot of world.bots) bot.update(dt);
  world.sim.step(dt);

  const deadUnitIds = world.sim.consumeDeadUnitIds();
  const extinctTribes = world.sim.consumeExtinctTribes();
  for (const p of extinctTribes) {
    const slot = world.players[p];
    if (slot && slot.bot) {
      pendingBotRespawns.set(p, now + BOT_RESPAWN_DELAY_MS);
    }
  }
  for (const [p, when] of [...pendingBotRespawns.entries()]) {
    if (now < when) continue;
    pendingBotRespawns.delete(p);
    const slot = world.players[p];
    if (!slot || !slot.bot) continue;
    world.sim.respawnTribe(p, slot.language);
    const fresh = new AIBot(world.sim, p);
    const idx = world.bots.findIndex((b) => b.id === p);
    if (idx >= 0) world.bots[idx] = fresh;
    else world.bots.push(fresh);
    slot.bot = fresh;
  }
  const respawnedTribes = world.sim.consumeRespawnedTribes();
  const tribeSplits = world.sim.consumeTribeSplits();
  const splitJoinPayloads: Array<{
    playerId: PlayerId;
    name: string;
    language: NameLanguage;
    tribeNameIndex: number;
    splitFrom: PlayerId;
  }> = [];
  for (const sp of tribeSplits) {
    const language = world.sim.tribeLanguage[sp.to];
    const tribeNameIndex = pickFreshTribeNameIndex();
    const name = tribeNameAt(language, tribeNameIndex);
    const bot = new AIBot(world.sim, sp.to);
    world.players[sp.to] = {
      ws: null,
      name,
      id: sp.to,
      language,
      tribeNameIndex,
      bot,
    };
    world.bots.push(bot);
    splitJoinPayloads.push({
      playerId: sp.to,
      name,
      language,
      tribeNameIndex,
      splitFrom: sp.from,
    });
  }

  const units = world.sim.unitsSnapshot();
  world.sim.consumeRemovedFishIds();
  const allCampfires = world.sim.campfiresSnapshot();
  const diedCampfireIds = world.sim.consumeRemovedCampfireIds();
  const resources = world.sim.resources.map((r) => ({ ...r }));
  const newRemovedObjects = world.sim.consumeNewRemovedObjects();
  const respawnedObjects = world.sim.consumeRespawnedObjects();
  const newFootprints = world.sim.consumeNewFootprints();
  const newUnits = world.sim.consumeNewUnits();
  const encounters = world.sim.consumeEncounterEvents();
  const growth = world.sim.growthSnapshot();
  // Drain the sim's per-tick removed-animal queue; per-client diff below
  // already handles deaths (dead ids land in known\visible).
  world.sim.consumeRemovedAnimalIds();
  const tribeCounts = world.sim.tribeCounts();
  const artifactFinds = world.sim.consumeArtifactFinds();
  const resourceFlows = world.sim.consumeResourceFlows();
  const damageEvents = world.sim.consumeDamageEvents();
  const newDropPiles = world.sim.consumeNewDropPiles();
  const removedDropPileIds = world.sim.consumeRemovedDropPileIds();
  const treeGrowthEvents = world.sim.consumeTreeGrowthEvents();
  const tribeOrigin = [...world.sim.tribeOrigin];
  const winnerOrigin = world.sim.winnerOrigin();
  const tickNo = world.sim.tick;

  for (const slot of world.players) {
    if (!slot) continue;
    if (!slot.ws) continue;
    if (slot.ws.readyState !== slot.ws.OPEN) continue;

    const visible = visibleAnimalsFor(slot.id, units);
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

    const visibleCampfireIds = new Set<string>();
    for (const f of allCampfires) visibleCampfireIds.add(f.id);
    const removedCampfireIds: string[] = [...diedCampfireIds];
    world.knownCampfires[slot.id] = visibleCampfireIds;

    const visibleFishes = visibleFishesFor(slot.id, units);
    const visibleFishIds = new Set<string>();
    for (const f of visibleFishes) visibleFishIds.add(f.id);
    const knownFi = world.knownFishes[slot.id];
    const removedFishIds: string[] = [];
    for (const id of knownFi) {
      if (!visibleFishIds.has(id)) removedFishIds.push(id);
    }
    world.knownFishes[slot.id] = visibleFishIds;

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
      fishes: visibleFishes,
      removedFishIds,
      deadUnitIds,
      outOfSightUnitIds,
      newUnits: visibleNewUnits,
      encounters,
      growthProgress: growth.progress,
      growthActive: growth.active,
      extinctTribes,
      respawnedTribes,
      campfires: allCampfires,
      removedCampfireIds,
      tribeCounts,
      artifactFinds,
      tribeSplits,
      resourceFlows: resourceFlows.filter((f) => f.owner === slot.id),
      damageEvents,
      dropPiles: newDropPiles,
      removedDropPileIds,
      serverTickMs: world.tickMsAvg,
      animalCount: world.sim.animals.size,
      unitCount: world.sim.units.size,
      fishCount: world.sim.fishes.size,
      gameTimeSec: world.sim.gameTimeSec,
      treeGrowthEvents,
      tribeOrigin,
      winnerOrigin,
    });
  }

  const tickMs = performance.now() - tickStart;
  world.tickMsAvg = world.tickMsAvg * 0.9 + tickMs * 0.1;

  for (const sp of splitJoinPayloads) {
    const splitUnits = units.filter((u) => u.owner === sp.playerId);
    for (const other of world.players) {
      if (!other || !other.ws) continue;
      if (other.id === sp.playerId) continue;
      const otherKnown = world.knownUnits[other.id];
      for (const u of splitUnits) otherKnown.add(u.id);
      send(other.ws, {
        type: "opponentJoined",
        playerId: sp.playerId,
        name: sp.name,
        language: sp.language,
        tribeNameIndex: sp.tribeNameIndex,
        units: splitUnits,
        isBot: true,
        splitFrom: sp.splitFrom,
      });
    }
  }
}

const tickInterval = setInterval(tick, 1000 / TICK_RATE);

function shutdown(): void {
  clearInterval(tickInterval);
  for (const client of wss.clients) client.terminate();
  wss.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 300).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function disconnect(ws: WebSocket): void {
  const slot = slots.get(ws);
  if (!slot) return;
  slots.delete(ws);
  world.players[slot.id] = null;
  world.knownAnimals[slot.id] = new Set();
  world.knownUnits[slot.id] = new Set();
  world.knownCampfires[slot.id] = new Set();
  world.knownFishes[slot.id] = new Set();
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
      const name = (msg.name || "Player").trim().slice(0, 20) || "Player";
      joinPlayer(ws, name, msg.language);
      return;
    }

    if (msg.type === "fetchLeaderboard") {
      send(ws, {
        type: "leaderboard",
        entries: topScores(LEADERBOARD_TOP_N),
        myRank: 0,
        myEntryTs: 0,
      });
      return;
    }

    if (msg.type === "submitScore") {
      const entry = sanitizeScore(msg.entry);
      if (!entry) {
        send(ws, { type: "error", message: "invalid score" });
        return;
      }
      addScore(entry);
      send(ws, {
        type: "leaderboard",
        entries: topScores(LEADERBOARD_TOP_N),
        myRank: rankFor(entry.score, entry.ts),
        myEntryTs: entry.ts,
      });
      return;
    }

    if (msg.type === "setBalancing") {
      const accepted: Record<string, number> = {};
      const touchesCap = msg.updates.some((u) => u.key.startsWith("caps."));
      for (const u of msg.updates) {
        if (!isValidKey(u.key)) continue;
        const v = Number(u.value);
        if (!Number.isFinite(v)) continue;
        const applied = applyValue(u.key, v);
        if (applied === null) continue;
        saveBalancing(u.key, applied);
        accepted[u.key] = applied;
      }
      if (Object.keys(accepted).length === 0) return;
      const update: ServerMessage = {
        type: "balancingUpdate",
        values: accepted,
      };
      if (touchesCap) (update as any).resourceCapPerPerson = resourceCapsSnapshot();
      broadcast(update);
      return;
    }

    if (msg.type === "resetBalancing") {
      dbResetBalancing();
      const accepted: Record<string, number> = {};
      for (const def of ALL_DEFS) {
        applyValue(def.key, def.defaultValue);
        accepted[def.key] = def.defaultValue;
      }
      broadcast({
        type: "balancingUpdate",
        values: accepted,
        resourceCapPerPerson: resourceCapsSnapshot(),
      });
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
    } else if (msg.type === "igniteCampfire") {
      world.sim.cmdIgniteCampfire(slot.id, msg.i, msg.j);
    }
  });

  ws.on("close", () => disconnect(ws));
  ws.on("error", () => disconnect(ws));
});
