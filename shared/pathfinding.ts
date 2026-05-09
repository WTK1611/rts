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

export interface PathOptions {
  margin?: number;
  maxNodes?: number;
}

export function findPath(
  isWalkable: (i: number, j: number) => boolean,
  startI: number,
  startJ: number,
  goalI: number,
  goalJ: number,
  extraBlocked?: Set<string>,
  opts: PathOptions = {},
): Cell[] | null {
  const margin = opts.margin ?? 30;
  const maxNodes = opts.maxNodes ?? 4000;
  const minI = Math.min(startI, goalI) - margin;
  const maxI = Math.max(startI, goalI) + margin;
  const minJ = Math.min(startJ, goalJ) - margin;
  const maxJ = Math.max(startJ, goalJ) + margin;
  const inBox = (i: number, j: number) =>
    i >= minI && j >= minJ && i <= maxI && j <= maxJ;
  const isBlocked = (i: number, j: number) =>
    !inBox(i, j) || !isWalkable(i, j) || (extraBlocked?.has(`${i},${j}`) ?? false);
  if (isBlocked(goalI, goalJ)) return null;
  if (startI === goalI && startJ === goalJ) return [{ i: startI, j: startJ }];

  const stride = maxI - minI + 1;
  const key = (i: number, j: number) => (j - minJ) * stride + (i - minI);
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

  let visited = 0;
  while (open.size > 0) {
    if (++visited > maxNodes) return null;
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
      if (!inBox(ni, nj)) continue;
      const nk = key(ni, nj);
      if (closed.has(nk)) continue;
      if (isBlocked(ni, nj)) continue;
      if (di !== 0 && dj !== 0) {
        if (isBlocked(cur.i + di, cur.j) || isBlocked(cur.i, cur.j + dj)) continue;
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
