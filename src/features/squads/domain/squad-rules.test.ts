import { describe, expect, it } from "vitest";
import { STATIC_SQUADS } from "../data/static-squad-catalog";
import { LOGO_MAX_COLORS, normalizeSquadName, normalizeTagline, validateLogo } from "./squad-rules";

const blank = () => Array.from({ length: 16 }, () => ".".repeat(16));
const withPixel = (cell = "a") => {
  const rows = blank();
  rows[8] = `.......${cell}........`;
  return rows;
};

describe("validateLogo", () => {
  it("accepts a 16x16 logo and keeps it", () => {
    expect(validateLogo({ rows: withPixel(), palette: { a: "#22D3EE" } })).toEqual({ rows: withPixel(), palette: { a: "#22d3ee" } });
  });

  it("accepts every logo DevFest ships with, so seeding a new edition always works", () => {
    for (const squad of STATIC_SQUADS) {
      expect(validateLogo(squad.sprite), squad.id).not.toBeNull();
    }
  });

  it("drops palette colors that no pixel uses", () => {
    expect(validateLogo({ rows: withPixel(), palette: { a: "#000000", b: "#ffffff" } })?.palette).toEqual({ a: "#000000" });
  });

  it.each([
    ["not an object", "logo"],
    ["fewer rows", { rows: blank().slice(1), palette: { a: "#000000" } }],
    ["more rows", { rows: [...withPixel(), "................"], palette: { a: "#000000" } }],
    ["a short row", { rows: [...withPixel().slice(0, 15), "..."], palette: { a: "#000000" } }],
    ["rows that are not text", { rows: Array(16).fill(16), palette: { a: "#000000" } }],
    ["a pixel without a color", { rows: withPixel("z"), palette: { a: "#000000" } }],
    ["an empty canvas", { rows: blank(), palette: { a: "#000000" } }],
    ["a color that is not #rrggbb", { rows: withPixel(), palette: { a: "red" } }],
    ["a short color", { rows: withPixel(), palette: { a: "#fff" } }],
    ["a key that is not one letter or digit", { rows: withPixel(), palette: { a: "#000000", "..": "#ffffff" } }],
    ["the transparent key used as a color", { rows: withPixel(), palette: { a: "#000000", ".": "#ffffff" } }],
    ["a palette that is a list", { rows: withPixel(), palette: ["#000000"] }],
    [
      "too many colors",
      { rows: withPixel(), palette: Object.fromEntries("abcdefghi".split("").map((key) => [key, "#000000"])) },
    ],
  ])("rejects %s", (_name, logo) => {
    expect(validateLogo(logo)).toBeNull();
  });

  it("allows exactly the maximum number of colors", () => {
    const keys = "abcdefgh".split("").slice(0, LOGO_MAX_COLORS);
    const rows = blank();
    rows[0] = keys.join("").padEnd(16, ".");

    expect(validateLogo({ rows, palette: Object.fromEntries(keys.map((key) => [key, "#123456"])) })).not.toBeNull();
  });
});

describe("names and taglines", () => {
  it("trims and collapses spaces", () => {
    expect(normalizeSquadName("  Escuadrón   Gemini ")).toBe("Escuadrón Gemini");
    expect(normalizeTagline(" Inteligencia   que se adapta. ")).toBe("Inteligencia que se adapta.");
  });

  it("rejects names and taglines out of range", () => {
    expect(normalizeSquadName("a")).toBeNull();
    expect(normalizeSquadName("x".repeat(41))).toBeNull();
    expect(normalizeTagline("")).toBeNull();
    expect(normalizeTagline("x".repeat(81))).toBeNull();
  });
});
