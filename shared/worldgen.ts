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
  | "felsen";

export const BIOME_PALETTES: Record<Biome, number[]> = {
  wiesen: [0x355d35, 0x3a6b3a, 0x437a43, 0x2f5a2f, 0x4d8a4d, 0x335a33],
  wald: [0x1e3e1e, 0x244e24, 0x2a5a2a, 0x1b3a1b, 0x305f30, 0x274d27],
  savanne: [0x8c7a3a, 0x9c8a4a, 0xa89640, 0x7a6f30, 0xb4a050, 0x927e3a],
  wueste: [0xd4b878, 0xc8a866, 0xdec189, 0xb89a5a, 0xe7cd99, 0xc7a973],
  lake: [0x1f3e64, 0x244a72, 0x2a5680, 0x1c3658],
  river: [0x356ea0, 0x3a78b0, 0x4486bf, 0x305f8c],
  felsen: [0x6a6a6a, 0x787878, 0x5e5e5e, 0x848484, 0x707070, 0x606060],
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

function biomeRaw(seed: number, i: number, j: number): Biome {
  const elev = fbm(seed ^ 0xeeeeee, i * 0.03, j * 0.03, 4);
  if (elev < 0.33) return "lake";
  if (elev > 0.78) return "felsen";

  const r = Math.abs(
    valueNoise(seed ^ 0x717171, i * 0.05 + 17.3, j * 0.05 + 7.7) - 0.5,
  );
  if (r < 0.025 && elev < 0.62) return "river";

  const temp = fbm(seed ^ 0x111111, i * 0.045, j * 0.045, 3);
  const moist = fbm(seed ^ 0x222222, i * 0.055, j * 0.055, 3);

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
  return b !== "lake" && b !== "river" && b !== "felsen";
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
  if (biome === "lake" || biome === "river" || biome === "felsen") return false;
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
