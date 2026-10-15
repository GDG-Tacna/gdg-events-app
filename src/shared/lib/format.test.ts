import { describe, expect, it } from "vitest";
import { interpolate } from "./format";

describe("interpolate", () => {
  it("fills every placeholder", () => {
    expect(interpolate("{xp} / {next} XP", { xp: "750", next: "2,000" })).toBe("750 / 2,000 XP");
  });

  it("fills a placeholder that appears more than once", () => {
    expect(interpolate("{a}-{a}", { a: "x" })).toBe("x-x");
  });

  it("leaves a placeholder without a value visible instead of printing undefined", () => {
    expect(interpolate("{xp} de {next}", { xp: "5" })).toBe("5 de {next}");
  });

  it("ignores extra values and text without placeholders", () => {
    expect(interpolate("Sin valores", { xp: "5" })).toBe("Sin valores");
  });

  it("does not interpret the value as a pattern", () => {
    expect(interpolate("{a}", { a: "$1 $& \\n" })).toBe("$1 $& \\n");
  });
});
