import type { PixelSpriteData } from "@/shared/types/pixel";
import { PixelSprite } from "./PixelSprite";

const SIZE = 16;

export type MedalTone = "cyan" | "lime" | "gold" | "magenta" | "violet";

/** O rim, F face, L highlight, S star, R ribbon, r ribbon shade. */
const PALETTES: Record<MedalTone | "locked", Record<string, string>> = {
  cyan: { O: "#0e7490", F: "#22d3ee", L: "#a5f3fc", S: "#ecfeff", R: "#8b5cf6", r: "#5b21b6" },
  lime: { O: "#4d7c0f", F: "#a3e635", L: "#d9f99d", S: "#f7fee7", R: "#22d3ee", r: "#0e7490" },
  gold: { O: "#b45309", F: "#fbbf24", L: "#fde68a", S: "#fffbeb", R: "#fb7185", r: "#9f1239" },
  magenta: { O: "#9d174d", F: "#f472b6", L: "#fbcfe8", S: "#fdf2f8", R: "#a3e635", r: "#4d7c0f" },
  violet: { O: "#5b21b6", F: "#a78bfa", L: "#ddd6fe", S: "#f5f3ff", R: "#fbbf24", r: "#b45309" },
  // A badge still to earn: the same shape in the muted greys of the interface.
  locked: { O: "#2b3566", F: "#3b4680", L: "#5b6ab8", S: "#5b6ab8", R: "#3b4680", r: "#232c57" },
};

/** A five-pointed star in the middle of the face, in pixels (x,y). */
const STAR = new Set(["7,8", "8,8", "5,9", "6,9", "7,9", "8,9", "9,9", "10,9", "6,10", "7,10", "8,10", "9,10", "6,11", "7,11", "8,11", "9,11", "5,12", "6,12", "9,12", "10,12"]);

/** A medal hanging from a ribbon: the shape is the same for every badge, the colours tell them apart. */
export function medalSprite(tone: MedalTone | "locked"): PixelSpriteData {
  const rows: string[] = [];
  const cx = SIZE / 2;
  const cy = 10;
  for (let y = 0; y < SIZE; y += 1) {
    let row = "";
    for (let x = 0; x < SIZE; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= 5.6) {
        if (distance > 4.4) row += "O";
        else if (STAR.has(`${x},${y}`)) row += "S";
        else if (dx + dy < -3) row += "L";
        else row += "F";
      } else if (y <= 4 && (x === 4 + y || x === 5 + y)) row += "R";
      else if (y <= 4 && (x === 11 - y || x === 10 - y)) row += "r";
      else row += ".";
    }
    rows.push(row);
  }
  return { rows, palette: PALETTES[tone] };
}

export interface PixelMedalProps {
  tone: MedalTone;
  /** Shown in grey: a badge still to earn. */
  locked?: boolean;
  scale?: number;
  title?: string;
  className?: string;
}

export function PixelMedal({ tone, locked = false, scale = 3, title, className }: PixelMedalProps) {
  const sprite = medalSprite(locked ? "locked" : tone);
  return <PixelSprite rows={sprite.rows} palette={sprite.palette} scale={scale} title={title} className={className} />;
}
