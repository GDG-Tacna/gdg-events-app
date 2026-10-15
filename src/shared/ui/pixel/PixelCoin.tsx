import type { PixelSpriteData } from "@/shared/types/pixel";
import { PixelSprite } from "./PixelSprite";

const SIZE = 16;

/** Gold coin for Créditos de Galaxia. O rim, Y face, L highlight, D engraved mark. */
export function coinSprite(): PixelSpriteData {
  const rows: string[] = [];
  for (let y = 0; y < SIZE; y += 1) {
    let row = "";
    for (let x = 0; x < SIZE; x += 1) {
      const dx = x + 0.5 - SIZE / 2;
      const dy = y + 0.5 - SIZE / 2;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > SIZE / 2 - 0.3) row += ".";
      else if (distance > SIZE / 2 - 1.6) row += "O"; // rim
      else if (Math.abs(dx) <= 1 && Math.abs(dy) <= 3) row += "D"; // vertical bar of the mark
      else if (Math.abs(dy) <= 1 && Math.abs(dx) <= 3) row += "D"; // horizontal bar of the mark
      else if (dx + dy < -5.5) row += "L"; // light from the upper left
      else row += "Y";
    }
    rows.push(row);
  }
  return { rows, palette: { O: "#b45309", Y: "#fbbf24", L: "#fde68a", D: "#d97706" } };
}

export interface PixelCoinProps {
  scale?: number;
  title?: string;
  className?: string;
}

export function PixelCoin({ scale = 2, title, className }: PixelCoinProps) {
  const sprite = coinSprite();
  return <PixelSprite rows={sprite.rows} palette={sprite.palette} scale={scale} title={title} className={className} />;
}
