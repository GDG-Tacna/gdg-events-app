import { describe, expect, it } from "vitest";
import { ALIAS_MAX_LENGTH, ALIAS_MIN_LENGTH, createAlias } from "./alias";

describe("createAlias", () => {
  it("keeps the display casing and builds a lowercase uniqueness key", () => {
    const result = createAlias("Nova_7");

    expect(result).toEqual({ ok: true, value: { display: "Nova_7", key: "nova_7" } });
  });

  it("trims surrounding whitespace", () => {
    expect(createAlias("  Orion  ")).toEqual({ ok: true, value: { display: "Orion", key: "orion" } });
  });

  it("treats the same alias in different casing as the same key", () => {
    const a = createAlias("Pixel");
    const b = createAlias("PIXEL");

    expect(a.ok && b.ok && a.value.key === b.value.key).toBe(true);
  });

  it("accepts letters with accents and digits", () => {
    expect(createAlias("Ñandú-99").ok).toBe(true);
  });

  it("normalizes composed and decomposed accents to the same alias", () => {
    const composed = createAlias("ástro"); // á as one code point
    const decomposed = createAlias("ástro"); // a + combining accent

    expect(composed.ok && decomposed.ok && composed.value.key === decomposed.value.key).toBe(true);
  });

  it.each([
    ["", "too-short"],
    ["  ", "too-short"],
    ["ab", "too-short"],
    ["x".repeat(ALIAS_MAX_LENGTH + 1), "too-long"],
  ] as const)("rejects %j as %s", (raw, code) => {
    expect(createAlias(raw)).toEqual({ ok: false, error: code });
  });

  it("accepts the exact minimum and maximum lengths", () => {
    expect(createAlias("a".repeat(ALIAS_MIN_LENGTH)).ok).toBe(true);
    expect(createAlias("a".repeat(ALIAS_MAX_LENGTH)).ok).toBe(true);
  });

  it.each(["two words", "<script>", "nova!", "a.b.c", "rocket🚀", "tab\tbed"])(
    "rejects %j for its characters",
    (raw) => {
      expect(createAlias(raw)).toEqual({ ok: false, error: "invalid-characters" });
    },
  );

  it.each(["admin", "Admin", "STAFF", "Organizador", "DevFest", "GDGTacna"])(
    "reserves %j so nobody impersonates the organization",
    (raw) => {
      expect(createAlias(raw)).toEqual({ ok: false, error: "reserved" });
    },
  );
});
