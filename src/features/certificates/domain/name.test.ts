import { describe, expect, it } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { suggestRecipientName, validateRecipientName } from "./name";

describe("validateRecipientName", () => {
  it("accepts Spanish accented names, ñ, hyphens, apostrophes and dots, normalizing whitespace", () => {
    expect(validateRecipientName("  Sebastian   Nicolás Fuentes Avalos ")).toEqual(ok("Sebastian Nicolás Fuentes Avalos"));
    expect(validateRecipientName("María J. O'Connor-Peña")).toEqual(ok("María J. O'Connor-Peña"));
  });

  it("rejects empty, single-word, too short, too long or unsafe names", () => {
    expect(validateRecipientName("   ")).toEqual(err("empty"));
    expect(validateRecipientName("A B")).toEqual(err("too-short"));
    expect(validateRecipientName("Sebastian")).toEqual(err("incomplete"));
    expect(validateRecipientName("Nova_7")).toEqual(err("invalid-characters"));
    expect(validateRecipientName("Ana <script>Pérez</script>")).toEqual(err("invalid-characters"));
    expect(validateRecipientName(`${"A".repeat(46)} ${"B".repeat(46)}`)).toEqual(err("too-long"));
  });
});

describe("suggestRecipientName", () => {
  it("prefers ticket holder name, then speaker name, then Google display name", () => {
    expect(
      suggestRecipientName({ ticketHolderName: "  Ana Pérez ", speakerName: "Ana Speaker", accountDisplayName: "Ana G" }),
    ).toBe("Ana Pérez");
    expect(suggestRecipientName({ ticketHolderName: " ", speakerName: "Luis Gómez", accountDisplayName: "Luis" })).toBe("Luis Gómez");
    expect(suggestRecipientName({ ticketHolderName: null, speakerName: null, accountDisplayName: "Carlos Ruiz" })).toBe("Carlos Ruiz");
    expect(suggestRecipientName({})).toBe("");
  });
});
