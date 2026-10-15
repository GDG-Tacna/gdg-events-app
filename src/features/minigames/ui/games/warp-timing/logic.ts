import type { Difficulty } from "../../../domain/catalog";

/**
 * "Salto en el momento justo": a marker swings across the hyperspace bar; a tap while it is inside the green
 * zone is a hit. Five jumps; each one is faster and its zone narrower. Positions go from 0 to 1.
 */
export const JUMPS = 5;
export const TIME_LIMIT_SECONDS = 30;

export interface WarpConfig {
  /** Hits needed out of five. */
  needed: number;
  /** Full sweeps (there and back) per second on the first jump. */
  speed: number;
  /** Width of the green zone on the first jump. */
  zone: number;
}

export const WARP_CONFIG: Readonly<Record<Difficulty, WarpConfig>> = {
  easy: { needed: 3, speed: 0.45, zone: 0.24 },
  normal: { needed: 4, speed: 0.55, zone: 0.2 },
  hard: { needed: 5, speed: 0.65, zone: 0.16 },
};

/** Each jump is a little faster (8%) and its zone a little narrower (6%). */
export function jumpParams(config: WarpConfig, jump: number): { speed: number; zone: number } {
  return { speed: config.speed * 1.08 ** jump, zone: config.zone * 0.94 ** jump };
}

/** Where the marker is after `seconds`: a triangle wave between 0 and 1. */
export function markerAt(seconds: number, speed: number): number {
  const phase = (seconds * speed) % 1;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

/** A zone centre that keeps the whole zone on the bar. */
export const zoneCenter = (zone: number, random: number) => zone / 2 + random * (1 - zone);

export const isHit = (position: number, center: number, zone: number) => Math.abs(position - center) <= zone / 2;

/** Won once enough hits are in, lost once they can no longer be reached; `null` while it is still open. */
export function outcome(hits: number, jumpsDone: number, needed: number): boolean | null {
  if (hits >= needed) return true;
  if (hits + (JUMPS - jumpsDone) < needed) return false;
  return null;
}
