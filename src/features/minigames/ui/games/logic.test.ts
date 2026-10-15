import { describe, expect, it } from "vitest";
import { DIFFICULTIES } from "../../domain/catalog";
import { CIRCUIT_CONFIG, DOWN, LEFT, RIGHT, UP, generateBoard, generatePuzzle, isSolved, unsolve, powered, rotateMask, rotateTile, sidesOf, type Board } from "./circuits/logic";
import { CODE_ORDER_CONFIG, ROUNDS, allowedNext, flatLines, isInOrder, pickSnippets, shuffle, shuffleLines } from "./code-order/logic";
import { SNIPPETS } from "./code-order/snippets";
import { JUMPS, WARP_CONFIG, isHit, jumpParams, markerAt, outcome, zoneCenter } from "./warp-timing/logic";

/** A repeatable random sequence for the tests. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

describe("warp timing", () => {
  it("swings the marker from 0 to 1 and back", () => {
    expect(markerAt(0, 0.5)).toBe(0);
    expect(markerAt(0.5, 0.5)).toBeCloseTo(0.5);
    expect(markerAt(1, 0.5)).toBeCloseTo(1);
    expect(markerAt(1.5, 0.5)).toBeCloseTo(0.5);
    expect(markerAt(2, 0.5)).toBeCloseTo(0);
  });

  it("speeds up and narrows the zone jump after jump, harder at each difficulty", () => {
    const first = jumpParams(WARP_CONFIG.normal, 0);
    const last = jumpParams(WARP_CONFIG.normal, JUMPS - 1);
    expect(last.speed).toBeGreaterThan(first.speed);
    expect(last.zone).toBeLessThan(first.zone);
    expect(WARP_CONFIG.easy.zone).toBeGreaterThan(WARP_CONFIG.hard.zone);
    expect(WARP_CONFIG.easy.speed).toBeLessThan(WARP_CONFIG.hard.speed);
    expect(DIFFICULTIES.map((difficulty) => WARP_CONFIG[difficulty].needed)).toEqual([3, 4, 5]);
  });

  it("keeps the zone on the bar and hits only inside it", () => {
    expect(zoneCenter(0.2, 0)).toBeCloseTo(0.1);
    expect(zoneCenter(0.2, 1)).toBeCloseTo(0.9);
    expect(isHit(0.5, 0.5, 0.2)).toBe(true);
    expect(isHit(0.6, 0.5, 0.2)).toBe(true);
    expect(isHit(0.61, 0.5, 0.2)).toBe(false);
    // Exactly on the edge counts.
    expect(isHit(0.75, 0.5, 0.5)).toBe(true);
    expect(isHit(0.25, 0.5, 0.5)).toBe(true);
  });

  it("decides as soon as the result is certain", () => {
    expect(outcome(4, 4, 4)).toBe(true);
    expect(outcome(3, 4, 4)).toBeNull();
    expect(outcome(2, 4, 4)).toBe(false);
    expect(outcome(2, 3, 3)).toBeNull();
    expect(outcome(0, 3, 3)).toBe(false);
  });
});

describe("circuits", () => {
  it("rotates side masks clockwise", () => {
    expect(rotateMask(UP, 1)).toBe(RIGHT);
    expect(rotateMask(LEFT, 1)).toBe(UP);
    expect(rotateMask(UP | RIGHT, 2)).toBe(DOWN | LEFT);
    expect(rotateMask(UP | DOWN, 4)).toBe(UP | DOWN);
    expect(sidesOf({ kind: "straight", rotation: 1 })).toBe(RIGHT | LEFT);
  });

  it("solves a straight row and powers only what is connected", () => {
    const board: Board = { size: 2, sourceRow: 0, coreRow: 0, tiles: [{ kind: "straight", rotation: 1 }, { kind: "straight", rotation: 1 }, { kind: "straight", rotation: 0 }, { kind: "corner", rotation: 0 }] };
    expect(isSolved(board)).toBe(true);
    expect(powered(board)).toEqual(new Set([0, 1]));

    const broken = rotateTile(board, 1);
    expect(isSolved(broken)).toBe(false);
    expect(powered(broken)).toEqual(new Set([0]));
    expect(powered(rotateTile(board, 0)).size).toBe(0);

    // The energy reaches the core's cell, but the piece does not open towards the core.
    const blocked: Board = { ...board, tiles: [board.tiles[0], { kind: "corner", rotation: 2 }, board.tiles[2], board.tiles[3]] };
    expect(powered(blocked).has(1)).toBe(true);
    expect(isSolved(blocked)).toBe(false);

    // A board that comes out solved is turned until it is not.
    expect(isSolved(unsolve(board))).toBe(false);
  });

  it.each(DIFFICULTIES)("generates %s boards that start unsolved and are solved by the path they were built on", (difficulty) => {
    const { size } = CIRCUIT_CONFIG[difficulty];
    for (let seed = 1; seed <= 40; seed += 1) {
      const { board, solution } = generatePuzzle(size, seeded(seed));
      expect(board.tiles).toHaveLength(size * size);
      expect(isSolved(board)).toBe(false);
      expect(isSolved({ ...board, tiles: board.tiles.map((tile, index) => ({ ...tile, rotation: solution[index] })) })).toBe(true);
    }
    expect(generateBoard(size, seeded(1))).toEqual(generatePuzzle(size, seeded(1)).board);
  });
});

describe("code order", () => {
  it("has five snippets of each length per language, each line distinct within its snippet", () => {
    for (const language of ["javascript", "python"] as const) {
      for (const lines of [4, 5, 6]) {
        expect(SNIPPETS.filter((snippet) => snippet.language === language && flatLines(snippet).length === lines)).toHaveLength(5);
      }
    }
    for (const snippet of SNIPPETS) expect(new Set(flatLines(snippet)).size).toBe(flatLines(snippet).length);
    expect(new Set(SNIPPETS.map((snippet) => snippet.id)).size).toBe(SNIPPETS.length);
  });

  it("picks three different snippets of the difficulty's length, only from the edition's languages", () => {
    for (const difficulty of DIFFICULTIES) {
      const picked = pickSnippets(difficulty, ["python"], seeded(7));
      expect(picked).toHaveLength(ROUNDS);
      expect(new Set(picked.map((snippet) => snippet.id)).size).toBe(ROUNDS);
      for (const snippet of picked) {
        expect(snippet.language).toBe("python");
        expect(flatLines(snippet)).toHaveLength(CODE_ORDER_CONFIG[difficulty].lines);
      }
    }
  });

  it("accepts the next line, or any line still missing from a group", () => {
    const greet = SNIPPETS.find((snippet) => snippet.id === "js-greet")!;
    const [alias, squad, message, log] = flatLines(greet);

    expect(allowedNext(greet, [])).toEqual(new Set([alias, squad]));
    expect(allowedNext(greet, [squad])).toEqual(new Set([alias]));
    expect(allowedNext(greet, [squad, alias])).toEqual(new Set([message]));
    expect(allowedNext(greet, [alias, squad, message])).toEqual(new Set([log]));
    expect(allowedNext(greet, [alias, squad, message, log])).toEqual(new Set());
    expect(allowedNext(greet, [message])).toEqual(new Set());
    expect(isInOrder(greet, [squad, alias, message, log])).toBe(true);
    expect(isInOrder(greet, [alias, message, squad, log])).toBe(false);
    expect(isInOrder(greet, [alias, squad, message])).toBe(false);
  });

  it("shuffles the lines into an order that is not already right", () => {
    for (const snippet of SNIPPETS) {
      const shuffled = shuffleLines(snippet, seeded(3));
      expect([...shuffled].sort()).toEqual([...flatLines(snippet)].sort());
      expect(isInOrder(snippet, shuffled)).toBe(false);
    }
  });

  it("shuffles without losing or repeating items", () => {
    expect([...shuffle([1, 2, 3, 4, 5], seeded(11))].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
