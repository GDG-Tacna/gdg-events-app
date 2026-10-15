import { describe, expect, it } from "vitest";
import { isEventId } from "./event";

describe("isEventId", () => {
  it.each(["devfest-2026", "devfest-2027", "ab", "tacna-2030-b"])("accepts %s", (id) => {
    expect(isEventId(id)).toBe(true);
  });

  it.each(["", "a", "-x", "DevFest", "a/b", "a b", "a.b", "x".repeat(49), 2026, null, undefined])(
    "rejects %j, which could escape its path segment or collide",
    (id) => {
      expect(isEventId(id)).toBe(false);
    },
  );
});
