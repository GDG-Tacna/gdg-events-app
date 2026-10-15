import type { PixelSpriteData } from "@/shared/types/pixel";
import { PixelSprite } from "./PixelSprite";

/** Gold five-point star for XP Estelar. Y gold, L highlight, O shade. */
const BASE: readonly string[] = [
  "................",
  ".......YY.......",
  ".......YY.......",
  "......YYYY......",
  "......YYYY......",
  ".YYYYYYYYYYYYYY.",
  "..YYYYYYYYYYYY..",
  "...YYYYYYYYYY...",
  "....YYYYYYYY....",
  "....YYYYYYYY....",
  "...YYYYYYYYYY...",
  "...YYYY..YYYY...",
  "..YYYY....YYYY..",
  "..YYY......YYY..",
  ".YYY........YYY.",
  ".YY..........YY.",
];

export function starSprite(): PixelSpriteData {
  const rows = BASE.map((row, y) =>
    [...row]
      .map((cell, x) => {
        if (cell !== "Y") return cell;
        if (y <= 8 && x + y < 13) return "L"; // light from the upper left
        if (y >= 8 && x >= 9) return "O"; // shade at the lower right
        return "Y";
      })
      .join(""),
  );
  return { rows, palette: { Y: "#fbbf24", L: "#fde68a", O: "#d97706" } };
}

export interface PixelStarProps {
  scale?: number;
  title?: string;
  className?: string;
}

export function PixelStar({ scale = 2, title, className }: PixelStarProps) {
  const sprite = starSprite();
  return <PixelSprite rows={sprite.rows} palette={sprite.palette} scale={scale} title={title} className={className} />;
}
