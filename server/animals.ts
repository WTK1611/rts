import { AnimalKind } from "../shared/protocol";
import { Biome } from "../shared/worldgen";

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
}

export const ANIMAL_SPECS: Record<AnimalKind, AnimalSpec> = {
  hare:        { hp: 3,  speed: 4.0, meat: 2,  biomes: ["wiesen", "wald", "savanne"],          density: 0.0220, wanderRadius: 6,  damage: 0,  aggressive: false, detectRange: 0, autoHuntable: true,  autoHuntRange: 6, attackRange: 1.5, aggroDurationSec: 0,  predator: false, preyDamage: 0, matureAgeSec: 25, gestationSec: 30,  maxAgeSec: 140, aquatic: false },
  reindeer:    { hp: 8,  speed: 3.0, meat: 6,  biomes: ["wiesen", "wald"],                     density: 0.0040, wanderRadius: 10, damage: 3,  aggressive: false, detectRange: 0, autoHuntable: true,  autoHuntRange: 5, attackRange: 1.5, aggroDurationSec: 6,  predator: false, preyDamage: 0, matureAgeSec: 50, gestationSec: 55,  maxAgeSec: 260, aquatic: false },
  megaloceros: { hp: 15, speed: 3.4, meat: 10, biomes: ["wald", "wiesen"],                     density: 0.0025, wanderRadius: 8,  damage: 0,  aggressive: false, detectRange: 0, autoHuntable: true,  autoHuntRange: 5, attackRange: 1.5, aggroDurationSec: 0,  predator: false, preyDamage: 0, matureAgeSec: 60, gestationSec: 65,  maxAgeSec: 300, aquatic: false },
  bison:       { hp: 18, speed: 2.6, meat: 12, biomes: ["savanne", "wiesen", "wueste"],        density: 0.0035, wanderRadius: 8,  damage: 4,  aggressive: true,  detectRange: 4, autoHuntable: false, autoHuntRange: 0, attackRange: 1.5, aggroDurationSec: 8,  predator: false, preyDamage: 0, matureAgeSec: 60, gestationSec: 70,  maxAgeSec: 320, aquatic: false },
  caveLion:    { hp: 12, speed: 4.0, meat: 6,  biomes: ["felsen", "wueste", "savanne", "wiesen"], density: 0.0008, wanderRadius: 12, damage: 5,  aggressive: true,  detectRange: 5, autoHuntable: false, autoHuntRange: 0, attackRange: 1.5, aggroDurationSec: 14, predator: true,  preyDamage: 5, matureAgeSec: 55, gestationSec: 60,  maxAgeSec: 280, aquatic: false },
  mammoth:     { hp: 30, speed: 1.8, meat: 25, biomes: ["wiesen", "savanne", "wueste"],        density: 0.0014, wanderRadius: 6,  damage: 10, aggressive: false, detectRange: 4, autoHuntable: false, autoHuntRange: 0, attackRange: 1.8, aggroDurationSec: 10, predator: false, preyDamage: 0, matureAgeSec: 90, gestationSec: 100, maxAgeSec: 420, aquatic: false },
  alligator:   { hp: 14, speed: 2.6, meat: 8,  biomes: ["lake", "river"],                      density: 0.0070, wanderRadius: 5,  damage: 6,  aggressive: true,  detectRange: 5, autoHuntable: true,  autoHuntRange: 5, attackRange: 1.6, aggroDurationSec: 18, predator: true,  preyDamage: 6, matureAgeSec: 50, gestationSec: 70,  maxAgeSec: 320, aquatic: true  },
  bear:        { hp: 22, speed: 3.0, meat: 14, biomes: ["wald", "felsen"],                     density: 0.0016, wanderRadius: 10, damage: 8,  aggressive: true,  detectRange: 6, autoHuntable: false, autoHuntRange: 0, attackRange: 1.6, aggroDurationSec: 22, predator: true,  preyDamage: 7, matureAgeSec: 70, gestationSec: 80,  maxAgeSec: 360, aquatic: false },
};

export function kindHash(kind: AnimalKind): number {
  let h = 0x12345;
  for (let i = 0; i < kind.length; i++) {
    h = (Math.imul(h ^ kind.charCodeAt(i), 0x9e3779b1) >>> 0);
  }
  return h;
}
