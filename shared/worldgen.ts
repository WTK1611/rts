export const TILE_PALETTE_COUNT = 6;
export const SPAWN_GUARD_RADIUS = 3;
export const SPAWN_DISTANCE_MIN = 85;
export const SPAWN_DISTANCE_MAX = 130;
export const SPAWN_COUNT = 10;

export interface SpawnArea {
  cx: number;
  cy: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const spawnCache = new Map<number, SpawnArea[]>();

export function spawnsFromSeed(seed: number): SpawnArea[] {
  const cached = spawnCache.get(seed);
  if (cached) return cached;
  const rng = mulberry32(seed ^ 0x5a5a5a5a);
  const result: SpawnArea[] = [];
  const minSep = SPAWN_DISTANCE_MIN;
  let attempts = 0;
  while (result.length < SPAWN_COUNT && attempts < 5000) {
    attempts++;
    let cx: number;
    let cy: number;
    if (result.length === 0) {
      cx = Math.floor((rng() - 0.5) * 280);
      cy = Math.floor((rng() - 0.5) * 280);
    } else {
      const anchor = result[Math.floor(rng() * result.length)];
      const angle = rng() * Math.PI * 2;
      const dist =
        SPAWN_DISTANCE_MIN + rng() * (SPAWN_DISTANCE_MAX - SPAWN_DISTANCE_MIN);
      cx = Math.round(anchor.cx + Math.cos(angle) * dist);
      cy = Math.round(anchor.cy + Math.sin(angle) * dist);
    }
    let ok = true;
    for (const a of result) {
      const dx = cx - a.cx;
      const dy = cy - a.cy;
      if (dx * dx + dy * dy < minSep * minSep) {
        ok = false;
        break;
      }
    }
    if (ok) result.push({ cx, cy });
  }
  spawnCache.set(seed, result);
  return result;
}

export function hash3(seed: number, i: number, j: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (i | 0), 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (j | 0), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function rand01(seed: number, i: number, j: number): number {
  return hash3(seed, i, j) / 0x100000000;
}

export function tileVariant(seed: number, i: number, j: number): number {
  return hash3(seed ^ 0x1f1f1f, i, j) % TILE_PALETTE_COUNT;
}

export function tileDecor(seed: number, i: number, j: number): number {
  return hash3(seed ^ 0x2b2b2b, i, j);
}

export type Biome =
  | "lake"
  | "river"
  | "wiesen"
  | "wald"
  | "savanne"
  | "wueste"
  | "felsen"
  | "gebirge"
  | "canyon";

export const BIOME_PALETTES: Record<Biome, number[]> = {
  wiesen: [0x355d35, 0x3a6b3a, 0x437a43, 0x2f5a2f, 0x4d8a4d, 0x335a33],
  wald: [0x1e3e1e, 0x244e24, 0x2a5a2a, 0x1b3a1b, 0x305f30, 0x274d27],
  savanne: [0x8c7a3a, 0x9c8a4a, 0xa89640, 0x7a6f30, 0xb4a050, 0x927e3a],
  wueste: [0xd4b878, 0xc8a866, 0xdec189, 0xb89a5a, 0xe7cd99, 0xc7a973],
  lake: [0x1f3e64, 0x244a72, 0x2a5680, 0x1c3658],
  river: [0x356ea0, 0x3a78b0, 0x4486bf, 0x305f8c],
  felsen: [0x6a6a6a, 0x787878, 0x5e5e5e, 0x848484, 0x707070, 0x606060],
  gebirge: [0x484848, 0x383838, 0x525252, 0x303030, 0x5a5a5a, 0x404040],
  canyon: [0xa05530, 0x8a4528, 0xb46038, 0x6c3a20, 0xc26b40, 0x744028],
};

interface HeightProfile {
  base: number;
  hill: number;
}

const HEIGHT_PROFILES: Record<Biome, HeightProfile> = {
  lake: { base: 0, hill: 0 },
  river: { base: 0, hill: 0 },
  wiesen: { base: 0, hill: 2 },
  wald: { base: 3, hill: 9 },
  savanne: { base: 4, hill: 12 },
  wueste: { base: 1, hill: 6 },
  felsen: { base: 22, hill: 22 },
  gebirge: { base: 46, hill: 30 },
  canyon: { base: -22, hill: 6 },
};

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smoothstep(x - x0);
  const fy = smoothstep(y - y0);
  const v00 = rand01(seed, x0, y0);
  const v10 = rand01(seed, x0 + 1, y0);
  const v01 = rand01(seed, x0, y0 + 1);
  const v11 = rand01(seed, x0 + 1, y0 + 1);
  const top = v00 + (v10 - v00) * fx;
  const bot = v01 + (v11 - v01) * fx;
  return top + (bot - top) * fy;
}

function fbm(seed: number, x: number, y: number, octaves: number): number {
  let total = 0;
  let amp = 1;
  let freq = 1;
  let max = 0;
  for (let o = 0; o < octaves; o++) {
    total += valueNoise(seed + o * 1009, x * freq, y * freq) * amp;
    max += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return total / max;
}

export function elevationAt(seed: number, i: number, j: number): number {
  return fbm(seed ^ 0xeeeeee, i * 0.03, j * 0.03, 4);
}

export const MAX_TERRAIN_HEIGHT_PX = 76;
const WATER_LEVEL = 0.30;

export function heightAt(seed: number, i: number, j: number): number {
  const b = biomeAt(seed, i, j);
  const p = HEIGHT_PROFILES[b];
  if (p.base === 0 && p.hill === 0) return 0;
  const hill = fbm(seed ^ 0xa1b2c3, i * 0.10, j * 0.10, 3);
  return p.base + hill * p.hill;
}

export function groundHeight(seed: number, gx: number, gy: number): number {
  const i = Math.floor(gx);
  const j = Math.floor(gy);
  const fx = gx - i;
  const fy = gy - j;
  const h00 = heightAt(seed, i, j);
  const h10 = heightAt(seed, i + 1, j);
  const h01 = heightAt(seed, i, j + 1);
  const h11 = heightAt(seed, i + 1, j + 1);
  return (
    h00 * (1 - fx) * (1 - fy) +
    h10 * fx * (1 - fy) +
    h01 * (1 - fx) * fy +
    h11 * fx * fy
  );
}

function biomeRaw(seed: number, i: number, j: number): Biome {
  const elev = elevationAt(seed, i, j);
  if (elev < WATER_LEVEL) return "lake";
  if (elev > 0.85) return "gebirge";
  if (elev > 0.72) return "felsen";

  const r = Math.abs(
    valueNoise(seed ^ 0x717171, i * 0.05 + 17.3, j * 0.05 + 7.7) - 0.5,
  );
  if (r < 0.025 && elev < 0.62) return "river";

  const temp = fbm(seed ^ 0x111111, i * 0.045, j * 0.045, 3);
  const moist = fbm(seed ^ 0x222222, i * 0.055, j * 0.055, 3);
  const dry = temp > 0.58 && moist < 0.5;

  if (dry) {
    const canyonRidge = Math.abs(
      valueNoise(seed ^ 0xc417, i * 0.04 + 5.1, j * 0.04 + 11.7) - 0.5,
    );
    if (canyonRidge < 0.022) return "canyon";
  }

  if (temp > 0.58) {
    if (moist < 0.38) return "wueste";
    if (moist < 0.6) return "savanne";
    return "wald";
  }
  if (moist > 0.6) return "wald";
  return "wiesen";
}

export function biomeAt(seed: number, i: number, j: number): Biome {
  if (isInsideSpawnGuard(seed, i, j)) return "wiesen";
  return biomeRaw(seed, i, j);
}

export function isLandTile(seed: number, i: number, j: number): boolean {
  const b = biomeAt(seed, i, j);
  return b !== "lake" && b !== "river" && b !== "gebirge";
}

export function isInsideSpawnGuard(seed: number, i: number, j: number): boolean {
  const sp = spawnsFromSeed(seed);
  for (const a of sp) {
    if (
      Math.abs(i - a.cx) <= SPAWN_GUARD_RADIUS &&
      Math.abs(j - a.cy) <= SPAWN_GUARD_RADIUS
    ) {
      return true;
    }
  }
  return false;
}

export function hasTreeAt(seed: number, i: number, j: number): boolean {
  if (isInsideSpawnGuard(seed, i, j)) return false;
  const biome = biomeRaw(seed, i, j);
  if (
    biome === "lake" ||
    biome === "river" ||
    biome === "felsen" ||
    biome === "gebirge" ||
    biome === "canyon"
  ) return false;
  let threshold: number;
  switch (biome) {
    case "wald":
      threshold = 0.45;
      break;
    case "wiesen":
      threshold = 0.78;
      break;
    case "savanne":
      threshold = 0.88;
      break;
    case "wueste":
      threshold = 0.96;
      break;
    default:
      threshold = 1;
  }
  const a = rand01(seed ^ 0x37a, i, j);
  const b =
    rand01(seed ^ 0xb1b, Math.floor(i / 3), Math.floor(j / 3)) * 0.6;
  return a * 0.55 + b * 0.45 > threshold;
}

export function treeIdAt(i: number, j: number): string {
  return `t_${i}_${j}`;
}

export function parseTreeId(id: string): { i: number; j: number } | null {
  const m = id.match(/^t_(-?\d+)_(-?\d+)$/);
  if (!m) return null;
  return { i: Number(m[1]), j: Number(m[2]) };
}

export function treeWoodAt(seed: number, i: number, j: number): number {
  return 18 + (hash3(seed ^ 0x77, i, j) % 12);
}

export function hasBushAt(seed: number, i: number, j: number): boolean {
  if (isInsideSpawnGuard(seed, i, j)) return false;
  if (hasTreeAt(seed, i, j)) return false;
  if (biomeAt(seed, i, j) !== "wiesen") return false;
  return rand01(seed ^ 0xb05, i, j) < 0.045;
}

export function bushIdAt(i: number, j: number): string {
  return `b_${i}_${j}`;
}

export function parseBushId(id: string): { i: number; j: number } | null {
  const m = id.match(/^b_(-?\d+)_(-?\d+)$/);
  if (!m) return null;
  return { i: Number(m[1]), j: Number(m[2]) };
}

export function bushBerriesAt(seed: number, i: number, j: number): number {
  return 6 + (hash3(seed ^ 0xb05, i, j) % 5);
}

export function hasMushroomAt(seed: number, i: number, j: number): boolean {
  if (isInsideSpawnGuard(seed, i, j)) return false;
  if (hasTreeAt(seed, i, j)) return false;
  if (hasBushAt(seed, i, j)) return false;
  const b = biomeAt(seed, i, j);
  if (b !== "wiesen" && b !== "wald") return false;
  return rand01(seed ^ 0x70b, i, j) < (b === "wald" ? 0.06 : 0.025);
}

export function mushroomIdAt(i: number, j: number): string {
  return `m_${i}_${j}`;
}

export function parseMushroomId(id: string): { i: number; j: number } | null {
  const m = id.match(/^m_(-?\d+)_(-?\d+)$/);
  if (!m) return null;
  return { i: Number(m[1]), j: Number(m[2]) };
}

export function mushroomBerriesAt(seed: number, i: number, j: number): number {
  return 2 + (hash3(seed ^ 0x70b, i, j) % 3);
}

export function hasFishAt(seed: number, i: number, j: number): boolean {
  const b = biomeAt(seed, i, j);
  if (b !== "lake" && b !== "river") return false;
  return rand01(seed ^ 0xf15, i, j) < (b === "river" ? 0.04 : 0.05);
}

export function fishIdAt(i: number, j: number): string {
  return `f_${i}_${j}`;
}

export function parseFishId(id: string): { i: number; j: number } | null {
  const m = id.match(/^f_(-?\d+)_(-?\d+)$/);
  if (!m) return null;
  return { i: Number(m[1]), j: Number(m[2]) };
}

export function fishMeatAt(seed: number, i: number, j: number): number {
  return 4 + (hash3(seed ^ 0xf15, i, j) % 4);
}

export function hasStoneAt(seed: number, i: number, j: number): boolean {
  if (isInsideSpawnGuard(seed, i, j)) return false;
  if (hasTreeAt(seed, i, j)) return false;
  if (hasBushAt(seed, i, j)) return false;
  if (hasMushroomAt(seed, i, j)) return false;
  if (!isLandTile(seed, i, j)) return false;
  const b = biomeAt(seed, i, j);
  const base =
    b === "wueste" ? 0.04 :
    b === "savanne" ? 0.03 :
    b === "wald" ? 0.02 :
    0.025;
  return rand01(seed ^ 0x57e, i, j) < base;
}

export function stoneIdAt(i: number, j: number): string {
  return `s_${i}_${j}`;
}

export function parseStoneId(id: string): { i: number; j: number } | null {
  const m = id.match(/^s_(-?\d+)_(-?\d+)$/);
  if (!m) return null;
  return { i: Number(m[1]), j: Number(m[2]) };
}

export function stoneAmountAt(seed: number, i: number, j: number): number {
  return 4 + (hash3(seed ^ 0x57e, i, j) % 4);
}
