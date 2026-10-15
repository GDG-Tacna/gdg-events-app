/**
 * The small base the two action games share: a fixed world in pixel units, the player's input, boxes that
 * collide, and pixel sprites drawn on a canvas. Simulations are pure (state in, state out) so they can be tested
 * frame by frame without a screen.
 */
export const WORLD_WIDTH = 160;
export const WORLD_HEIGHT = 240;

/** What the controls hold down this frame (on-screen buttons or the keyboard). */
export interface ArcadeInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** Jump (Bug Kong); pressed, not held: the game clears it once used. */
  action: boolean;
}

export const NO_INPUT: ArcadeInput = { left: false, right: false, up: false, down: false, action: false };

export type ArcadeStatus = "playing" | "won" | "lost";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A sprite as rows of palette keys ("." is transparent), like the app's other pixel art. */
export interface Sprite {
  rows: readonly string[];
  palette: Readonly<Record<string, string>>;
}

/** Draws a sprite with its top-left corner at world (x, y), each pixel `scale` screen pixels. */
export function drawSprite(context: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number, scale: number) {
  sprite.rows.forEach((row, rowIndex) => {
    for (let column = 0; column < row.length; column += 1) {
      const color = sprite.palette[row[column]];
      if (!color) continue;
      context.fillStyle = color;
      context.fillRect(Math.round((x + column) * scale), Math.round((y + rowIndex) * scale), scale, scale);
    }
  });
}

/** Longest step a frame may take: after a pause or a slow frame the world never jumps ahead. */
export const MAX_STEP_SECONDS = 0.05;
