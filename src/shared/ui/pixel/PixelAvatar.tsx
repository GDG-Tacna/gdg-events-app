import type { PixelSpriteData } from "@/shared/types/pixel";
import { PixelSprite } from "./PixelSprite";

/**
 * A young astronaut in 16-bit "HD" pixel art: a big round helmet shaded in four tones, a white visor rim, the face
 * seen through the open visor (fringe, eyebrows, shiny eyes, blush and a smile) and a white suit with a chest panel,
 * a zipper, a shoulder patch and seams. Dark outline with a faint luminous rim on the lit side. 32x32.
 */
const SIZE = 32;
/** Helmet and visor ellipses: center and radii, in pixels. */
const HELMET = { x: 16, y: 13, rx: 13.2, ry: 11.6 };
const VISOR = { x: 16, y: 14.2, rx: 9.2, ry: 8.4 };

/** Each hair color: light, base, shadow. */
const HAIR = [
  ["#5a3a2e", "#3b241c", "#24140f"],
  ["#a8683c", "#7a4526", "#4f2a16"],
  ["#f2c45a", "#d49a2e", "#9c6a1a"],
  ["#3d3d52", "#22222f", "#121219"],
  ["#c75a3a", "#9a3b24", "#6a2414"],
] as const;
/** Each skin tone: light, base, shadow. */
const SKIN = [
  ["#ffe2c8", "#f5c9a3", "#d9a37c"],
  ["#f3c193", "#e0a26f", "#bd7f52"],
  ["#d99a62", "#bf7e45", "#965a2c"],
  ["#a8693c", "#8a5228", "#663a1a"],
  ["#7a4a2a", "#5e3820", "#3f2414"],
] as const;
/** Helmet colors (the Design System's accents and the classic blue): highlight, light, base, shadow. */
const HELMETS = [
  ["#9ad0ff", "#4f9bff", "#2d6df6", "#1a3fa8"],
  ["#d8ccff", "#a98bff", "#7c4dff", "#4b2bb0"],
  ["#ffd6fb", "#f29cf5", "#d65ce0", "#8f2a9a"],
  ["#e6ffb0", "#bff060", "#8fcc2a", "#4f7d12"],
  ["#fff1b8", "#ffd45c", "#f2a81d", "#a8650b"],
  ["#c8fbff", "#6fe6f5", "#1fc3dd", "#0b7488"],
] as const;

/** FNV-1a: a small, stable string hash. The same name always gives the same number. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (const char of text) {
    value ^= char.codePointAt(0) ?? 0;
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

export interface AvatarTraits {
  hair: readonly [string, string, string];
  skin: readonly [string, string, string];
  helmet: readonly [string, string, string, string];
  /** Which side the fringe falls to. */
  fringe: "left" | "right";
  /** Short hair ends at the ears; long hair reaches the cheeks. */
  style: "short" | "long";
}

/** The name picks hair, skin, helmet color, fringe side and hair length, so every cadet keeps the same avatar. Case does not matter. */
export function avatarTraits(seed: string): AvatarTraits {
  const value = hash(seed.normalize("NFC").trim().toLowerCase());
  return {
    hair: HAIR[value % HAIR.length],
    skin: SKIN[Math.floor(value / 5) % SKIN.length],
    helmet: HELMETS[Math.floor(value / 25) % HELMETS.length],
    fringe: Math.floor(value / 150) % 2 === 0 ? "left" : "right",
    style: Math.floor(value / 300) % 2 === 0 ? "short" : "long",
  };
}

/**
 * Palette keys: 1-4 helmet highlight/light/base/shadow, h helmet shine, A/a side module, C/c collar, i cyan light,
 * W/w/x visor rim light/mid/shadow, s/S/z skin, k/K/j hair, E eye, e eye shine, n eye sparkle, m mouth, p blush,
 * r glass reflection, U/u/y suit light/mid/shadow, P/Q chest panel, Z zipper, T/t shoulder patch, O outline,
 * L luminous rim. "." is transparent.
 */
function drawRows(traits: Pick<AvatarTraits, "fringe" | "style">): string[] {
  const grid: string[][] = Array.from({ length: SIZE }, () => Array<string>(SIZE).fill("."));
  const set = (x: number, y: number, cell: string) => {
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) grid[y][x] = cell;
  };

  // The suit sits behind the helmet and widens toward the shoulders.
  for (let y = 22; y < SIZE; y += 1) {
    const half = Math.min(14.5, 7.5 + (y - 22) * 1.2);
    for (let x = 0; x < SIZE; x += 1) {
      const dx = x + 0.5 - 16;
      if (Math.abs(dx) > half) continue;
      set(x, y, dx < -half * 0.35 ? "U" : Math.abs(dx) / half > 0.78 ? "y" : dx > half * 0.2 ? "u" : "U");
    }
  }
  for (let x = 10; x <= 21; x += 1) {
    set(x, 22, "C");
    set(x, 23, "c");
  }

  // The helmet shell, lit from the upper left in four tones.
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const nx = (x + 0.5 - HELMET.x) / HELMET.rx;
      const ny = (y + 0.5 - HELMET.y) / HELMET.ry;
      if (Math.hypot(nx, ny) > 1) continue;
      const light = -(nx * 0.62 + ny * 0.78);
      set(x, y, light > 0.62 ? "1" : light > 0.2 ? "2" : light > -0.35 ? "3" : "4");
    }
  }
  // Side modules (the ear pieces), each with a small cyan light.
  for (const [x0, x1, outer] of [[2, 4, 2], [27, 29, 29]] as const) {
    for (let y = 11; y <= 16; y += 1) for (let x = x0; x <= x1; x += 1) set(x, y, y === 11 ? "a" : x === outer ? "4" : "A");
    set(x0 === 2 ? 3 : 28, 13, "i");
    set(x0 === 2 ? 3 : 28, 14, "i");
  }

  // The visor rim and the face inside it.
  const hairAt = (dx: number, dy: number) => {
    const fringeSide = traits.fringe === "left" ? dx <= 1.2 : dx >= -1.2;
    const sideLimit = traits.style === "long" ? 4.2 : 1.2;
    return dy <= -3.2 || (dy <= -1.2 && fringeSide && Math.abs(dx) < 7.2) || (Math.abs(dx) > 5.6 && dy < sideLimit);
  };
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const dx = x + 0.5 - VISOR.x;
      const dy = y + 0.5 - VISOR.y;
      const nx = dx / VISOR.rx;
      const ny = dy / VISOR.ry;
      const r = Math.hypot(nx, ny);
      if (r > 1) continue;
      if (r > 0.84) {
        const light = -(nx * 0.62 + ny * 0.78);
        set(x, y, light > 0.3 ? "W" : light > -0.3 ? "w" : "x");
        continue;
      }
      if (hairAt(dx, dy)) {
        // The lowest row of each lock is in shadow; the crown catches the light on the upper left.
        set(x, y, !hairAt(dx, dy + 1) ? "j" : dx < -2.5 && dy < -4 ? "k" : "K");
      } else {
        const shade = nx * 0.6 + ny * 0.5;
        set(x, y, shade > 0.42 ? "z" : shade < -0.35 ? "s" : "S");
      }
    }
  }

  // Eyes (with a shine and a sparkle), eyebrows, nose, smile and blush.
  for (const [eyeX, browX] of [[11, 11], [19, 20]] as const) {
    for (let y = 15; y <= 17; y += 1) for (let x = eyeX; x <= eyeX + 1; x += 1) set(x, y, "E");
    set(eyeX, 15, "e");
    set(eyeX + 1, 17, "n");
    set(browX, 13, "j");
    set(browX + (eyeX === 11 ? 1 : -1), 13, "j");
  }
  set(16, 18, "z");
  for (let x = 15; x <= 17; x += 1) set(x, 20, "m");
  set(14, 19, "m");
  set(18, 19, "m");
  for (const x of [9, 10, 21, 22]) set(x, 19, "p");

  // Reflections on the visor glass and a shine on the shell (only recoloring the shell, never widening it).
  for (const [x, y] of [[9, 9], [10, 8], [11, 8], [9, 10], [22, 20]] as const) set(x, y, "r");
  const onShell = (x: number, y: number, cell: string) => {
    if ("1234".includes(grid[y][x])) set(x, y, cell);
  };
  for (const [x, y] of [[7, 3], [6, 4], [8, 2], [9, 2]] as const) onShell(x, y, "1");
  onShell(6, 5, "h");
  onShell(7, 4, "h");

  // Suit details: chest panel with lights, zipper, shoulder patch and seams.
  for (let y = 26; y <= 28; y += 1) for (let x = 13; x <= 19; x += 1) set(x, y, y === 26 ? "P" : "Q");
  set(14, 27, "i");
  set(16, 27, "e");
  set(18, 27, "i");
  for (let y = 24; y < SIZE; y += 1) if (y < 26 || y > 28) set(16, y, "Z");
  for (const [x, y] of [[7, 26], [8, 26], [7, 27], [8, 27]] as const) set(x, y, "T");
  set(7, 26, "t");
  for (let x = 4; x <= 27; x += 1) if (grid[30][x] !== "." && x !== 16) set(x, 30, "y");
  set(24, 26, "y");
  set(24, 27, "y");

  // A dark outline around the silhouette and between the shell and the visor rim.
  const lined = grid.map((row) => [...row]);
  const filled = (x: number, y: number) => x >= 0 && x < SIZE && y >= 0 && y < SIZE && grid[y][x] !== ".";
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (grid[y][x] === "." && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) lined[y][x] = "O";
      if ("1234".includes(grid[y][x]) && [grid[y][x + 1], grid[y][x - 1], grid[y + 1]?.[x], grid[y - 1]?.[x]].some((cell) => cell !== undefined && "Wwx".includes(cell))) {
        lined[y][x] = "O";
      }
    }
  }
  // A faint luminous rim outside the outline, on the lit (upper left) side.
  const rows = lined.map((row) => [...row]);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (lined[y][x] === "." && (lined[y][x + 1] === "O" || lined[y + 1]?.[x] === "O") && x + 0.5 < 18 && y + 0.5 < 16) rows[y][x] = "L";
    }
  }
  return rows.map((row) => row.join(""));
}

export function avatarSprite(seed: string): PixelSpriteData {
  const traits = avatarTraits(seed);
  const [h1, h2, h3, h4] = traits.helmet;
  return {
    rows: drawRows(traits),
    palette: {
      O: "#0a1030",
      L: "rgba(140,220,255,0.45)",
      "1": h1,
      "2": h2,
      "3": h3,
      "4": h4,
      h: "#ffffff",
      A: h4,
      a: h2,
      C: h4,
      c: "#0d1a44",
      i: "#22d3ee",
      W: "#ffffff",
      w: "#d4dcf2",
      x: "#97a3c7",
      s: traits.skin[0],
      S: traits.skin[1],
      z: traits.skin[2],
      k: traits.hair[0],
      K: traits.hair[1],
      j: traits.hair[2],
      E: "#16163a",
      e: "#ffffff",
      n: "#6b7cc9",
      m: "#a8434a",
      p: "#f29a9a",
      r: "rgba(255,255,255,0.85)",
      U: "#f6f8ff",
      u: "#cfd7ef",
      y: "#98a4c8",
      P: h2,
      Q: h3,
      Z: "#7a86ad",
      T: h3,
      t: h1,
    },
  };
}

export interface PixelAvatarProps {
  /** Usually the cadet's alias. */
  seed: string;
  /** Integer scale: 32 pixels of art times this. */
  scale?: number;
  /** Accessible name. Without it the avatar is decorative. */
  title?: string;
  className?: string;
}

export function PixelAvatar({ seed, scale = 3, title, className }: PixelAvatarProps) {
  const sprite = avatarSprite(seed);
  return <PixelSprite rows={sprite.rows} palette={sprite.palette} scale={scale} title={title} className={className} />;
}
