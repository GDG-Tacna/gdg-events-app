import { PixelSprite } from "./PixelSprite";

const PALETTE = {
  H: "#e6eaff",
  h: "#9aa6d8",
  C: "#22d3ee",
  c: "#0e7490",
  V: "#8b5cf6",
  F: "#fbbf24",
  f: "#f97316",
} as const;

const WIDTH = 24;

/** "GDG Tacna Enterprise", 24x11, facing right. Rows are padded to a fixed width. */
const ROWS: readonly string[] = [
  ".....hhhhhh.............",
  "...hhHHHHHHHhh..........",
  ".VVhHHHHHHHHHHhhh.......",
  "FVVhHHHHHHHHHHHHHhhh....",
  "fFVhHHHHHHHccCCHHHHHhh..",
  "fFVhHHHHHHccCCCCHHHHHHhh",
  "fFVhHHHHHHHccCCHHHHHhh..",
  "FVVhHHHHHHHHHHHHHhhh....",
  ".VVhHHHHHHHHHHhhh.......",
  "...hhHHHHHHHhh..........",
  ".....hhhhhh.............",
].map((row) => row.padEnd(WIDTH, ".").slice(0, WIDTH));

export interface PixelShipProps {
  scale?: number;
  title?: string;
  className?: string;
}

export function PixelShip({ scale = 3, title, className }: PixelShipProps) {
  return <PixelSprite rows={ROWS} palette={PALETTE} scale={scale} title={title} className={className} />;
}
