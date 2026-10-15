// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PixelSpriteData } from "@/shared/types/pixel";
import { avatarSprite, avatarTraits, PixelAvatar } from "./PixelAvatar";
import { coinSprite, PixelCoin } from "./PixelCoin";
import { PixelStar, starSprite } from "./PixelStar";

function expectValid(sprite: PixelSpriteData, size = 16) {
  expect(sprite.rows).toHaveLength(size);
  for (const row of sprite.rows) expect(row).toHaveLength(size);
  for (const key of new Set(sprite.rows.join("").replace(/\./g, ""))) {
    expect(sprite.palette, `unknown key "${key}"`).toHaveProperty(key);
  }
  for (const color of Object.values(sprite.palette)) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
}

/** Finds two seeds that land on each fringe side, so a test can compare them. */
function seedsForBothFringes(): { left: string; right: string } {
  let left: string | undefined;
  let right: string | undefined;
  for (let i = 0; i < 500 && (!left || !right); i += 1) {
    const seed = `attendee-${i}`;
    if (avatarTraits(seed).fringe === "left") left ??= seed;
    else right ??= seed;
  }
  if (!left || !right) throw new Error("Could not find seeds for both fringe sides");
  return { left, right };
}

const silhouette = (rows: readonly string[]) => rows.map((row) => row.replace(/[^.]/g, "#")).join("\n");

describe("avatar", () => {
  /** The avatar's palette also has two translucent colors: the glass reflections and the luminous rim. */
  const COLOR = /^(#[0-9a-f]{6}|rgba\(\d{1,3},\d{1,3},\d{1,3},(0|1|0?\.\d+)\))$/i;

  it("is a valid 32x32 sprite: every key has a color, every color is valid", () => {
    const sprite = avatarSprite("Nova_7");
    expect(sprite.rows).toHaveLength(32);
    for (const row of sprite.rows) expect(row).toHaveLength(32);
    for (const key of new Set(sprite.rows.join("").replace(/./g, ""))) expect(sprite.palette, `unknown key "${key}"`).toHaveProperty(key);
    for (const color of Object.values(sprite.palette)) expect(color).toMatch(COLOR);
  });

  it("is deterministic: the same alias always gets the same avatar", () => {
    expect(avatarTraits("Nova_7")).toEqual(avatarTraits("Nova_7"));
    expect(avatarSprite("Nova_7")).toEqual(avatarSprite("Nova_7"));
  });

  it("ignores case and surrounding spaces, like the alias uniqueness key", () => {
    expect(avatarTraits("  NOVA_7 ")).toEqual(avatarTraits("nova_7"));
  });

  it("gives different cadets a good variety of looks, using every trait", () => {
    const traits = Array.from({ length: 600 }, (_, i) => avatarTraits(`attendee-${i}`));

    // 5 hairs x 5 skins x 6 helmets x 2 fringes x 2 lengths = 600 possible looks.
    expect(new Set(traits.map((t) => JSON.stringify(t))).size).toBeGreaterThan(250);
    expect(new Set(traits.map((t) => t.hair)).size).toBe(5);
    expect(new Set(traits.map((t) => t.skin)).size).toBe(5);
    expect(new Set(traits.map((t) => t.helmet)).size).toBe(6);
    expect(new Set(traits.map((t) => t.fringe))).toEqual(new Set(["left", "right"]));
    expect(new Set(traits.map((t) => t.style))).toEqual(new Set(["short", "long"]));
  });

  it("shades in tones: four for the helmet, three for the skin, the hair and the suit", () => {
    const flat = avatarSprite("Nova_7").rows.join("");

    for (const keys of ["1234", "sSz", "kKj", "Uuy", "Wwx"]) {
      for (const key of keys) expect(flat.includes(key), `missing tone ${key} of ${keys}`).toBe(true);
    }
    const { palette } = avatarSprite("Nova_7");
    expect(new Set([palette["1"], palette["2"], palette["3"], palette["4"]]).size).toBe(4);
  });

  it("draws the details: eye shine and sparkle, smile, blush, visor reflections, chest panel, zipper, patch and side lights", () => {
    const flat = avatarSprite("Nova_7").rows.join("");

    for (const [key, what] of [["e", "eye shine"], ["n", "eye sparkle"], ["m", "smile"], ["p", "blush"], ["r", "reflection"], ["P", "chest panel"], ["Z", "zipper"], ["T", "shoulder patch"], ["i", "lights"], ["h", "helmet shine"]] as const) {
      expect(flat.includes(key), `missing ${what} (${key})`).toBe(true);
    }
  });

  it("keeps the face readable: eyes are dark, never the skin or hair color", () => {
    for (let i = 0; i < 100; i += 1) {
      const { palette } = avatarSprite(`attendee-${i}`);
      expect(palette.E).toBe("#16163a");
      expect([palette.s, palette.S, palette.z, palette.k, palette.K, palette.j]).not.toContain(palette.E);
    }
  });

  it("has two eyes at the same height, with room between them", () => {
    const { rows } = avatarSprite("Nova_7");
    const eyeRow = rows[16];
    const columns = [...eyeRow].flatMap((cell, x) => (cell === "E" ? [x] : []));

    expect(columns).toEqual([11, 12, 19, 20]);
  });

  it("is a smile: the corners sit above the middle of the mouth", () => {
    const { rows } = avatarSprite("Nova_7");

    expect([...rows[19]].flatMap((cell, x) => (cell === "m" ? [x] : []))).toEqual([14, 18]);
    expect([...rows[20]].flatMap((cell, x) => (cell === "m" ? [x] : []))).toEqual([15, 16, 17]);
  });

  it("has a clean dark outline all around, and a faint luminous rim only on the lit side", () => {
    const { rows } = avatarSprite("Nova_7");
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const cell = rows[y][x];
        if (cell === "." || cell === "O" || cell === "L") continue;
        // Every drawn pixel at the silhouette's edge touches the outline, never empty space.
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx > 31 || ny > 31) continue;
          expect(rows[ny][nx], `(${x},${y}) touches empty space`).not.toBe(".");
        }
      }
    }
    const rim = rows.flatMap((row, y) => [...row].flatMap((cell, x) => (cell === "L" ? [{ x, y }] : [])));
    expect(rim.length).toBeGreaterThan(0);
    for (const { x, y } of rim) expect(x < 18 && y < 16, `rim at (${x},${y})`).toBe(true);
  });

  it("is the same silhouette for both fringe sides, only the hair differs", () => {
    const { left, right } = seedsForBothFringes();
    const leftRows = avatarSprite(left).rows;
    const rightRows = avatarSprite(right).rows;

    expect(silhouette(leftRows)).toBe(silhouette(rightRows));
    expect(leftRows.join("")).not.toBe(rightRows.join(""));
  });

  it("the helmet is round: its dome is mirrored left to right", () => {
    const shape = avatarSprite("Nova_7").rows.map((row) => [...row].map((cell) => cell !== "." && cell !== "L"));

    for (let y = 0; y <= 20; y += 1) {
      for (let x = 0; x < 32; x += 1) expect(shape[y][x], `(${x},${y})`).toBe(shape[y][31 - x]);
    }
  });

  it("renders crisp, decorative by default and named when asked", () => {
    const { container, rerender } = render(<PixelAvatar seed="Nova_7" />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("viewBox", "0 0 32 32");
    expect(svg).toHaveAttribute("width", "96");
    expect(svg).toHaveAttribute("shape-rendering", "crispEdges");
    expect(svg).toHaveAttribute("aria-hidden", "true");

    rerender(<PixelAvatar seed="Nova_7" title="Avatar de Nova_7" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-label", "Avatar de Nova_7");
  });
});

describe("star and coin", () => {
  it.each([
    ["star", starSprite],
    ["coin", coinSprite],
  ] as const)("the %s is a valid 16x16 sprite that uses its whole palette", (_name, build) => {
    const sprite = build();
    expectValid(sprite);

    const used = new Set(sprite.rows.join("").replace(/\./g, ""));
    for (const key of Object.keys(sprite.palette)) expect(used.has(key), `"${key}" never used`).toBe(true);
  });

  it("the coin is round: symmetric both ways", () => {
    const shape = coinSprite().rows.map((row) => [...row].map((c) => c !== "."));

    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        expect(shape[y][x]).toBe(shape[y][15 - x]);
        expect(shape[y][x]).toBe(shape[15 - y][x]);
      }
    }
  });

  it("the star is symmetric left to right and has its point at the top", () => {
    const shape = starSprite().rows.map((row) => [...row].map((c) => c !== "."));

    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) expect(shape[y][x]).toBe(shape[y][15 - x]);
    }
    expect(shape[1].filter(Boolean).length).toBeLessThan(shape[5].filter(Boolean).length);
  });

  it("render at 16px by default scale 2 (32px) and stay decorative", () => {
    const star = render(<PixelStar />).container.querySelector("svg");
    const coin = render(<PixelCoin />).container.querySelector("svg");

    expect(star).toHaveAttribute("width", "32");
    expect(coin).toHaveAttribute("width", "32");
    expect(star).toHaveAttribute("aria-hidden", "true");
    expect(coin).toHaveAttribute("aria-hidden", "true");
  });
});
