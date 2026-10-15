import { describe, expect, it } from "vitest";
import { checkInId } from "./check-in";
import { isCheckpointId, isCheckpointKind } from "./checkpoint";

describe("checkpoint ids", () => {
  it.each(["entrance-main", "talk-1", "ab", "lunch-day-2"])("accepts %s", (id) => {
    expect(isCheckpointId(id)).toBe(true);
  });

  it.each(["", "a", "-bad", "Upper", "has space", "slash/inside", "dots.here", "x".repeat(49), 5, null, undefined])(
    "rejects %s",
    (id) => {
      expect(isCheckpointId(id)).toBe(false);
    },
  );
});

describe("checkpoint kinds", () => {
  it("knows the three kinds and nothing else", () => {
    expect(["entrance", "talk", "catering"].every(isCheckpointKind)).toBe(true);
    expect(isCheckpointKind("sponsor")).toBe(false);
    expect(isCheckpointKind(undefined)).toBe(false);
  });
});

describe("checkInId", () => {
  it("is deterministic per attendee and checkpoint, and different for each pair", () => {
    expect(checkInId("u1", "talk-1")).toBe("u1_talk-1");
    expect(checkInId("u1", "talk-1")).toBe(checkInId("u1", "talk-1"));
    expect(checkInId("u1", "talk-2")).not.toBe(checkInId("u1", "talk-1"));
    expect(checkInId("u2", "talk-1")).not.toBe(checkInId("u1", "talk-1"));
  });
});
