import type { AnimalKind, Resources } from "../shared/protocol";
import {
  RESOURCE_CAP_PER_PERSON,
  RESOURCE_KEYS,
  TICK_RATE,
  applyProtocolBalance,
} from "../shared/protocol";

// --------------------------------------------------------------------
// Balancing meta + live state. Single source of truth for all tunable
// gameplay numbers. Defaults mirror the original const declarations in
// sim.ts / animals.ts / protocol.ts so existing behaviour is preserved
// when no DB overrides are present.
// --------------------------------------------------------------------

export type BalGroup =
  | "tageszyklus"
  | "wachstum"
  | "ernte"
  | "regrow"
  | "caps"
  | "einheiten"
  | "essen"
  | "jagd"
  | "campfire"
  | "tiere"
  | "tier_spawn"
  | "fische"
  | "weltobjekte";

export interface BalFieldDef {
  key: string;       // unique DB key, e.g. "harvest.interval" or "animal.hare.hp"
  group: BalGroup;
  label: string;     // German UI label
  defaultValue: number;
  min: number;
  max: number;
  step: number;
}

// ---- Animal tunables (per kind) ----
export const ANIMAL_KINDS_ORDER: AnimalKind[] = [
  "hare", "reindeer", "megaloceros", "bison",
  "caveLion", "mammoth", "alligator", "bear",
];

export const ANIMAL_LABELS: Record<AnimalKind, string> = {
  hare: "Hase",
  reindeer: "Rentier",
  megaloceros: "Riesenhirsch",
  bison: "Bison",
  caveLion: "Höhlenlöwe",
  mammoth: "Mammut",
  alligator: "Alligator",
  bear: "Bär",
};

export interface AnimalTunable {
  hp: number;
  speed: number;
  meat: number;
  density: number;
  wanderRadius: number;
  damage: number;
  detectRange: number;
  autoHuntRange: number;
  attackRange: number;
  aggroDurationSec: number;
  preyDamage: number;
  matureAgeSec: number;
  gestationSec: number;
  maxAgeSec: number;
  amphibianRange: number;
}

export const ANIMAL_DEFAULTS: Record<AnimalKind, AnimalTunable> = {
  hare:        { hp: 3,  speed: 4.0, meat: 2,  density: 0.0220, wanderRadius: 6,  damage: 0,  detectRange: 0, autoHuntRange: 6, attackRange: 1.5, aggroDurationSec: 0,  preyDamage: 0, matureAgeSec: 25, gestationSec: 30,  maxAgeSec: 140, amphibianRange: 0 },
  reindeer:    { hp: 8,  speed: 3.0, meat: 6,  density: 0.0040, wanderRadius: 10, damage: 3,  detectRange: 0, autoHuntRange: 5, attackRange: 1.5, aggroDurationSec: 6,  preyDamage: 0, matureAgeSec: 50, gestationSec: 55,  maxAgeSec: 260, amphibianRange: 0 },
  megaloceros: { hp: 15, speed: 3.4, meat: 10, density: 0.0025, wanderRadius: 8,  damage: 0,  detectRange: 0, autoHuntRange: 5, attackRange: 1.5, aggroDurationSec: 0,  preyDamage: 0, matureAgeSec: 60, gestationSec: 65,  maxAgeSec: 300, amphibianRange: 0 },
  bison:       { hp: 18, speed: 2.6, meat: 12, density: 0.0035, wanderRadius: 8,  damage: 4,  detectRange: 4, autoHuntRange: 0, attackRange: 1.5, aggroDurationSec: 8,  preyDamage: 0, matureAgeSec: 60, gestationSec: 70,  maxAgeSec: 320, amphibianRange: 0 },
  caveLion:    { hp: 12, speed: 4.0, meat: 6,  density: 0.0008, wanderRadius: 12, damage: 5,  detectRange: 5, autoHuntRange: 0, attackRange: 1.5, aggroDurationSec: 14, preyDamage: 5, matureAgeSec: 55, gestationSec: 60,  maxAgeSec: 280, amphibianRange: 0 },
  mammoth:     { hp: 30, speed: 1.8, meat: 25, density: 0.0014, wanderRadius: 6,  damage: 10, detectRange: 4, autoHuntRange: 0, attackRange: 1.8, aggroDurationSec: 10, preyDamage: 0, matureAgeSec: 90, gestationSec: 100, maxAgeSec: 420, amphibianRange: 0 },
  alligator:   { hp: 14, speed: 2.6, meat: 8,  density: 0.0070, wanderRadius: 5,  damage: 6,  detectRange: 5, autoHuntRange: 5, attackRange: 1.6, aggroDurationSec: 18, preyDamage: 6, matureAgeSec: 50, gestationSec: 70,  maxAgeSec: 320, amphibianRange: 3 },
  bear:        { hp: 22, speed: 3.0, meat: 14, density: 0.0016, wanderRadius: 10, damage: 8,  detectRange: 6, autoHuntRange: 0, attackRange: 1.6, aggroDurationSec: 22, preyDamage: 7, matureAgeSec: 70, gestationSec: 80,  maxAgeSec: 360, amphibianRange: 0 },
};

const ANIMAL_FIELD_META: Array<{
  key: keyof AnimalTunable;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: "hp",                 label: "HP",                 min: 1,    max: 500,  step: 1 },
  { key: "speed",              label: "Geschw.",            min: 0.1,  max: 12,   step: 0.1 },
  { key: "meat",               label: "Fleisch",            min: 0,    max: 100,  step: 1 },
  { key: "damage",             label: "Schaden",            min: 0,    max: 50,   step: 1 },
  { key: "detectRange",        label: "Aggro-Reichweite",   min: 0,    max: 20,   step: 0.5 },
  { key: "preyDamage",         label: "Beute-Schaden",      min: 0,    max: 50,   step: 1 },
  { key: "attackRange",        label: "Angriffsreichweite", min: 0.5,  max: 6,    step: 0.1 },
  { key: "aggroDurationSec",   label: "Aggro-Dauer (s)",    min: 0,    max: 60,   step: 1 },
  { key: "density",            label: "Dichte (Spawn)",     min: 0,    max: 0.2,  step: 0.0005 },
  { key: "wanderRadius",       label: "Wanderradius",       min: 0,    max: 40,   step: 1 },
  { key: "autoHuntRange",      label: "Auto-Hunt-Range",    min: 0,    max: 20,   step: 0.5 },
  { key: "matureAgeSec",       label: "Reife (s)",          min: 1,    max: 600,  step: 1 },
  { key: "gestationSec",       label: "Tragzeit (s)",       min: 1,    max: 600,  step: 1 },
  { key: "maxAgeSec",          label: "Max. Alter (s)",     min: 10,   max: 2000, step: 10 },
  { key: "amphibianRange",     label: "Amphibien-Reichw.",  min: 0,    max: 10,   step: 0.5 },
];

// ---- Scalar tunables ----
export const SCALAR_DEFS: BalFieldDef[] = [
  // === Tageszyklus ===
  { key: "day.morningLenSec",    group: "tageszyklus", label: "Morgen-Länge (s)",        defaultValue: 50,  min: 5,   max: 1200, step: 1 },
  { key: "day.noonLenSec",       group: "tageszyklus", label: "Mittag-Länge (s)",        defaultValue: 30,  min: 5,   max: 1200, step: 1 },
  { key: "day.afternoonLenSec",  group: "tageszyklus", label: "Nachmittag-Länge (s)",    defaultValue: 40,  min: 5,   max: 1200, step: 1 },
  { key: "day.nightLenSec",      group: "tageszyklus", label: "Nacht-Länge (s)",         defaultValue: 120, min: 5,   max: 1200, step: 1 },
  { key: "day.nightCampfireHolzPerNight", group: "tageszyklus", label: "Holz/Lagerfeuer-Nacht", defaultValue: 40, min: 1, max: 500, step: 1 },

  // === Wachstum / Bevölkerung ===
  { key: "growth.maxTribeSize",        group: "wachstum", label: "Max. Stammgröße",        defaultValue: 12, min: 1, max: 64, step: 1 },
  { key: "growth.requiredSec",         group: "wachstum", label: "Wachstumszeit (s)",      defaultValue: 240 * 1.2, min: 10, max: 1200, step: 1 },
  { key: "growth.pregnancyHealthMinFrac", group: "wachstum", label: "Min. HP-Anteil für Schwangerschaft", defaultValue: 0.30, min: 0.0, max: 1.0, step: 0.01 },
  { key: "growth.maxAgeSec",           group: "wachstum", label: "Max. Lebensalter (s)",    defaultValue: 240 * 4, min: 30, max: 5000, step: 10 },
  { key: "growth.childAgeSec",         group: "wachstum", label: "Kindheit (s)",            defaultValue: 240, min: 5, max: 1200, step: 1 },
  { key: "growth.oldThresholdSec",     group: "wachstum", label: "Altersgrenze (s)",        defaultValue: 240 * 3, min: 30, max: 4000, step: 10 },
  { key: "growth.encounterRange",      group: "wachstum", label: "Begegnung-Range",          defaultValue: 5, min: 1, max: 30, step: 0.5 },
  { key: "growth.encounterCooldownSec", group: "wachstum", label: "Begegnung-Cooldown (s)", defaultValue: 60, min: 1, max: 600, step: 1 },

  // === Ernte ===
  { key: "harvest.intervalSec",  group: "ernte", label: "Ernteintervall (s)",       defaultValue: 1.2, min: 0.1, max: 10, step: 0.1 },
  { key: "harvest.treeAmount",   group: "ernte", label: "Baum: Holz/Hieb",          defaultValue: 5, min: 1, max: 100, step: 1 },
  { key: "harvest.bushAmount",   group: "ernte", label: "Busch: Beeren/Hieb",       defaultValue: 3, min: 1, max: 50, step: 1 },
  { key: "harvest.mushAmount",   group: "ernte", label: "Pilz: Pilze/Hieb",         defaultValue: 1, min: 1, max: 20, step: 1 },
  { key: "harvest.stoneAmount",  group: "ernte", label: "Stein: Stein/Hieb",        defaultValue: 2, min: 1, max: 50, step: 1 },
  { key: "harvest.cactusHolz",   group: "ernte", label: "Kaktus: Holz/Hieb",        defaultValue: 1, min: 1, max: 20, step: 1 },
  { key: "harvest.cactusWasser", group: "ernte", label: "Kaktus: Wasser/Hieb",      defaultValue: 1, min: 0, max: 20, step: 1 },
  { key: "harvest.treeAutopick",     group: "ernte", label: "Auto-Pickup: Baum",     defaultValue: 1, min: 0, max: 20, step: 1 },
  { key: "harvest.bushAutopick",     group: "ernte", label: "Auto-Pickup: Busch",    defaultValue: 1, min: 0, max: 20, step: 1 },
  { key: "harvest.mushAutopick",     group: "ernte", label: "Auto-Pickup: Pilz",     defaultValue: 1, min: 0, max: 20, step: 1 },
  { key: "harvest.stoneAutopick",    group: "ernte", label: "Auto-Pickup: Stein",    defaultValue: 1, min: 0, max: 20, step: 1 },
  { key: "harvest.fishAutopick",     group: "ernte", label: "Auto-Pickup: Fisch",    defaultValue: 1, min: 0, max: 20, step: 1 },
  { key: "harvest.waterAutopick",    group: "ernte", label: "Auto-Pickup: Wasser",   defaultValue: 1, min: 0, max: 20, step: 1 },
  { key: "harvest.cactusAutopickHolz",   group: "ernte", label: "Auto-Pickup: Kaktus Holz",   defaultValue: 1, min: 0, max: 20, step: 1 },
  { key: "harvest.cactusAutopickWasser", group: "ernte", label: "Auto-Pickup: Kaktus Wasser", defaultValue: 1, min: 0, max: 20, step: 1 },

  // === Nachwuchs (Regrow) ===
  { key: "regrow.treeSec",     group: "regrow", label: "Baum: Regrow (s)",        defaultValue: 240 * 5, min: 10, max: 10000, step: 10 },
  { key: "regrow.bushSec",     group: "regrow", label: "Busch: Regrow (s)",       defaultValue: 120, min: 5, max: 3600, step: 5 },
  { key: "regrow.mushroomSec", group: "regrow", label: "Pilz: Regrow (s)",        defaultValue: 60, min: 5, max: 3600, step: 5 },
  { key: "regrow.cactusSec",   group: "regrow", label: "Kaktus: Regrow (s)",      defaultValue: 180, min: 5, max: 3600, step: 5 },

  // === Einheiten ===
  { key: "unit.hpMax",            group: "einheiten", label: "Max. HP",                    defaultValue: 100, min: 1, max: 500, step: 1 },
  { key: "unit.hpLossPerTile",    group: "einheiten", label: "HP-Verlust/Tile (laufen)",   defaultValue: 0.4, min: 0, max: 5, step: 0.05 },
  { key: "unit.hpLossPerSecIdle", group: "einheiten", label: "HP-Verlust/s (idle)",        defaultValue: 0.12, min: 0, max: 5, step: 0.01 },

  // === Essen ===
  { key: "eat.intervalSec",    group: "essen", label: "Ess-Intervall (s)",       defaultValue: 1.0, min: 0.1, max: 10, step: 0.1 },
  { key: "eat.hpGainFleisch",  group: "essen", label: "HP-Gewinn Fleisch",       defaultValue: 15, min: 0, max: 100, step: 1 },
  { key: "eat.hpGainFisch",    group: "essen", label: "HP-Gewinn Fisch",         defaultValue: 12, min: 0, max: 100, step: 1 },
  { key: "eat.hpGainBeeren",   group: "essen", label: "HP-Gewinn Beeren",        defaultValue: 3,  min: 0, max: 100, step: 1 },
  { key: "eat.hpGainPilze",    group: "essen", label: "HP-Gewinn Pilze",         defaultValue: 2,  min: 0, max: 100, step: 1 },
  { key: "eat.waterPerUnitPerDay", group: "essen", label: "Wasser/Person/Tag",    defaultValue: 1, min: 0, max: 20, step: 0.1 },
  { key: "eat.autoeatHpThreshold", group: "essen", label: "Auto-Eat HP-Schwelle", defaultValue: 0.51, min: 0, max: 1, step: 0.01 },

  // === Jagd / Kampf ===
  { key: "hunt.intervalSec",          group: "jagd", label: "Jagd-Intervall (s)",        defaultValue: 0.9, min: 0.1, max: 10, step: 0.1 },
  { key: "hunt.fistDamage",           group: "jagd", label: "Faust-Schaden",             defaultValue: 2, min: 0, max: 50, step: 1 },
  { key: "hunt.stoneDamage",          group: "jagd", label: "Stein-Schaden",             defaultValue: 3, min: 0, max: 50, step: 1 },
  { key: "hunt.clubDamage",           group: "jagd", label: "Keulen-Schaden",            defaultValue: 4, min: 0, max: 50, step: 1 },
  { key: "hunt.spearDamage",          group: "jagd", label: "Speer-Schaden",             defaultValue: 5, min: 0, max: 50, step: 1 },
  { key: "hunt.range",                group: "jagd", label: "Jagd-Reichweite",           defaultValue: 1.5, min: 0.5, max: 10, step: 0.1 },
  { key: "hunt.animalAttackInterval", group: "jagd", label: "Tier-Angriffsintervall (s)", defaultValue: 1.0, min: 0.1, max: 10, step: 0.1 },
  { key: "hunt.scanIntervalSec",      group: "jagd", label: "Auto-Scan-Intervall (s)",   defaultValue: 0.5, min: 0.1, max: 5, step: 0.1 },
  { key: "hunt.groupFightRange",      group: "jagd", label: "Gruppenkampf-Reichweite",   defaultValue: 7, min: 1, max: 30, step: 0.5 },
  { key: "hunt.preyFleeRange",        group: "jagd", label: "Beute-Fluchtreichweite",    defaultValue: 6, min: 1, max: 30, step: 0.5 },
  { key: "hunt.preyFleeRepathSec",    group: "jagd", label: "Beute-Repath (s)",          defaultValue: 0.8, min: 0.1, max: 10, step: 0.1 },
  { key: "hunt.animalEscapeRangeMult", group: "jagd", label: "Tier-Fluchtfaktor",         defaultValue: 1.8, min: 1.0, max: 5.0, step: 0.1 },
  { key: "hunt.nightPredatorDetectMult", group: "jagd", label: "Nacht-Räuber Sicht-Mult", defaultValue: 1.6, min: 1.0, max: 5.0, step: 0.05 },
  { key: "hunt.nightPredatorAggroDurMult", group: "jagd", label: "Nacht-Räuber Aggro-Mult", defaultValue: 1.4, min: 1.0, max: 5.0, step: 0.05 },
  { key: "hunt.nightPredatorDamageMult", group: "jagd", label: "Nacht-Räuber Schaden-Mult", defaultValue: 1.25, min: 1.0, max: 5.0, step: 0.05 },

  // === Lagerfeuer ===
  { key: "fire.range",                group: "campfire", label: "Lagerfeuer-Reichweite",   defaultValue: 2.5, min: 0.5, max: 10, step: 0.1 },
  { key: "fire.igniteMinUnits",       group: "campfire", label: "Min. Einheiten z. Anzünden", defaultValue: 2, min: 1, max: 12, step: 1 },
  { key: "fire.igniteHolzCost",       group: "campfire", label: "Holz-Kosten Anzünden",    defaultValue: 5, min: 0, max: 100, step: 1 },
  { key: "fire.igniteSteinCost",      group: "campfire", label: "Stein-Kosten Anzünden",   defaultValue: 1, min: 0, max: 100, step: 1 },
  { key: "fire.igniteClusterRadius",  group: "campfire", label: "Cluster-Radius",          defaultValue: 2.5, min: 0.5, max: 10, step: 0.1 },
  { key: "fire.growRadius",           group: "campfire", label: "Wachstumsradius",         defaultValue: 1.5, min: 0.5, max: 10, step: 0.1 },
  { key: "fire.maxSize",              group: "campfire", label: "Max. Größe",              defaultValue: 6, min: 1, max: 20, step: 1 },
  { key: "fire.hpRegenPerSec",        group: "campfire", label: "HP-Regen/s",              defaultValue: 1.2, min: 0, max: 20, step: 0.1 },
  { key: "fire.repelRadiusBonus",     group: "campfire", label: "Räuber-Abwehr-Bonus",     defaultValue: 2.5, min: 0, max: 20, step: 0.1 },

  // === Tier-Welt (Spawn) ===
  { key: "animals.spawnRadius",         group: "tier_spawn", label: "Spawn-Radius (Tiles)",   defaultValue: 200, min: 20, max: 600, step: 10 },
  { key: "animals.breedRange",          group: "tier_spawn", label: "Tier-Paarungsreichweite", defaultValue: 2.5, min: 0.5, max: 10, step: 0.1 },
  { key: "animals.kindCapFactor",       group: "tier_spawn", label: "Tier-Cap-Faktor",         defaultValue: 2.0, min: 1.0, max: 10.0, step: 0.1 },
  { key: "animals.respawnIntervalSec",  group: "tier_spawn", label: "Respawn-Intervall (s)",   defaultValue: 0.5, min: 0.1, max: 10, step: 0.1 },
  { key: "animals.respawnPerTick",      group: "tier_spawn", label: "Respawn-Versuche/Tick",   defaultValue: 140, min: 1, max: 1000, step: 1 },
  { key: "animals.respawnMinUnitDist",  group: "tier_spawn", label: "Min. Abstand zu Einheit", defaultValue: 12, min: 1, max: 50, step: 1 },
  { key: "animals.respawnTileAttempts", group: "tier_spawn", label: "Respawn-Tile-Versuche",   defaultValue: 60, min: 1, max: 500, step: 1 },
  { key: "animals.fullStepRadius",      group: "tier_spawn", label: "Voll-Sim-Radius",         defaultValue: 12, min: 1, max: 50, step: 1 },
  { key: "animals.passiveStepBuckets",  group: "tier_spawn", label: "Passiv-Buckets",          defaultValue: 10, min: 1, max: 100, step: 1 },
  { key: "animals.followChiefNear",     group: "tier_spawn", label: "Häuptlings-Nähe",          defaultValue: 5, min: 1, max: 20, step: 0.5 },
  { key: "animals.followChiefScanSec",  group: "tier_spawn", label: "Häuptlings-Scan (s)",      defaultValue: 0.3, min: 0.1, max: 5, step: 0.1 },
  { key: "animals.chiefVisionRadius",   group: "tier_spawn", label: "Häuptlings-Sicht",         defaultValue: 9, min: 1, max: 30, step: 0.5 },

  // === Fische ===
  { key: "fish.speed",             group: "fische", label: "Geschwindigkeit",       defaultValue: 0.6, min: 0.05, max: 5, step: 0.05 },
  { key: "fish.turnIntervalMin",   group: "fische", label: "Drehintervall min (s)", defaultValue: 1.2, min: 0.1, max: 10, step: 0.1 },
  { key: "fish.turnIntervalMax",   group: "fische", label: "Drehintervall max (s)", defaultValue: 3.5, min: 0.1, max: 20, step: 0.1 },
  { key: "fish.homeRadius",        group: "fische", label: "Home-Radius",           defaultValue: 4.5, min: 0.5, max: 30, step: 0.5 },
  { key: "fish.shoreBias",         group: "fische", label: "Ufer-Bias",             defaultValue: 0.35, min: 0, max: 1, step: 0.05 },
  { key: "fish.catchRadius",       group: "fische", label: "Fang-Radius",           defaultValue: 1.4, min: 0.1, max: 5, step: 0.1 },
  { key: "fish.matureAgeSec",      group: "fische", label: "Reife (s)",             defaultValue: 30, min: 1, max: 600, step: 1 },
  { key: "fish.breedIntervalSec",  group: "fische", label: "Paarungsintervall (s)", defaultValue: 55, min: 1, max: 600, step: 1 },
  { key: "fish.breedScanIntervalSec", group: "fische", label: "Paarungs-Scan (s)", defaultValue: 1.0, min: 0.1, max: 10, step: 0.1 },
  { key: "fish.breedRange",        group: "fische", label: "Paarungsreichweite",    defaultValue: 1.6, min: 0.1, max: 10, step: 0.1 },
  { key: "fish.densityCapFactor",  group: "fische", label: "Dichte-Cap-Faktor",     defaultValue: 1.8, min: 0.5, max: 10, step: 0.1 },

  // === Weltobjekte ===
  { key: "world.dropPileLifetimeSec",  group: "weltobjekte", label: "Drop-Stapel-Lebensdauer (s)", defaultValue: 180, min: 5, max: 3600, step: 5 },
  { key: "world.dropPilePickupRadius", group: "weltobjekte", label: "Drop-Stapel-Aufnahmeradius", defaultValue: 0.7, min: 0.1, max: 5, step: 0.1 },
  { key: "world.dropPilePickupDelaySec", group: "weltobjekte", label: "Drop-Stapel-Aufnahmeverzögerung (s)", defaultValue: 4, min: 0, max: 60, step: 0.5 },
  { key: "world.artifactDiscoveryRadius", group: "weltobjekte", label: "Artefakt-Entdeckungsradius", defaultValue: 4, min: 0.5, max: 30, step: 0.5 },
  { key: "world.footprintLifetimeSec",   group: "weltobjekte", label: "Fußspuren-Lebensdauer (s)", defaultValue: 25, min: 1, max: 600, step: 1 },
];

// ---- Resource caps (per person) ----
const CAP_FIELD_META: Array<{ key: keyof Resources; label: string }> = [
  { key: "holz",    label: "Holz/Person" },
  { key: "wasser",  label: "Wasser/Person" },
  { key: "beeren",  label: "Beeren/Person" },
  { key: "pilze",   label: "Pilze/Person" },
  { key: "fleisch", label: "Fleisch/Person" },
  { key: "fisch",   label: "Fisch/Person" },
  { key: "stein",   label: "Stein/Person" },
];

for (const m of CAP_FIELD_META) {
  SCALAR_DEFS.push({
    key: `caps.${m.key}`,
    group: "caps",
    label: m.label,
    defaultValue: RESOURCE_CAP_PER_PERSON[m.key],
    min: 0,
    max: 1000,
    step: 1,
  });
}

// ---- Animal field defs (auto-generated) ----
const ANIMAL_DEFS: BalFieldDef[] = [];
for (const kind of ANIMAL_KINDS_ORDER) {
  const def = ANIMAL_DEFAULTS[kind];
  for (const m of ANIMAL_FIELD_META) {
    ANIMAL_DEFS.push({
      key: `animal.${kind}.${m.key}`,
      group: "tiere",
      label: `${ANIMAL_LABELS[kind]} – ${m.label}`,
      defaultValue: def[m.key],
      min: m.min,
      max: m.max,
      step: m.step,
    });
  }
}

export const ALL_DEFS: BalFieldDef[] = [...SCALAR_DEFS, ...ANIMAL_DEFS];

// ---- Live state ----
function fillScalars(): Record<string, number> {
  const out: Record<string, number> = Object.create(null);
  for (const d of SCALAR_DEFS) out[d.key] = d.defaultValue;
  return out;
}

const SCALAR: Record<string, number> = fillScalars();
export const ANIMALS: Record<AnimalKind, AnimalTunable> = Object.fromEntries(
  ANIMAL_KINDS_ORDER.map((k) => [k, { ...ANIMAL_DEFAULTS[k] }]),
) as Record<AnimalKind, AnimalTunable>;

// Resource caps live in protocol's RESOURCE_CAP_PER_PERSON; we mutate it
// in place so existing imports continue to work via the live object ref.

// ---- Derived (recomputed on every change) ----
export interface BalDerived {
  // From protocol scalars
  dayLengthSec: number;
  sunsetAtSec: number;
  phaseLengthSec: number;
  // From regrow seconds → ticks
  treeRegrowTicks: number;
  treeStageTicks: number;
  bushRegrowTicks: number;
  mushroomRegrowTicks: number;
  cactusRegrowTicks: number;
  // Other
  encounterCooldownTicks: number;
  footprintLifetimeTicks: number;
  campfireBurnPerFuelSec: number;
  campfireRepelRadius: number;
  animalBreedRangeSq: number;
  animalRespawnMinUnitDistSq: number;
  autoHuntAbortDist: number;
  fishBreedRangeSq: number;
}

export const D: BalDerived = {
  dayLengthSec: 0,
  sunsetAtSec: 0,
  phaseLengthSec: 0,
  treeRegrowTicks: 0,
  treeStageTicks: 0,
  bushRegrowTicks: 0,
  mushroomRegrowTicks: 0,
  cactusRegrowTicks: 0,
  encounterCooldownTicks: 0,
  footprintLifetimeTicks: 0,
  campfireBurnPerFuelSec: 0,
  campfireRepelRadius: 0,
  animalBreedRangeSq: 0,
  animalRespawnMinUnitDistSq: 0,
  autoHuntAbortDist: 0,
  fishBreedRangeSq: 0,
};

function recomputeDerived(): void {
  const morn = SCALAR["day.morningLenSec"];
  const noon = SCALAR["day.noonLenSec"];
  const aft  = SCALAR["day.afternoonLenSec"];
  const night = SCALAR["day.nightLenSec"];
  D.dayLengthSec = morn + noon + aft + night;
  D.sunsetAtSec = morn + noon + aft;
  D.phaseLengthSec = night;

  D.treeRegrowTicks = Math.max(1, Math.round(TICK_RATE * SCALAR["regrow.treeSec"]));
  D.treeStageTicks  = Math.max(1, Math.round(D.treeRegrowTicks / 4));
  D.bushRegrowTicks = Math.max(1, Math.round(TICK_RATE * SCALAR["regrow.bushSec"]));
  D.mushroomRegrowTicks = Math.max(1, Math.round(TICK_RATE * SCALAR["regrow.mushroomSec"]));
  D.cactusRegrowTicks   = Math.max(1, Math.round(TICK_RATE * SCALAR["regrow.cactusSec"]));

  D.encounterCooldownTicks = Math.max(1, Math.round(TICK_RATE * SCALAR["growth.encounterCooldownSec"]));
  D.footprintLifetimeTicks = Math.max(1, Math.round(TICK_RATE * SCALAR["world.footprintLifetimeSec"]));
  D.campfireBurnPerFuelSec = night / Math.max(1, SCALAR["day.nightCampfireHolzPerNight"]);
  D.campfireRepelRadius    = SCALAR["fire.range"] + SCALAR["fire.repelRadiusBonus"];

  const ar = SCALAR["animals.breedRange"];
  D.animalBreedRangeSq = ar * ar;
  const ad = SCALAR["animals.respawnMinUnitDist"];
  D.animalRespawnMinUnitDistSq = ad * ad;
  D.autoHuntAbortDist = SCALAR["animals.chiefVisionRadius"] + 3;
  const fb = SCALAR["fish.breedRange"];
  D.fishBreedRangeSq = fb * fb;
}

function applyProtocolFromScalars(): void {
  applyProtocolBalance({
    morningLenSec: SCALAR["day.morningLenSec"],
    noonLenSec:    SCALAR["day.noonLenSec"],
    afternoonLenSec: SCALAR["day.afternoonLenSec"],
    nightLenSec:   SCALAR["day.nightLenSec"],
    nightCampfireHolzPerNight: SCALAR["day.nightCampfireHolzPerNight"],
    maxTribeSize:  SCALAR["growth.maxTribeSize"],
    campfireRange: SCALAR["fire.range"],
    artifactDiscoveryRadius: SCALAR["world.artifactDiscoveryRadius"],
    dropPileLifetimeSec: SCALAR["world.dropPileLifetimeSec"],
    dropPilePickupRadius: SCALAR["world.dropPilePickupRadius"],
    dropPilePickupDelaySec: SCALAR["world.dropPilePickupDelaySec"],
    footprintLifetimeTicks: D.footprintLifetimeTicks,
  });
  // Mutate resource cap object in place (live binding via reference).
  for (const k of RESOURCE_KEYS) {
    RESOURCE_CAP_PER_PERSON[k] = SCALAR[`caps.${k}`];
  }
}

// ---- Live getters (typed accessors used by sim.ts) ----
export const BAL = {
  // tageszyklus
  get morningLenSec() { return SCALAR["day.morningLenSec"]; },
  get noonLenSec()    { return SCALAR["day.noonLenSec"]; },
  get afternoonLenSec() { return SCALAR["day.afternoonLenSec"]; },
  get nightLenSec()   { return SCALAR["day.nightLenSec"]; },
  get nightCampfireHolzPerNight() { return SCALAR["day.nightCampfireHolzPerNight"]; },

  // wachstum
  get maxTribeSize()         { return SCALAR["growth.maxTribeSize"]; },
  get growthRequiredSec()    { return SCALAR["growth.requiredSec"]; },
  get pregnancyHealthMinFrac() { return SCALAR["growth.pregnancyHealthMinFrac"]; },
  get maxAgeSec()            { return SCALAR["growth.maxAgeSec"]; },
  get childAgeSec()          { return SCALAR["growth.childAgeSec"]; },
  get oldThresholdSec()      { return SCALAR["growth.oldThresholdSec"]; },
  get encounterRange()       { return SCALAR["growth.encounterRange"]; },

  // ernte
  get harvestInterval()      { return SCALAR["harvest.intervalSec"]; },
  get treeHarvestAmount()    { return SCALAR["harvest.treeAmount"]; },
  get bushHarvestAmount()    { return SCALAR["harvest.bushAmount"]; },
  get mushHarvestAmount()    { return SCALAR["harvest.mushAmount"]; },
  get stoneHarvestAmount()   { return SCALAR["harvest.stoneAmount"]; },
  get cactusHarvestHolz()    { return SCALAR["harvest.cactusHolz"]; },
  get cactusHarvestWasser()  { return SCALAR["harvest.cactusWasser"]; },
  get treeAutopickGain()     { return SCALAR["harvest.treeAutopick"]; },
  get bushAutopickGain()     { return SCALAR["harvest.bushAutopick"]; },
  get mushroomAutopickGain() { return SCALAR["harvest.mushAutopick"]; },
  get stoneAutopickGain()    { return SCALAR["harvest.stoneAutopick"]; },
  get fishAutopickGain()     { return SCALAR["harvest.fishAutopick"]; },
  get waterAutopickGain()    { return SCALAR["harvest.waterAutopick"]; },
  get cactusAutopickHolz()   { return SCALAR["harvest.cactusAutopickHolz"]; },
  get cactusAutopickWasser() { return SCALAR["harvest.cactusAutopickWasser"]; },

  // einheiten / essen
  get unitHpMax()           { return SCALAR["unit.hpMax"]; },
  get unitHpLossPerTile()   { return SCALAR["unit.hpLossPerTile"]; },
  get unitHpLossPerSecIdle() { return SCALAR["unit.hpLossPerSecIdle"]; },
  get eatInterval()         { return SCALAR["eat.intervalSec"]; },
  get hpGainFleisch()       { return SCALAR["eat.hpGainFleisch"]; },
  get hpGainFisch()         { return SCALAR["eat.hpGainFisch"]; },
  get hpGainBeeren()        { return SCALAR["eat.hpGainBeeren"]; },
  get hpGainPilze()         { return SCALAR["eat.hpGainPilze"]; },
  get waterPerUnitPerDay()  { return SCALAR["eat.waterPerUnitPerDay"]; },
  get autoeatHpThreshold()  { return SCALAR["eat.autoeatHpThreshold"]; },

  // jagd
  get huntInterval()              { return SCALAR["hunt.intervalSec"]; },
  get fistHuntDamage()            { return SCALAR["hunt.fistDamage"]; },
  get stoneHuntDamage()           { return SCALAR["hunt.stoneDamage"]; },
  get clubHuntDamage()            { return SCALAR["hunt.clubDamage"]; },
  get spearHuntDamage()           { return SCALAR["hunt.spearDamage"]; },
  get huntRange()                 { return SCALAR["hunt.range"]; },
  get animalAttackInterval()      { return SCALAR["hunt.animalAttackInterval"]; },
  get unitAutoHuntScanInterval()  { return SCALAR["hunt.scanIntervalSec"]; },
  get groupFightRange()           { return SCALAR["hunt.groupFightRange"]; },
  get preyFleeRange()             { return SCALAR["hunt.preyFleeRange"]; },
  get preyFleeRepathSec()         { return SCALAR["hunt.preyFleeRepathSec"]; },
  get animalEscapeRangeMult()     { return SCALAR["hunt.animalEscapeRangeMult"]; },
  get nightPredatorDetectMult()   { return SCALAR["hunt.nightPredatorDetectMult"]; },
  get nightPredatorAggroDurationMult() { return SCALAR["hunt.nightPredatorAggroDurMult"]; },
  get nightPredatorDamageMult()   { return SCALAR["hunt.nightPredatorDamageMult"]; },

  // campfire
  get campfireRange()              { return SCALAR["fire.range"]; },
  get campfireIgniteMinUnits()     { return SCALAR["fire.igniteMinUnits"]; },
  get campfireIgniteHolzCost()     { return SCALAR["fire.igniteHolzCost"]; },
  get campfireIgniteSteinCost()    { return SCALAR["fire.igniteSteinCost"]; },
  get campfireIgniteClusterRadius() { return SCALAR["fire.igniteClusterRadius"]; },
  get campfireGrowRadius()         { return SCALAR["fire.growRadius"]; },
  get campfireMaxSize()            { return SCALAR["fire.maxSize"]; },
  get campfireHpRegenPerSec()      { return SCALAR["fire.hpRegenPerSec"]; },

  // tiere (welt)
  get animalSpawnRadius()        { return SCALAR["animals.spawnRadius"]; },
  get animalKindCapFactor()      { return SCALAR["animals.kindCapFactor"]; },
  get animalRespawnInterval()    { return SCALAR["animals.respawnIntervalSec"]; },
  get animalRespawnPerTick()     { return SCALAR["animals.respawnPerTick"]; },
  get animalRespawnTileAttempts() { return SCALAR["animals.respawnTileAttempts"]; },
  get animalFullStepRadius()     { return SCALAR["animals.fullStepRadius"]; },
  get animalPassiveStepBuckets() { return SCALAR["animals.passiveStepBuckets"]; },
  get followChiefNear()          { return SCALAR["animals.followChiefNear"]; },
  get followChiefScanInterval()  { return SCALAR["animals.followChiefScanSec"]; },
  get chiefVisionRadius()        { return SCALAR["animals.chiefVisionRadius"]; },

  // fische
  get fishSpeed()                  { return SCALAR["fish.speed"]; },
  get fishTurnIntervalMin()        { return SCALAR["fish.turnIntervalMin"]; },
  get fishTurnIntervalMax()        { return SCALAR["fish.turnIntervalMax"]; },
  get fishHomeRadius()             { return SCALAR["fish.homeRadius"]; },
  get fishShoreBias()              { return SCALAR["fish.shoreBias"]; },
  get fishCatchRadius()            { return SCALAR["fish.catchRadius"]; },
  get fishMatureAgeSec()           { return SCALAR["fish.matureAgeSec"]; },
  get fishBreedIntervalSec()       { return SCALAR["fish.breedIntervalSec"]; },
  get fishBreedScanIntervalSec()   { return SCALAR["fish.breedScanIntervalSec"]; },
  get fishDensityCapFactor()       { return SCALAR["fish.densityCapFactor"]; },
};

// ---- Persistence interface ----
const isAnimalKey = (key: string): { kind: AnimalKind; field: keyof AnimalTunable } | null => {
  const m = /^animal\.([a-zA-Z]+)\.([a-zA-Z]+)$/.exec(key);
  if (!m) return null;
  const kind = m[1] as AnimalKind;
  const field = m[2] as keyof AnimalTunable;
  if (!(kind in ANIMALS)) return null;
  if (!(field in ANIMALS[kind])) return null;
  return { kind, field };
};

const SCALAR_DEF_BY_KEY: Map<string, BalFieldDef> = new Map(SCALAR_DEFS.map((d) => [d.key, d]));
const ANIMAL_DEF_BY_KEY: Map<string, BalFieldDef> = new Map(ANIMAL_DEFS.map((d) => [d.key, d]));

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function isValidKey(key: string): boolean {
  return SCALAR_DEF_BY_KEY.has(key) || ANIMAL_DEF_BY_KEY.has(key);
}

export function defOf(key: string): BalFieldDef | null {
  return SCALAR_DEF_BY_KEY.get(key) ?? ANIMAL_DEF_BY_KEY.get(key) ?? null;
}

/**
 * Apply a value override in-memory. Returns the actually-applied
 * (clamped) value or null if the key is unknown.
 */
export function applyValue(key: string, value: number): number | null {
  const def = defOf(key);
  if (!def) return null;
  const v = clamp(value, def.min, def.max);
  if (SCALAR_DEF_BY_KEY.has(key)) {
    SCALAR[key] = v;
  } else {
    const a = isAnimalKey(key);
    if (!a) return null;
    (ANIMALS[a.kind] as Record<keyof AnimalTunable, number>)[a.field] = v;
  }
  recomputeDerived();
  applyProtocolFromScalars();
  return v;
}

export interface BalancingSnapshot {
  scalars: Record<string, number>;
  animals: Record<string, AnimalTunable>;
}

export function snapshot(): BalancingSnapshot {
  const scalars: Record<string, number> = {};
  for (const d of SCALAR_DEFS) scalars[d.key] = SCALAR[d.key];
  const animals: Record<string, AnimalTunable> = {};
  for (const kind of ANIMAL_KINDS_ORDER) animals[kind] = { ...ANIMALS[kind] };
  return { scalars, animals };
}

export function getCurrentValue(key: string): number | null {
  if (SCALAR_DEF_BY_KEY.has(key)) return SCALAR[key];
  const a = isAnimalKey(key);
  if (!a) return null;
  return ANIMALS[a.kind][a.field];
}

/**
 * Hydrate live state from a flat key→value map (loaded from SQLite).
 * Unknown keys are silently ignored. Recomputes derived state at the
 * end.
 */
export function hydrateFromMap(rows: Record<string, number>): void {
  for (const [k, v] of Object.entries(rows)) {
    const def = defOf(k);
    if (!def) continue;
    if (SCALAR_DEF_BY_KEY.has(k)) {
      SCALAR[k] = clamp(v, def.min, def.max);
    } else {
      const a = isAnimalKey(k);
      if (a) (ANIMALS[a.kind] as Record<keyof AnimalTunable, number>)[a.field] = clamp(v, def.min, def.max);
    }
  }
  recomputeDerived();
  applyProtocolFromScalars();
}

// Initialise derived + protocol bindings from defaults at module load.
recomputeDerived();
applyProtocolFromScalars();
