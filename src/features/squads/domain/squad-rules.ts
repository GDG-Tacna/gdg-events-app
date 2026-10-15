import type { PixelSpriteData } from "@/shared/types/pixel";

/** Squad logos are 16x16 pixel art (Design System exception for squads). */
export const LOGO_SIZE = 16;
/** Enough for the official marks' colors plus shading, few enough to stay readable at 16 pixels. */
export const LOGO_MAX_COLORS = 8;
export const SQUAD_NAME_MIN = 2;
export const SQUAD_NAME_MAX = 40;
export const SQUAD_TAGLINE_MIN = 2;
export const SQUAD_TAGLINE_MAX = 80;

const PALETTE_KEY = /^[A-Za-z0-9]$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const normalizeText = (input: string, min: number, max: number): string | null => {
  const text = input.trim().replace(/\s+/g, " ");
  return text.length >= min && text.length <= max ? text : null;
};

export const normalizeSquadName = (input: string) => normalizeText(input, SQUAD_NAME_MIN, SQUAD_NAME_MAX);
export const normalizeTagline = (input: string) => normalizeText(input, SQUAD_TAGLINE_MIN, SQUAD_TAGLINE_MAX);

/**
 * A logo the app can draw and store, or `null`: exactly 16 rows of 16 cells, each cell transparent (".")
 * or a palette key; at most 8 colors written as `#rrggbb` (normalized to lowercase); at least one painted
 * pixel. Palette entries nobody uses are dropped so the stored logo stays small.
 */
export function validateLogo(input: unknown): PixelSpriteData | null {
  if (typeof input !== "object" || input === null) return null;
  const { rows, palette } = input as { rows?: unknown; palette?: unknown };

  if (!Array.isArray(rows) || rows.length !== LOGO_SIZE) return null;
  if (!rows.every((row) => typeof row === "string" && row.length === LOGO_SIZE)) return null;
  if (typeof palette !== "object" || palette === null || Array.isArray(palette)) return null;

  const entries = Object.entries(palette as Record<string, unknown>);
  if (entries.length > LOGO_MAX_COLORS) return null;
  if (!entries.every(([key, color]) => PALETTE_KEY.test(key) && typeof color === "string" && HEX_COLOR.test(color))) return null;

  const keys = new Set(entries.map(([key]) => key));
  const used = new Set<string>();
  for (const row of rows as string[]) {
    for (const cell of row) {
      if (cell === ".") continue;
      if (!keys.has(cell)) return null;
      used.add(cell);
    }
  }
  if (used.size === 0) return null;

  const cleaned: Record<string, string> = {};
  for (const [key, color] of entries) if (used.has(key)) cleaned[key] = (color as string).toLowerCase();
  return { rows: [...(rows as string[])], palette: cleaned };
}

/**
 * A plain shield, kept as the pixel logo of a squad whose logo was uploaded and not drawn: every squad keeps a
 * pixel fallback (the record always has a sprite), and the admin is not made to draw one.
 */
export const FALLBACK_LOGO: PixelSpriteData = {
  rows: [
    "................",
    "...cccccccccc...",
    "..cvvvvvvvvvvc..",
    "..cvvvvvvvvvvc..",
    "..cvvvccccvvvc..",
    "..cvvcvvvvcvvc..",
    "..cvvcvvvvcvvc..",
    "..cvvvccccvvvc..",
    "..cvvvvvvvvvvc..",
    "...cvvvvvvvvc...",
    "...cvvvvvvvvc...",
    "....cvvvvvvc....",
    ".....cvvvvc.....",
    "......cvvc......",
    ".......cc.......",
    "................",
  ],
  palette: { c: "#22d3ee", v: "#150f38" },
};
