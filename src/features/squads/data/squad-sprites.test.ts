import { describe, expect, it } from "vitest";
import type { PixelSpriteData } from "@/shared/types/pixel";
import { STATIC_SQUADS } from "./static-squad-catalog";
import { angularSprite, firebaseSprite, geminiSprite } from "./squad-sprites";

const SPRITES: ReadonlyArray<readonly [string, () => PixelSpriteData]> = [
  ["angular", angularSprite],
  ["firebase", firebaseSprite],
  ["gemini", geminiSprite],
];

describe.each(SPRITES)("%s sprite", (_name, build) => {
  const sprite = build();

  it("is a 16x16 grid", () => {
    expect(sprite.rows).toHaveLength(16);
    for (const row of sprite.rows) expect(row).toHaveLength(16);
  });

  it("only uses keys that the palette defines (or '.' for transparent)", () => {
    for (const row of sprite.rows) {
      for (const key of row) {
        if (key !== ".") expect(sprite.palette, `unknown key "${key}"`).toHaveProperty(key);
      }
    }
  });

  it("has valid hex colors and uses every color of its palette", () => {
    const used = new Set(sprite.rows.join("").replace(/\./g, ""));
    for (const [key, color] of Object.entries(sprite.palette)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(used.has(key), `palette key "${key}" is never used`).toBe(true);
    }
  });

  it("fills a good part of the grid so it reads at 16 pixels", () => {
    const painted = sprite.rows.join("").replace(/\./g, "").length;
    expect(painted).toBeGreaterThan(80);
  });
});

describe("shapes", () => {
  it("the Gemini star is symmetric both ways and reaches the four edges", () => {
    const { rows } = geminiSprite();
    const shape = rows.map((row) => [...row].map((c) => c !== "."));

    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        expect(shape[y][x], `(${x},${y}) mirrors horizontally`).toBe(shape[y][15 - x]);
        expect(shape[y][x], `(${x},${y}) mirrors vertically`).toBe(shape[15 - y][x]);
      }
    }
    expect(shape[0].some(Boolean)).toBe(true);
    expect(shape[15].some(Boolean)).toBe(true);
    expect(shape.some((row) => row[0])).toBe(true);
    expect(shape.some((row) => row[15])).toBe(true);
  });

  it("the Gemini star is concave: the corners are empty and the middle is full", () => {
    const { rows } = geminiSprite();

    expect(rows[0][0]).toBe(".");
    expect(rows[15][15]).toBe(".");
    // The middle rows span the whole width: that is where the four points meet.
    expect(rows[7].includes(".")).toBe(false);
    expect(rows[8].includes(".")).toBe(false);
  });

  it("the Angular shield has a white A and two reds split down the middle", () => {
    const { rows } = angularSprite();
    const flat = rows.join("");

    expect(flat).toContain("W");
    expect(rows[2][1]).toBe("L");
    expect(rows[2][14]).toBe("D");
    // The A has a hole: the pixels between its legs show the shield, not the letter.
    expect(rows[6][7]).not.toBe("W");
  });

  it("the Firebase flame has its tip at the top and its yellow lobe at the lower left", () => {
    const { rows } = firebaseSprite();

    expect(rows[0].replace(/\./g, "")).toMatch(/^R+$/);
    expect(rows[12].indexOf("Y")).toBeGreaterThanOrEqual(0);
    expect(rows[12].indexOf("Y")).toBeLessThan(rows[12].indexOf("R"));
  });
});

describe("static catalog", () => {
  it("offers the three event squads with stable slug ids", () => {
    expect(STATIC_SQUADS.map((squad) => squad.id)).toEqual(["angular", "firebase", "gemini"]);
  });

  it("gives every squad a name, a tagline and its own sprite", () => {
    const signatures = new Set<string>();
    for (const squad of STATIC_SQUADS) {
      expect(squad.name.length).toBeGreaterThan(0);
      expect(squad.tagline.length).toBeGreaterThan(0);
      signatures.add(squad.sprite.rows.join("|"));
    }
    expect(signatures.size).toBe(STATIC_SQUADS.length);
  });

  it("never reuses a color between two squads, so they are told apart at a glance", () => {
    const colors = STATIC_SQUADS.map((squad) => new Set(Object.values(squad.sprite.palette).map((c) => c.toLowerCase())));
    for (let a = 0; a < colors.length; a += 1) {
      for (let b = a + 1; b < colors.length; b += 1) {
        const shared = [...colors[a]].filter((color) => colors[b].has(color));
        expect(shared, `${STATIC_SQUADS[a].id} and ${STATIC_SQUADS[b].id} share ${shared.join(", ")}`).toEqual([]);
      }
    }
  });
});
