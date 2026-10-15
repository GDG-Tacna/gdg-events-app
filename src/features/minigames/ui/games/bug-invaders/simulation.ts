import type { Difficulty } from "../../../domain/catalog";
import { WORLD_HEIGHT, WORLD_WIDTH, clamp, overlaps, type ArcadeInput, type ArcadeStatus, type Box } from "../arcade/engine";

/**
 * "Invasores de bugs": rows of bugs march side to side and step down at the edges; the cadet's ship fires on its
 * own and moves left and right. Win by clearing every bug; lose when a bug reaches the line, when the lives run
 * out, or when time runs out. Units are world pixels and seconds.
 */
export interface InvadersConfig {
  rows: number;
  columns: number;
  lives: number;
  seconds: number;
  /** Side speed of the swarm at the start; it speeds up as bugs fall. */
  march: number;
  /** Seconds between two errors dropped by the swarm. */
  dropEvery: number;
}

export const INVADERS_CONFIG: Readonly<Record<Difficulty, InvadersConfig>> = {
  easy: { rows: 3, columns: 6, lives: 3, seconds: 60, march: 10, dropEvery: 1.6 },
  normal: { rows: 4, columns: 7, lives: 2, seconds: 60, march: 12, dropEvery: 1.2 },
  hard: { rows: 5, columns: 8, lives: 1, seconds: 50, march: 15, dropEvery: 0.9 },
};

export const SHIP_Y = 216;
export const SHIP_WIDTH = 12;
export const SHIP_HEIGHT = 8;
export const BUG_WIDTH = 10;
export const BUG_HEIGHT = 8;
/** A bug that reaches this line has landed: the game is lost. */
export const DEFENSE_LINE = 200;
const SHIP_SPEED = 80;
const SHOT_SPEED = 170;
const ERROR_SPEED = 70;
const FIRE_EVERY = 0.4;
const STEP_DOWN = 6;
const MARGIN = 4;
const INVULNERABLE_SECONDS = 1.2;

export interface Bug {
  x: number;
  y: number;
}

export interface InvadersState {
  config: InvadersConfig;
  status: ArcadeStatus;
  time: number;
  lives: number;
  shipX: number;
  bugs: Bug[];
  /** +1 marching right, -1 left. */
  direction: 1 | -1;
  shots: Array<{ x: number; y: number }>;
  errors: Array<{ x: number; y: number }>;
  fireIn: number;
  dropIn: number;
  /** Seconds left without taking hits after a hit. */
  invulnerable: number;
}

export function createInvaders(difficulty: Difficulty): InvadersState {
  const config = INVADERS_CONFIG[difficulty];
  const gap = 4;
  const swarmWidth = config.columns * BUG_WIDTH + (config.columns - 1) * gap;
  const left = (WORLD_WIDTH - swarmWidth) / 2;
  const bugs: Bug[] = [];
  for (let row = 0; row < config.rows; row += 1) {
    for (let column = 0; column < config.columns; column += 1) bugs.push({ x: left + column * (BUG_WIDTH + gap), y: 24 + row * (BUG_HEIGHT + 6) });
  }
  return {
    config,
    status: "playing",
    time: 0,
    lives: config.lives,
    shipX: (WORLD_WIDTH - SHIP_WIDTH) / 2,
    bugs,
    direction: 1,
    shots: [],
    errors: [],
    fireIn: FIRE_EVERY,
    dropIn: config.dropEvery,
    invulnerable: 0,
  };
}

const bugBox = (bug: Bug): Box => ({ x: bug.x, y: bug.y, width: BUG_WIDTH, height: BUG_HEIGHT });
const shipBox = (x: number): Box => ({ x: x + 1, y: SHIP_Y + 2, width: SHIP_WIDTH - 2, height: SHIP_HEIGHT - 2 });

/** One step of the world: `dt` seconds with this input. Pure; a finished game never changes. */
export function stepInvaders(state: InvadersState, input: ArcadeInput, dt: number, random: () => number = Math.random): InvadersState {
  if (state.status !== "playing") return state;
  const { config } = state;
  const time = state.time + dt;
  const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const shipX = clamp(state.shipX + move * SHIP_SPEED * dt, 0, WORLD_WIDTH - SHIP_WIDTH);

  // The swarm marches faster as it thins out, and steps down when it touches a side.
  const remaining = state.bugs.length / (config.rows * config.columns);
  const speed = config.march * (1 + (1 - remaining) * 2.5);
  let direction = state.direction;
  let bugs = state.bugs.map((bug) => ({ x: bug.x + direction * speed * dt, y: bug.y }));
  const touches = bugs.some((bug) => bug.x < MARGIN || bug.x + BUG_WIDTH > WORLD_WIDTH - MARGIN);
  if (touches) {
    direction = direction === 1 ? -1 : 1;
    bugs = bugs.map((bug) => ({ x: clamp(bug.x, MARGIN, WORLD_WIDTH - MARGIN - BUG_WIDTH), y: bug.y + STEP_DOWN }));
  }

  // Auto-fire.
  let fireIn = state.fireIn - dt;
  let shots = state.shots.map((shot) => ({ x: shot.x, y: shot.y - SHOT_SPEED * dt })).filter((shot) => shot.y > -6);
  if (fireIn <= 0) {
    shots = [...shots, { x: shipX + SHIP_WIDTH / 2 - 1, y: SHIP_Y - 4 }];
    fireIn += FIRE_EVERY;
  }

  // Shots hit bugs (each shot takes one bug).
  for (const shot of [...shots]) {
    const hit = bugs.findIndex((bug) => overlaps(bugBox(bug), { x: shot.x, y: shot.y, width: 2, height: 5 }));
    if (hit >= 0) {
      bugs = bugs.filter((_, index) => index !== hit);
      shots = shots.filter((candidate) => candidate !== shot);
    }
  }

  // The lowest bug of a random column drops an error now and then.
  let dropIn = state.dropIn - dt;
  let errors = state.errors.map((error) => ({ x: error.x, y: error.y + ERROR_SPEED * dt })).filter((error) => error.y < WORLD_HEIGHT);
  if (dropIn <= 0 && bugs.length > 0) {
    const shooter = bugs[Math.floor(random() * bugs.length)];
    const lowest = bugs.filter((bug) => Math.abs(bug.x - shooter.x) < 1).reduce((low, bug) => (bug.y > low.y ? bug : low), shooter);
    errors = [...errors, { x: lowest.x + BUG_WIDTH / 2 - 1, y: lowest.y + BUG_HEIGHT }];
    dropIn += config.dropEvery;
  }

  // An error that hits the ship costs a life, then a moment without hits.
  let lives = state.lives;
  let invulnerable = Math.max(0, state.invulnerable - dt);
  const hitBy = errors.find((error) => overlaps(shipBox(shipX), { x: error.x, y: error.y, width: 3, height: 5 }));
  if (hitBy) {
    errors = errors.filter((error) => error !== hitBy);
    if (invulnerable === 0) {
      lives -= 1;
      invulnerable = INVULNERABLE_SECONDS;
    }
  }

  const landed = bugs.some((bug) => bug.y + BUG_HEIGHT >= DEFENSE_LINE);
  const status: ArcadeStatus = bugs.length === 0 ? "won" : lives <= 0 || landed || time >= config.seconds ? "lost" : "playing";
  return { config, status, time, lives, shipX, bugs, direction, shots, errors, fireIn, dropIn, invulnerable };
}
