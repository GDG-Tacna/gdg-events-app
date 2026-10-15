import type { Difficulty } from "../../../domain/catalog";
import { BUG_WIDTH, SHIP_WIDTH, SHIP_Y, createInvaders, stepInvaders } from "../bug-invaders/simulation";
import { EXCEPTION_SIZE, GOAL_X, PLAYER_WIDTH, createKong, ladderAt, stepKong, type KongState } from "../bug-kong/simulation";
import { NO_INPUT, type ArcadeInput, type ArcadeStatus } from "./engine";

/**
 * Simple players for tests: they prove each difficulty can be won (and lost), so a change to the rules that
 * makes a game impossible or trivial shows up. Not used by the app.
 */
const FRAME = 1 / 60;

export function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

/** Stands under the lowest bug and sidesteps errors falling on the ship. */
export function playInvaders(difficulty: Difficulty, seed: number, skill = 1): ArcadeStatus {
  const random = seeded(seed);
  let state = createInvaders(difficulty);
  for (let frame = 0; frame < 60 * 120 && state.status === "playing"; frame += 1) {
    const centre = state.shipX + SHIP_WIDTH / 2;
    const danger = state.errors.find((error) => error.y > SHIP_Y - 40 && Math.abs(error.x - centre) < 10);
    const target = state.bugs.reduce((low, bug) => (bug.y > low.y ? bug : low), state.bugs[0]);
    let input: ArcadeInput = NO_INPUT;
    if (danger && random() < skill) input = { ...NO_INPUT, [danger.x < centre ? "right" : "left"]: true };
    else if (target) {
      const aim = target.x + BUG_WIDTH / 2;
      if (aim > centre + 2) input = { ...NO_INPUT, right: true };
      else if (aim < centre - 2) input = { ...NO_INPUT, left: true };
    }
    state = stepInvaders(state, input, FRAME, random);
  }
  return state.status;
}

/** Walks to the next ladder and climbs; jumps when an exception is close on its floor. */
export function playKong(difficulty: Difficulty, seed: number, skill = 1): ArcadeStatus {
  const random = seeded(seed);
  let state: KongState = createKong(difficulty);
  for (let frame = 0; frame < 60 * 120 && state.status === "playing"; frame += 1) {
    const { player } = state;
    let input: ArcadeInput = NO_INPUT;
    if (player.ladder !== null) input = { ...NO_INPUT, up: true };
    else {
      const top = state.floorsY.length - 1;
      const ladder = state.ladders.find((candidate) => candidate.floor === player.floor);
      const goal = player.floor === top ? GOAL_X - 4 : ladder!.x;
      const near = state.exceptions.find((exception) => exception.floor === player.floor && Math.abs(exception.x + EXCEPTION_SIZE / 2 - (player.x + PLAYER_WIDTH / 2)) < 14);
      if (near && !player.airborne && random() < skill) input = { ...NO_INPUT, action: true };
      else if (player.floor < top && ladderAt(state, player.x, player.floor, "up")) input = { ...NO_INPUT, up: true };
      else if (goal > player.x + 1) input = { ...NO_INPUT, right: true };
      else if (goal < player.x - 1) input = { ...NO_INPUT, left: true };
    }
    state = stepKong(state, input, FRAME, random);
  }
  return state.status;
}
