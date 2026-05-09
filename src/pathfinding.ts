import { GameMap } from "./GameMap";

interface Node {
  i: number;
  j: number;
  g: number;
  f: number;
  parent: Node | null;
}

const NEIGHBORS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

export interface Cell {
  i: number;
  j: number;
}

export function findPath(
  map: GameMap,
  startI: number,
  startJ: number,
  goalI: number,
  goalJ: number,
): Cell[] | null {
  if (!map.inBounds(startI, startJ) || !map.isWalkable(goalI, goalJ)) return null;
  if (startI === goalI && startJ === goalJ) return [{ i: startI, j: startJ }];

  const key = (i: number, j: number) => j * map.width + i;
  const open = new Map<number, Node>();
  const closed = new Set<number>();

  const start: Node = {
    i: startI,
    j: startJ,
    g: 0,
    f: octile(startI, startJ, goalI, goalJ),
    parent: null,
  };
  open.set(key(startI, startJ), start);

  while (open.size > 0) {
    let curKey = -1;
    let cur: Node | null = null;
    for (const [k, n] of open) {
      if (!cur || n.f < cur.f) {
        cur = n;
        curKey = k;
      }
    }
    if (!cur) break;

    if (cur.i === goalI && cur.j === goalJ) {
      const path: Cell[] = [];
      let n: Node | null = cur;
      while (n) {
        path.push({ i: n.i, j: n.j });
        n = n.parent;
      }
      return path.reverse();
    }

    open.delete(curKey);
    closed.add(curKey);

    for (const [di, dj, cost] of NEIGHBORS) {
      const ni = cur.i + di;
      const nj = cur.j + dj;
      const nk = key(ni, nj);
      if (closed.has(nk)) continue;
      if (!map.isWalkable(ni, nj)) continue;
      if (di !== 0 && dj !== 0) {
        if (!map.isWalkable(cur.i + di, cur.j) || !map.isWalkable(cur.i, cur.j + dj)) continue;
      }
      const tentativeG = cur.g + cost;
      const existing = open.get(nk);
      if (!existing || tentativeG < existing.g) {
        open.set(nk, {
          i: ni,
          j: nj,
          g: tentativeG,
          f: tentativeG + octile(ni, nj, goalI, goalJ),
          parent: cur,
        });
      }
    }
  }
  return null;
}
