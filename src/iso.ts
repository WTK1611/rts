export const TILE_W = 64;
export const TILE_H = 32;

export interface GridPos {
  gx: number;
  gy: number;
}

export interface ScreenPos {
  x: number;
  y: number;
}

export function gridToScreen(gx: number, gy: number): ScreenPos {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2),
  };
}

export function screenToGrid(x: number, y: number): GridPos {
  const gx = (x / (TILE_W / 2) + y / (TILE_H / 2)) / 2;
  const gy = (y / (TILE_H / 2) - x / (TILE_W / 2)) / 2;
  return { gx, gy };
}
