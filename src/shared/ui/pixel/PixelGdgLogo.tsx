import type { PixelSpriteData } from "@/shared/types/pixel";
import { PixelSprite } from "./PixelSprite";

/**
 * The GDG Tacna mark ("< >" in red, blue, green and yellow) as a 16-bit pixel rendition, approved by the organizer on
 * 2026-10-12 like the squads' marks: drawn over the official shapes and colors, never the wordmark. Each arm is a
 * rounded stroke shaded in three tones, lit from the upper left, with a dark outline. 28x16.
 */
const WIDTH = 28;
const HEIGHT = 16;
const RADIUS = 1.55;

/** Drawn in order: an arm drawn later covers the one before it at the chevron's tip, as in the official mark. */
const ARMS = [
  { key: "r", from: [10.8, 3.2], to: [3.6, 8] },
  { key: "b", from: [3.6, 8], to: [10.8, 12.8] },
  { key: "y", from: [24.4, 8], to: [17.2, 12.8] },
  { key: "g", from: [17.2, 3.2], to: [24.4, 8] },
] as const;

/** The keys of each arm's light and shadow tones (its base is its own key). */
const TONES = { r: { light: "R", shadow: "1" }, b: { light: "B", shadow: "2" }, g: { light: "G", shadow: "3" }, y: { light: "Y", shadow: "4" } } as const;

function drawRows(): string[] {
  const grid: string[][] = Array.from({ length: HEIGHT }, () => Array<string>(WIDTH).fill("."));
  for (const arm of ARMS) {
    const [ax, ay] = arm.from;
    const [bx, by] = arm.to;
    const vx = bx - ax;
    const vy = by - ay;
    const length2 = vx * vx + vy * vy;
    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const px = x + 0.5;
        const py = y + 0.5;
        const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / length2));
        const dx = px - (ax + t * vx);
        const dy = py - (ay + t * vy);
        if (Math.hypot(dx, dy) > RADIUS) continue;
        const lit = -(dx * 0.6 + dy * 0.8) / RADIUS;
        grid[y][x] = lit > 0.35 ? TONES[arm.key].light : lit < -0.4 ? TONES[arm.key].shadow : arm.key;
      }
    }
  }
  const rows = grid.map((row) => [...row]);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      if (grid[y][x] !== ".") continue;
      if ([grid[y][x - 1], grid[y][x + 1], grid[y - 1]?.[x], grid[y + 1]?.[x]].some((cell) => cell !== undefined && cell !== ".")) rows[y][x] = "O";
    }
  }
  return rows.map((row) => row.join(""));
}

/** Keys: R/r/1 red light/base/shadow, B/b/2 blue, G/g/3 green, Y/y/4 yellow, O outline. */
export const gdgLogoSprite: PixelSpriteData = {
  rows: drawRows(),
  palette: {
    R: "#ff8a7a",
    r: "#ea4335",
    "1": "#a8261a",
    B: "#8ab4ff",
    b: "#4285f4",
    "2": "#1f57c3",
    G: "#7fe0a0",
    g: "#34a853",
    "3": "#1d7a39",
    Y: "#ffe08a",
    y: "#fbbc04",
    "4": "#c28a00",
    O: "#0a1030",
  },
};

export interface PixelGdgLogoProps {
  scale?: number;
  /** Accessible name. Without it the mark is decorative. */
  title?: string;
  className?: string;
}

export function PixelGdgLogo({ scale = 2, title, className }: PixelGdgLogoProps) {
  return <PixelSprite rows={gdgLogoSprite.rows} palette={gdgLogoSprite.palette} scale={scale} title={title} className={className} />;
}
