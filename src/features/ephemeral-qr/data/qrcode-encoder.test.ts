import { describe, expect, it } from "vitest";
import { QrCodeEncoder } from "./qrcode-encoder";

const encoder = new QrCodeEncoder();

describe("QrCodeEncoder", () => {
  it("returns a square matrix of ones and zeros", () => {
    const rows = encoder.encode("devfest:eq:talk-keynote.1792000000.abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE");

    expect(rows.length).toBeGreaterThanOrEqual(21);
    expect(new Set(rows.map((row) => row.length))).toEqual(new Set([rows.length]));
    expect(rows.every((row) => /^[01]+$/.test(row))).toBe(true);
  });

  it("draws the three finder squares every scanner looks for (top left, top right, bottom left)", () => {
    const rows = encoder.encode("hello");
    const size = rows.length;
    const finderTop = "1111111";

    expect(rows[0].slice(0, 7)).toBe(finderTop);
    expect(rows[0].slice(size - 7)).toBe(finderTop);
    expect(rows[size - 1].slice(0, 7)).toBe(finderTop);
    // The centre of a finder square is dark, its ring just inside the border is light.
    expect(rows[3][3]).toBe("1");
    expect(rows[1][1]).toBe("0");
  });

  it("is deterministic and depends on the content", () => {
    expect(encoder.encode("same")).toEqual(encoder.encode("same"));
    expect(encoder.encode("one")).not.toEqual(encoder.encode("two"));
  });

  it("grows with the content instead of failing", () => {
    expect(encoder.encode("x".repeat(120)).length).toBeGreaterThan(encoder.encode("x").length);
  });
});
