import { AnimalKind } from "../shared/protocol";
import { Biome } from "../shared/worldgen";
import { ANIMALS } from "./balancing";

export interface AnimalSpec {
  hp: number;
  speed: number;
  meat: number;
  biomes: Biome[];
  density: number;
  wanderRadius: number;
  damage: number;
  aggressive: boolean;
  detectRange: number;
  autoHuntable: boolean;
  autoHuntRange: number;
  attackRange: number;
  aggroDurationSec: number;
  predator: boolean;
  preyDamage: number;
  matureAgeSec: number;
  gestationSec: number;
  maxAgeSec: number;
  aquatic: boolean;
  amphibianRange: number;
}

interface AnimalStatic {
  biomes: Biome[];
  aggressive: boolean;
  autoHuntable: boolean;
  predator: boolean;
  aquatic: boolean;
}

export const ANIMAL_STATIC: Record<AnimalKind, AnimalStatic> = {
  hare:        { biomes: ["wiesen", "wald", "savanne"],         aggressive: false, autoHuntable: true,  predator: false, aquatic: false },
  reindeer:    { biomes: ["wiesen", "wald"],                    aggressive: false, autoHuntable: true,  predator: false, aquatic: false },
  megaloceros: { biomes: ["wald", "wiesen"],                    aggressive: false, autoHuntable: true,  predator: false, aquatic: false },
  bison:       { biomes: ["savanne", "wiesen", "wueste"],       aggressive: true,  autoHuntable: false, predator: false, aquatic: false },
  caveLion:    { biomes: ["felsen", "wueste", "savanne", "wiesen"], aggressive: true,  autoHuntable: false, predator: true,  aquatic: false },
  mammoth:     { biomes: ["wiesen", "savanne", "wueste"],       aggressive: false, autoHuntable: false, predator: false, aquatic: false },
  alligator:   { biomes: ["lake", "river"],                     aggressive: true,  autoHuntable: true,  predator: true,  aquatic: true  },
  bear:        { biomes: ["wald", "felsen"],                    aggressive: true,  autoHuntable: false, predator: true,  aquatic: false },
};

/**
 * Build a full AnimalSpec by merging the static (non-tunable) parts
 * with the live tunable state from balancing.ts.
 */
export function animalSpec(kind: AnimalKind): AnimalSpec {
  const t = ANIMALS[kind];
  const s = ANIMAL_STATIC[kind];
  return {
    hp: t.hp,
    speed: t.speed,
    meat: t.meat,
    biomes: s.biomes,
    density: t.density,
    wanderRadius: t.wanderRadius,
    damage: t.damage,
    aggressive: s.aggressive,
    detectRange: t.detectRange,
    autoHuntable: s.autoHuntable,
    autoHuntRange: t.autoHuntRange,
    attackRange: t.attackRange,
    aggroDurationSec: t.aggroDurationSec,
    predator: s.predator,
    preyDamage: t.preyDamage,
    matureAgeSec: t.matureAgeSec,
    gestationSec: t.gestationSec,
    maxAgeSec: t.maxAgeSec,
    aquatic: s.aquatic,
    amphibianRange: t.amphibianRange,
  };
}

export const ALL_ANIMAL_KINDS: AnimalKind[] = [
  "hare", "reindeer", "megaloceros", "bison",
  "caveLion", "mammoth", "alligator", "bear",
];

export function kindHash(kind: AnimalKind): number {
  let h = 0x12345;
  for (let i = 0; i < kind.length; i++) {
    h = (Math.imul(h ^ kind.charCodeAt(i), 0x9e3779b1) >>> 0);
  }
  return h;
}
