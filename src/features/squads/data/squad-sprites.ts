import type { PixelSpriteData } from "@/shared/types/pixel";

/**
 * 16x16 pixel-art renditions of each squad's symbol (never the wordmark). Drawn by hand over the
 * silhouette and colors of the official marks; the Design System allows this exception for squads only.
 */
const SIZE = 16;

function grid(draw: (x: number, y: number) => string): string[] {
  return Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => draw(x, y)).join(""));
}

/** Angular: a shield (two reds, split down the middle) with a white "A". */
export function angularSprite(): PixelSpriteData {
  // Horizontal extent [first, last] of the shield on each row.
  const EXTENT: ReadonlyArray<readonly [number, number]> = [
    [7, 8],
    [2, 13],
    [1, 14], [1, 14], [1, 14], [1, 14], [1, 14], [1, 14], [1, 14], [1, 14], [1, 14], [1, 14],
    [2, 13],
    [3, 12],
    [5, 10],
    [7, 8],
  ];
  // Pixels of the white "A", per row.
  const LETTER: Readonly<Record<number, readonly number[]>> = {
    3: [7, 8],
    4: [7, 8],
    5: [6, 7, 8, 9],
    6: [5, 6, 9, 10],
    7: [5, 6, 9, 10],
    8: [5, 6, 7, 8, 9, 10],
    9: [4, 5, 10, 11],
    10: [4, 5, 10, 11],
    11: [3, 4, 11, 12],
    12: [3, 4, 11, 12],
  };

  return {
    rows: grid((x, y) => {
      const [first, last] = EXTENT[y];
      if (x < first || x > last) return ".";
      if (LETTER[y]?.includes(x)) return "W";
      return x < SIZE / 2 ? "L" : "D";
    }),
    palette: { L: "#dd0031", D: "#c3002f", W: "#ffffff" },
  };
}

/** Firebase: the flame, with the yellow lobe at the lower left and the red-orange tip. */
export function firebaseSprite(): PixelSpriteData {
  const ROWS = [
    ".......RR.......",
    "......RRR.......",
    "......RRRR......",
    ".....RRRRR......",
    ".....RRRRRR.....",
    "....RRRRRRR.....",
    "...RRRRRRRRR....",
    "..YYRRRRRRRRR...",
    "..YYYARRRRRRR...",
    ".YYYYAARRRRRRR..",
    ".YYYYAAORRRRRR..",
    ".YYYYAAOORRRRR..",
    ".YYYYYAAOORRR...",
    "..YYYYYAAOOR....",
    "...YYYYYAAO.....",
    "....YYYYYY......",
  ];
  return {
    rows: ROWS,
    palette: { Y: "#ffca28", A: "#ffa000", O: "#f57c00", R: "#dd2c00" },
  };
}

/** Gemini: the four-pointed concave star, red on top, yellow left, green below and blue on the right and center. */
export function geminiSprite(): PixelSpriteData {
  // Half-width of the star at each distance from the center (in cells): 8 at the center line, 1 at the tips.
  // A cell is painted when it lies inside the arm of its row or the arm of its column, which makes the
  // shape identical on all four sides. A smooth curve is too coarse at 16 pixels, so the profile is explicit.
  const HALF_WIDTH = [8, 6, 4, 3, 2, 2, 1, 1];

  return {
    rows: grid((x, y) => {
      const dx = x + 0.5 - SIZE / 2;
      const dy = y + 0.5 - SIZE / 2;
      const across = Math.floor(Math.abs(dx));
      const along = Math.floor(Math.abs(dy));
      if (across >= HALF_WIDTH[along] && along >= HALF_WIDTH[across]) return ".";

      if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? "R" : "G";
      return dx < 0 ? "Y" : "B";
    }),
    palette: { R: "#ea4335", Y: "#fbbc05", G: "#34a853", B: "#4285f4" },
  };
}
