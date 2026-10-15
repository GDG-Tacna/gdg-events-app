import type { Difficulty } from "../../../domain/catalog";

/**
 * "Conecta los circuitos": a square board of pieces; tapping one rotates it a quarter turn. Energy enters the
 * left side of one row and must reach the core on the right side of another. Every board is generated with a
 * solution: a random path is laid first, the rest is filled with random pieces, then everything is rotated.
 */
export const CIRCUIT_CONFIG: Readonly<Record<Difficulty, { size: number; seconds: number }>> = {
  easy: { size: 4, seconds: 60 },
  normal: { size: 5, seconds: 50 },
  hard: { size: 6, seconds: 40 },
};

/** Sides as bits: up 1, right 2, down 4, left 8. */
export const UP = 1;
export const RIGHT = 2;
export const DOWN = 4;
export const LEFT = 8;

export type PieceKind = "straight" | "corner" | "tee";

/** The sides each kind connects before any rotation. */
const BASE: Readonly<Record<PieceKind, number>> = { straight: UP | DOWN, corner: UP | RIGHT, tee: UP | RIGHT | DOWN };

export interface Tile {
  kind: PieceKind;
  /** Quarter turns clockwise, 0 to 3. */
  rotation: number;
}

export interface Board {
  size: number;
  tiles: Tile[];
  /** Row where the energy enters (left side) and row of the core (right side). */
  sourceRow: number;
  coreRow: number;
}

/** A side mask turned clockwise by quarter turns. */
export function rotateMask(mask: number, turns: number): number {
  let result = mask;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i += 1) {
    result = ((result << 1) | (result >> 3)) & 15;
  }
  return result;
}

export const sidesOf = (tile: Tile) => rotateMask(BASE[tile.kind], tile.rotation);

const OPPOSITE: Readonly<Record<number, number>> = { [UP]: DOWN, [RIGHT]: LEFT, [DOWN]: UP, [LEFT]: RIGHT };
const STEP: ReadonlyArray<[number, number, number]> = [
  [UP, -1, 0],
  [RIGHT, 0, 1],
  [DOWN, 1, 0],
  [LEFT, 0, -1],
];

/** The kind and rotation that connect exactly two sides. */
function pieceFor(sides: number): Tile {
  for (const kind of ["straight", "corner"] as const) {
    for (let rotation = 0; rotation < 4; rotation += 1) {
      if (rotateMask(BASE[kind], rotation) === sides) return { kind, rotation };
    }
  }
  throw new Error(`no piece connects ${sides}`);
}

/** A random path through the board from the left of `sourceRow` to the right edge, never visiting a cell twice. */
function randomPath(size: number, sourceRow: number, random: () => number): Array<[number, number]> | null {
  const path: Array<[number, number]> = [[sourceRow, 0]];
  const seen = new Set([`${sourceRow},0`]);
  const walk = (): boolean => {
    const [row, column] = path[path.length - 1];
    if (column === size - 1 && random() < 0.6) return true;
    // Moves in random order, but right is tried more often so paths finish.
    const moves = STEP.filter(([side]) => side !== LEFT || random() < 0.3).sort(() => random() - 0.5);
    for (const [, dRow, dColumn] of moves) {
      const next: [number, number] = [row + dRow, column + dColumn];
      const key = `${next[0]},${next[1]}`;
      if (next[0] < 0 || next[0] >= size || next[1] < 0 || next[1] >= size || seen.has(key)) continue;
      path.push(next);
      seen.add(key);
      if (walk()) return true;
      path.pop();
      seen.delete(key);
    }
    return column === size - 1;
  };
  return walk() ? path : null;
}

/** A new board with at least one solution, shuffled by rotation. */
export function generateBoard(size: number, random: () => number = Math.random): Board {
  return generatePuzzle(size, random).board;
}

/** The shuffled board and the rotations that solve it (the path it was built on). */
export function generatePuzzle(size: number, random: () => number = Math.random): { board: Board; solution: number[] } {
  const sourceRow = Math.floor(random() * size);
  const path = randomPath(size, sourceRow, random) ?? Array.from({ length: size }, (_, column) => [sourceRow, column] as [number, number]);
  const tiles: Tile[] = Array.from({ length: size * size }, () => {
    const kind = (["straight", "corner", "tee"] as const)[Math.floor(random() * 3)];
    return { kind, rotation: 0 };
  });
  path.forEach(([row, column], index) => {
    const from = index === 0 ? LEFT : sideBetween(path[index - 1], [row, column]);
    const to = index === path.length - 1 ? RIGHT : sideBetween(path[index + 1], [row, column]);
    tiles[row * size + column] = pieceFor(from | to);
  });
  const coreRow = path[path.length - 1][0];
  const solution = tiles.map((tile) => tile.rotation);
  // Shuffle: every piece gets a random rotation, and the board must not start solved.
  const board = unsolve({ size, tiles: tiles.map((tile) => ({ ...tile, rotation: Math.floor(random() * 4) })), sourceRow, coreRow });
  return { board, solution };
}

/** A board that is not already solved: while it is, every piece turns a quarter more (a few times at most). */
export function unsolve(board: Board): Board {
  let current = board;
  for (let tries = 0; isSolved(current) && tries < 10; tries += 1) {
    current = { ...current, tiles: current.tiles.map((tile) => ({ ...tile, rotation: (tile.rotation + 1) % 4 })) };
  }
  return current;
}

/** The side of `cell` that faces `neighbour`. */
function sideBetween(neighbour: [number, number], cell: [number, number]): number {
  const [dRow, dColumn] = [neighbour[0] - cell[0], neighbour[1] - cell[1]];
  if (dRow === -1) return UP;
  if (dRow === 1) return DOWN;
  return dColumn === 1 ? RIGHT : LEFT;
}

export const rotateTile = (board: Board, index: number): Board => ({
  ...board,
  tiles: board.tiles.map((tile, at) => (at === index ? { ...tile, rotation: (tile.rotation + 1) % 4 } : tile)),
});

/** The cells the energy reaches from the source, following only connections open on both sides. */
export function powered(board: Board): Set<number> {
  const { size, tiles } = board;
  const reached = new Set<number>();
  const start = board.sourceRow * size;
  if (!(sidesOf(tiles[start]) & LEFT)) return reached;
  const queue = [start];
  reached.add(start);
  while (queue.length > 0) {
    const index = queue.shift()!;
    const [row, column] = [Math.floor(index / size), index % size];
    const sides = sidesOf(tiles[index]);
    for (const [side, dRow, dColumn] of STEP) {
      if (!(sides & side)) continue;
      const [nextRow, nextColumn] = [row + dRow, column + dColumn];
      if (nextRow < 0 || nextRow >= size || nextColumn < 0 || nextColumn >= size) continue;
      const next = nextRow * size + nextColumn;
      if (reached.has(next) || !(sidesOf(tiles[next]) & OPPOSITE[side])) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  return reached;
}

/** Solved when the energy reaches the core's cell and that piece opens to the right. */
export function isSolved(board: Board): boolean {
  const core = board.coreRow * board.size + board.size - 1;
  return powered(board).has(core) && Boolean(sidesOf(board.tiles[core]) & RIGHT);
}
