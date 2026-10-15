import { describe, expect, it } from "vitest";
import { BUG_HEIGHT, DEFENSE_LINE, INVADERS_CONFIG, SHIP_WIDTH, SHIP_Y, createInvaders, stepInvaders, type InvadersState } from "../bug-invaders/simulation";
import { BOTTOM_FLOOR_Y, GOAL_X, KONG_CONFIG, createKong, ladderAt, stepKong, type KongState } from "../bug-kong/simulation";
import { playInvaders, playKong } from "./bots";
import { NO_INPUT, WORLD_WIDTH, overlaps } from "./engine";
import { BUG, BUG_KONG, CADET, ERROR, EXCEPTION, PATCH, SHIP, SHOT } from "./sprites";

const FRAME = 1 / 60;
const run = <S,>(state: S, step: (state: S) => S, frames: number) => {
  let current = state;
  for (let frame = 0; frame < frames; frame += 1) current = step(current);
  return current;
};
const never = () => 0.99;

describe("engine", () => {
  it("tells overlapping boxes apart from touching ones", () => {
    expect(overlaps({ x: 0, y: 0, width: 4, height: 4 }, { x: 3, y: 3, width: 4, height: 4 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, width: 4, height: 4 }, { x: 4, y: 0, width: 4, height: 4 })).toBe(false);
  });

  it("has sprites with rows of one width and every pixel in their palette", () => {
    for (const sprite of [SHIP, ...BUG, SHOT, ERROR, CADET, EXCEPTION, BUG_KONG, PATCH]) {
      const width = sprite.rows[0].length;
      for (const row of sprite.rows) {
        expect(row).toHaveLength(width);
        for (const pixel of row) if (pixel !== ".") expect(sprite.palette).toHaveProperty(pixel);
      }
    }
  });
});

describe("Invasores de bugs", () => {
  it("lays out the swarm of each difficulty, centred, with its lives", () => {
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const state = createInvaders(difficulty);
      const { rows, columns, lives } = INVADERS_CONFIG[difficulty];
      expect(state.bugs).toHaveLength(rows * columns);
      expect(state.lives).toBe(lives);
      const left = Math.min(...state.bugs.map((bug) => bug.x));
      const right = Math.max(...state.bugs.map((bug) => bug.x)) + 10;
      expect(Math.abs(left - (WORLD_WIDTH - right))).toBeLessThan(0.001);
    }
  });

  it("moves the ship with the controls and keeps it on screen", () => {
    const start = createInvaders("normal");
    const right = run(start, (state) => stepInvaders(state, { ...NO_INPUT, right: true }, FRAME, never), 60);
    expect(right.shipX).toBeGreaterThan(start.shipX);
    const wall = run(start, (state) => stepInvaders(state, { ...NO_INPUT, left: true }, FRAME, never), 600);
    expect(wall.shipX).toBe(0);
    expect(run(start, (state) => stepInvaders(state, { ...NO_INPUT, right: true }, FRAME, never), 600).shipX).toBe(WORLD_WIDTH - SHIP_WIDTH);
  });

  it("fires on its own and a shot takes one bug", () => {
    // A swarm that stands still, one bug right above the ship.
    const easy = createInvaders("easy");
    const start: InvadersState = { ...easy, config: { ...easy.config, march: 0 }, bugs: [{ x: 75, y: 150 }, { x: 10, y: 30 }] };
    const later = run(start, (state) => stepInvaders(state, NO_INPUT, FRAME, never), 60);
    expect(later.bugs).toEqual([{ x: 10, y: 30 }]);
    expect(later.status).toBe("playing");
  });

  it("stops a shot at the first bug it hits: the one behind survives until the next shot", () => {
    const easy = createInvaders("easy");
    const start: InvadersState = { ...easy, config: { ...easy.config, march: 0 }, bugs: [{ x: 75, y: 150 }, { x: 75, y: 120 }, { x: 10, y: 30 }], dropIn: 99 };
    let state = start;
    while (state.bugs.length === 3) state = stepInvaders(state, NO_INPUT, FRAME, never);
    expect(state.bugs).toContainEqual({ x: 75, y: 120 });
    state = run(state, (current) => stepInvaders(current, NO_INPUT, FRAME, never), 15);
    expect(state.bugs).toContainEqual({ x: 75, y: 120 });
  });

  it("marches, turns at the side and steps down", () => {
    const start: InvadersState = { ...createInvaders("normal"), bugs: [{ x: 140, y: 30 }] };
    const turned = run(start, (state) => stepInvaders(state, { ...NO_INPUT, left: true }, FRAME, never), 120);
    expect(turned.direction).toBe(-1);
    expect(turned.bugs[0]?.y ?? 36).toBe(36);
  });

  it("loses a life to an error, then is untouchable for a moment", () => {
    const start: InvadersState = { ...createInvaders("easy"), errors: [{ x: 80, y: SHIP_Y - 2 }, { x: 80, y: SHIP_Y - 1 }], dropIn: 99 };
    const hit = stepInvaders({ ...start, shipX: 74 }, NO_INPUT, FRAME, never);
    expect(hit.lives).toBe(start.lives - 1);
    expect(hit.invulnerable).toBeGreaterThan(1);
    const again = stepInvaders(hit, NO_INPUT, FRAME, never);
    expect(again.lives).toBe(hit.lives);
  });

  it("loses when a bug reaches the line, when the lives run out or when time runs out, and then stops", () => {
    const landed = stepInvaders({ ...createInvaders("easy"), bugs: [{ x: 60, y: DEFENSE_LINE - BUG_HEIGHT }] }, NO_INPUT, FRAME, never);
    expect(landed.status).toBe("lost");
    const out = stepInvaders({ ...createInvaders("hard"), errors: [{ x: 80, y: SHIP_Y - 1 }], shipX: 74, dropIn: 99 }, NO_INPUT, FRAME, never);
    expect(out.status).toBe("lost");
    const late = stepInvaders({ ...createInvaders("normal"), time: 59.999 }, NO_INPUT, FRAME, never);
    expect(late.status).toBe("lost");
    expect(stepInvaders(late, { ...NO_INPUT, right: true }, FRAME, never)).toBe(late);
  });

  it("can be won at every difficulty and lost by a careless player", () => {
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      expect([1, 2, 3, 4, 5].filter((seed) => playInvaders(difficulty, seed) === "won").length).toBeGreaterThanOrEqual(4);
    }
    expect([1, 2, 3, 4, 5].filter((seed) => playInvaders("hard", seed, 0.3) === "lost").length).toBeGreaterThanOrEqual(3);
  });
});

describe("Bug Kong", () => {
  it("builds the station of each difficulty: floors up to the bug, ladders zigzagging, the last one away from the bug", () => {
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const state = createKong(difficulty);
      const { floors, lives } = KONG_CONFIG[difficulty];
      expect(state.floorsY).toHaveLength(floors);
      expect(state.floorsY[0]).toBe(BOTTOM_FLOOR_Y);
      expect(state.ladders).toHaveLength(floors - 1);
      expect(state.ladders.at(-1)!.x).toBeGreaterThan(GOAL_X + 40);
      expect(state.lives).toBe(lives);
    }
  });

  it("walks, climbs a ladder up and back down, and jumps and lands", () => {
    const start = createKong("normal");
    const ladder = start.ladders[0];
    const atLadder: KongState = { ...start, player: { ...start.player, x: ladder.x }, throwIn: 99 };
    expect(ladderAt(atLadder, ladder.x, 0, "up")).toBe(ladder);

    const up = run(atLadder, (state) => stepKong(state, { ...NO_INPUT, up: true }, FRAME, never), 180);
    expect(up.player).toMatchObject({ floor: 1, ladder: null, y: start.floorsY[1] });
    const down = run(up, (state) => stepKong(state, { ...NO_INPUT, down: true }, FRAME, never), 180);
    expect(down.player).toMatchObject({ floor: 0, ladder: null, y: start.floorsY[0] });

    const jumped = stepKong(atLadder, { ...NO_INPUT, action: true }, FRAME, never);
    expect(jumped.player.airborne).toBe(true);
    const landed = run(jumped, (state) => stepKong(state, NO_INPUT, FRAME, never), 60);
    expect(landed.player).toMatchObject({ airborne: false, y: start.floorsY[0] });

    // No second jump in the air.
    const midAir = run(jumped, (state) => stepKong(state, NO_INPUT, FRAME, never), 10);
    expect(stepKong(midAir, { ...NO_INPUT, action: true }, FRAME, never).player).toEqual(stepKong(midAir, NO_INPUT, FRAME, never).player);

    const walked = run(atLadder, (state) => stepKong(state, { ...NO_INPUT, left: true }, FRAME, never), 30);
    expect(walked.player.x).toBeLessThan(ladder.x);
  });

  it("throws exceptions that roll off a floor's end and drop to the one below, reversing", () => {
    const start: KongState = { ...createKong("easy"), throwIn: 0 };
    const thrown = stepKong(start, NO_INPUT, FRAME, never);
    expect(thrown.exceptions).toHaveLength(1);
    expect(thrown.exceptions[0]).toMatchObject({ floor: 2, direction: 1 });
    const later = run(thrown, (state) => stepKong({ ...state, throwIn: 99 }, NO_INPUT, FRAME, never), 60 * 6);
    expect(later.exceptions[0]).toMatchObject({ floor: 1, direction: -1 });
  });

  it("loses a life to an exception, wins at the bug, and loses with no lives or no time", () => {
    const start = createKong("easy");
    const top = start.floorsY.length - 1;
    const hit = stepKong({ ...start, exceptions: [{ x: start.player.x, y: start.floorsY[0], floor: 0, target: 0, direction: 1 }], throwIn: 99 }, NO_INPUT, FRAME, never);
    expect(hit.lives).toBe(start.lives - 1);
    expect(hit.exceptions).toHaveLength(0);
    // Right after a hit, another exception does not cost a second life.
    const again = stepKong({ ...hit, exceptions: [{ x: hit.player.x, y: hit.floorsY[0], floor: 0, target: 0, direction: 1 }] }, NO_INPUT, FRAME, never);
    expect(again.lives).toBe(hit.lives);

    const won = stepKong({ ...start, player: { ...start.player, floor: top, y: start.floorsY[top], x: GOAL_X }, throwIn: 99 }, NO_INPUT, FRAME, never);
    expect(won.status).toBe("won");
    // Arriving on the top floor is not enough: the patch is beside the bug.
    const arrived = stepKong({ ...start, player: { ...start.player, floor: top, y: start.floorsY[top], x: GOAL_X + 60 }, throwIn: 99 }, NO_INPUT, FRAME, never);
    expect(arrived.status).toBe("playing");
    const out = stepKong({ ...start, lives: 1, exceptions: [{ x: start.player.x, y: start.floorsY[0], floor: 0, target: 0, direction: 1 }], throwIn: 99 }, NO_INPUT, FRAME, never);
    expect(out.status).toBe("lost");
    expect(stepKong({ ...start, time: 74.999, throwIn: 99 }, NO_INPUT, FRAME, never).status).toBe("lost");
  });

  it("can be won at every difficulty and lost by a careless player", () => {
    expect([1, 2, 3, 4, 5].filter((seed) => playKong("easy", seed) === "won").length).toBeGreaterThanOrEqual(4);
    expect([1, 2, 3, 4, 5].filter((seed) => playKong("normal", seed) === "won").length).toBeGreaterThanOrEqual(4);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].some((seed) => playKong("hard", seed) === "won")).toBe(true);
    expect([1, 2, 3, 4, 5].filter((seed) => playKong("normal", seed, 0) === "lost").length).toBeGreaterThanOrEqual(3);
  });
});
