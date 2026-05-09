export interface Tile {
  walkable: boolean;
}

export class GameMap {
  width: number;
  height: number;
  tiles: Tile[][];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.tiles = [];
    for (let j = 0; j < height; j++) {
      const row: Tile[] = [];
      for (let i = 0; i < width; i++) row.push({ walkable: true });
      this.tiles.push(row);
    }
  }

  inBounds(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.width && j < this.height;
  }

  isWalkable(i: number, j: number): boolean {
    return this.inBounds(i, j) && this.tiles[j][i].walkable;
  }

  setWalkable(i: number, j: number, walkable: boolean): void {
    if (this.inBounds(i, j)) this.tiles[j][i].walkable = walkable;
  }
}
