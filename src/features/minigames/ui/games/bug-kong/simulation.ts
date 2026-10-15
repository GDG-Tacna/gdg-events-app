import type { Difficulty } from "../../../domain/catalog";
import { WORLD_WIDTH, clamp, overlaps, type ArcadeInput, type ArcadeStatus, type Box } from "../arcade/engine";

/**
 * "Bug Kong": a space station of flat floors joined by ladders. The giant bug on the top floor throws rolling
 * exceptions; they roll along each floor, drop off its end to the floor below and reverse. The cadet walks,
 * climbs and jumps over them to reach the bug and apply the patch. Units are world pixels and seconds; `y` grows
 * downwards and a floor's `y` is where feet stand.
 */
export interface KongConfig {
  floors: number;
  lives: number;
  seconds: number;
  /** Seconds between two throws. */
  throwEvery: number;
  rollSpeed: number;
  /** Chance that an exception takes a ladder down when it passes the top of one (hard only). */
  ladderChance: number;
}

export const KONG_CONFIG: Readonly<Record<Difficulty, KongConfig>> = {
  easy: { floors: 3, lives: 3, seconds: 75, throwEvery: 3.2, rollSpeed: 38, ladderChance: 0 },
  normal: { floors: 4, lives: 2, seconds: 60, throwEvery: 2.6, rollSpeed: 46, ladderChance: 0 },
  hard: { floors: 5, lives: 1, seconds: 50, throwEvery: 2.3, rollSpeed: 52, ladderChance: 0.25 },
};

export const PLAYER_WIDTH = 8;
export const PLAYER_HEIGHT = 10;
export const EXCEPTION_SIZE = 8;
export const BOTTOM_FLOOR_Y = 228;
const TOP_FLOOR_Y = 44;
const WALK_SPEED = 52;
const CLIMB_SPEED = 40;
const JUMP_SPEED = 120;
const GRAVITY = 380;
const FALL_SPEED = 120;
const LADDER_REACH = 5;
const INVULNERABLE_SECONDS = 1.2;
/** Reaching this x on the top floor (beside the bug) applies the patch. */
export const GOAL_X = 36;

export interface Ladder {
  x: number;
  /** The floor it starts on (its foot); it reaches the floor above. */
  floor: number;
}

export interface Exception {
  x: number;
  y: number;
  /** The floor it rolls on, or `null` while it falls or slides down a ladder to `target`. */
  floor: number | null;
  target: number;
  direction: 1 | -1;
}

export interface KongState {
  config: KongConfig;
  status: ArcadeStatus;
  time: number;
  lives: number;
  floorsY: number[];
  ladders: Ladder[];
  /** `ladder` is the floor at the foot of the ladder being climbed, or `null` off ladders. */
  player: { x: number; y: number; vy: number; floor: number; ladder: number | null; airborne: boolean };
  exceptions: Exception[];
  throwIn: number;
  invulnerable: number;
}

/**
 * Floor 0 is the bottom; the last floor is the bug's. Ladders alternate sides so the path zigzags up, and the last
 * one arrives on the side away from the bug, so the top floor has to be crossed under fire.
 */
export function createKong(difficulty: Difficulty): KongState {
  const config = KONG_CONFIG[difficulty];
  const gap = (BOTTOM_FLOOR_Y - TOP_FLOOR_Y) / (config.floors - 1);
  const floorsY = Array.from({ length: config.floors }, (_, floor) => BOTTOM_FLOOR_Y - floor * gap);
  const last = config.floors - 2;
  const ladders: Ladder[] = Array.from({ length: config.floors - 1 }, (_, floor) => ({ x: (last - floor) % 2 === 0 ? WORLD_WIDTH - 28 : 40, floor }));
  return {
    config,
    status: "playing",
    time: 0,
    lives: config.lives,
    floorsY,
    ladders,
    player: { x: 12, y: floorsY[0], vy: 0, floor: 0, ladder: null, airborne: false },
    exceptions: [],
    throwIn: 1,
    invulnerable: 0,
  };
}

const playerBox = (player: KongState["player"]): Box => ({ x: player.x + 1, y: player.y - PLAYER_HEIGHT + 1, width: PLAYER_WIDTH - 2, height: PLAYER_HEIGHT - 2 });
const exceptionBox = (exception: Exception): Box => ({ x: exception.x + 1, y: exception.y - EXCEPTION_SIZE + 1, width: EXCEPTION_SIZE - 2, height: EXCEPTION_SIZE - 2 });

/** The ladder the player can take from where they stand: up from this floor, or down to the one below. */
export function ladderAt(state: KongState, x: number, floor: number, way: "up" | "down"): Ladder | undefined {
  const centre = x + PLAYER_WIDTH / 2;
  return state.ladders.find((ladder) => Math.abs(ladder.x + 4 - centre) <= LADDER_REACH && (way === "up" ? ladder.floor === floor : ladder.floor === floor - 1));
}

function movePlayer(state: KongState, input: ArcadeInput, dt: number): KongState["player"] {
  const { floorsY } = state;
  const player = { ...state.player };
  const top = floorsY.length - 1;

  if (player.ladder !== null) {
    const from = floorsY[player.ladder];
    const to = floorsY[player.ladder + 1];
    const climb = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    player.y = clamp(player.y + climb * CLIMB_SPEED * dt, to, from);
    if (player.y <= to) Object.assign(player, { ladder: null, floor: player.ladder + 1, y: to });
    else if (player.y >= from) Object.assign(player, { ladder: null, floor: player.ladder, y: from });
    return player;
  }

  // Ladders: up from this floor, or down from it to the floor below.
  if (!player.airborne && input.up && player.floor < top) {
    const ladder = ladderAt(state, player.x, player.floor, "up");
    if (ladder) return { ...player, x: ladder.x, ladder: ladder.floor, y: player.y - 1 };
  }
  if (!player.airborne && input.down && player.floor > 0) {
    const ladder = ladderAt(state, player.x, player.floor, "down");
    if (ladder) return { ...player, x: ladder.x, ladder: ladder.floor, y: player.y + 1 };
  }

  const walk = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  player.x = clamp(player.x + walk * WALK_SPEED * dt, 0, WORLD_WIDTH - PLAYER_WIDTH);

  if (!player.airborne && input.action) Object.assign(player, { airborne: true, vy: -JUMP_SPEED });
  if (player.airborne) {
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y >= floorsY[player.floor]) Object.assign(player, { y: floorsY[player.floor], vy: 0, airborne: false });
  }
  return player;
}

function moveExceptions(state: KongState, dt: number, random: () => number): Exception[] {
  const { floorsY, config } = state;
  const moved: Exception[] = [];
  for (const exception of state.exceptions) {
    if (exception.floor === null) {
      // Falling (off an edge or down a ladder) until it lands on its target floor, then rolls the other way.
      const y = exception.y + FALL_SPEED * dt;
      if (y >= floorsY[exception.target]) moved.push({ ...exception, y: floorsY[exception.target], floor: exception.target, direction: exception.direction === 1 ? -1 : 1 });
      else moved.push({ ...exception, y });
      continue;
    }
    const x = exception.x + exception.direction * config.rollSpeed * dt;
    const ladder = state.ladders.find((candidate) => candidate.floor === exception.floor! - 1 && Math.abs(candidate.x - x) < 1.5);
    if (ladder && config.ladderChance > 0 && random() < config.ladderChance * dt * 20) {
      moved.push({ ...exception, x: ladder.x, floor: null, target: ladder.floor });
      continue;
    }
    if (x < -EXCEPTION_SIZE || x > WORLD_WIDTH) {
      // Off the end of the bottom floor it is gone; off any other floor it drops to the one below.
      if (exception.floor > 0) moved.push({ ...exception, x: clamp(x, 0, WORLD_WIDTH - EXCEPTION_SIZE), floor: null, target: exception.floor - 1 });
      continue;
    }
    moved.push({ ...exception, x });
  }
  return moved;
}

/** One step of the world: `dt` seconds with this input. Pure; a finished game never changes. */
export function stepKong(state: KongState, input: ArcadeInput, dt: number, random: () => number = Math.random): KongState {
  if (state.status !== "playing") return state;
  const time = state.time + dt;
  const player = movePlayer(state, input, dt);
  let exceptions = moveExceptions(state, dt, random);

  // The bug throws a new exception from its floor, rolling towards the far side.
  let throwIn = state.throwIn - dt;
  if (throwIn <= 0) {
    const top = state.floorsY.length - 1;
    exceptions = [...exceptions, { x: 22, y: state.floorsY[top], floor: top, target: top, direction: 1 }];
    throwIn += state.config.throwEvery;
  }

  let lives = state.lives;
  let invulnerable = Math.max(0, state.invulnerable - dt);
  const hit = exceptions.find((exception) => overlaps(playerBox(player), exceptionBox(exception)));
  if (hit) {
    exceptions = exceptions.filter((exception) => exception !== hit);
    if (invulnerable === 0) {
      lives -= 1;
      invulnerable = INVULNERABLE_SECONDS;
    }
  }

  const top = state.floorsY.length - 1;
  const reached = player.floor === top && player.ladder === null && player.x <= GOAL_X;
  const status: ArcadeStatus = reached ? "won" : lives <= 0 || time >= state.config.seconds ? "lost" : "playing";
  return { ...state, status, time, lives, player, exceptions, throwIn, invulnerable };
}
