import { describe, expect, it } from "vitest";
import { EDITION } from "@/shared/config/edition";
import { copy } from "./es";
import { rankName, rankWithLevel } from "./rank-name";

describe("rankName", () => {
  it("uses the name written in the copy", () => {
    expect(rankName("pilot", 2)).toBe("Piloto");
  });

  it("prefers the name the admin gave the rank", () => {
    expect(rankName("pilot", 2, "Piloto de pruebas")).toBe("Piloto de pruebas");
    expect(rankName("admiral", 5, "Almirante")).toBe("Almirante");
    expect(rankName("pilot", 2, null)).toBe("Piloto");
  });

  it("falls back to the level when the ladder has a rank the copy does not name yet", () => {
    expect(rankName("admiral", 5)).toBe("Nivel 5");
  });

  it("does not mistake object prototype keys for names", () => {
    expect(rankName("constructor", 3)).toBe("Nivel 3");
  });

  it("names every rank of the configured ladder, so the default edition never shows the fallback", () => {
    for (const rank of EDITION.ranks) {
      expect(Object.keys(copy.ranks)).toContain(rank.id);
    }
  });
});

describe("rankWithLevel", () => {
  it("names the rank with its level, or only the level when it has no name", () => {
    expect(rankWithLevel(2, "Piloto")).toBe("Piloto (NV 2)");
    expect(rankWithLevel(7, null)).toBe("NV 7");
  });
});
