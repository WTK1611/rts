export const SPATIAL_CELL = 8;
const SPATIAL_BIAS = 32768;

export function gridKey(cx: number, cy: number): number {
  return (cx + SPATIAL_BIAS) * 65536 + (cy + SPATIAL_BIAS);
}

export function pushBucket<T>(m: Map<number, T[]>, key: number, value: T): void {
  const arr = m.get(key);
  if (arr) arr.push(value);
  else m.set(key, [value]);
}

export function updateBucketForId(id: string, buckets: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % buckets;
}
