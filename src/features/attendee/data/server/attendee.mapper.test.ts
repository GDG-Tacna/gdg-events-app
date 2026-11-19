import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mapUserDoc, toAliasDoc, toUserDoc, USER_SCHEMA_VERSION } = await import("./attendee.mapper");

const CREATED = new Date("2026-10-04T12:00:00Z");
const timestamp = { toDate: () => CREATED };

const validDoc = {
  alias: "Nova_7",
  role: "attendee",
  squad: null,
  xp: 120,
  credits: 3,
  createdAt: timestamp,
};

describe("mapUserDoc", () => {
  it("maps a stored profile to the domain entity and converts the timestamp", () => {
    expect(mapUserDoc("u1", validDoc)).toEqual({
      ok: true,
      value: { uid: "u1", alias: "Nova_7", role: "attendee", squad: null, xp: 120, credits: 3, ticket: { type: "general", source: "default" }, createdAt: CREATED },
    });
  });

  it("reads the ticket fields, and a profile from before tickets existed as a general ticket by default", () => {
    const stored = mapUserDoc("u1", { ...validDoc, ticketType: "premium", ticketSource: "manual", ticketSetBy: "staff-1", ticketSetAt: timestamp });

    expect(stored.ok && stored.value.ticket).toEqual({ type: "premium", source: "manual" });
    const old = mapUserDoc("u1", validDoc);
    expect(old.ok && old.value.ticket).toEqual({ type: "general", source: "default" });
  });

  it("accepts an assigned squad", () => {
    const result = mapUserDoc("u1", { ...validDoc, squad: "firebase" });

    expect(result.ok && result.value.squad).toBe("firebase");
  });

  it("keeps a profile whose squad was retired later, instead of rejecting it", () => {
    // "cloud" is no longer an event squad; the attendee must still be able to sign in.
    const result = mapUserDoc("u1", { ...validDoc, squad: "cloud" });

    expect(result.ok && result.value.squad).toBe("cloud");
  });

  it.each([
    ["no data", undefined],
    ["missing alias", { ...validDoc, alias: undefined }],
    ["empty alias", { ...validDoc, alias: "" }],
    ["unknown role", { ...validDoc, role: "owner" }],
    ["malformed squad id", { ...validDoc, squad: "Not A Slug!" }],
    ["numeric squad", { ...validDoc, squad: 7 }],
    ["negative xp", { ...validDoc, xp: -1 }],
    ["fractional credits", { ...validDoc, credits: 1.5 }],
    ["string xp", { ...validDoc, xp: "10" }],
    ["createdAt without toDate", { ...validDoc, createdAt: "yesterday" }],
    ["unknown ticket", { ...validDoc, ticketType: "vip" }],
    ["unknown ticket source", { ...validDoc, ticketSource: "guess" }],
  ])("rejects a document with %s instead of guessing", (_label, doc) => {
    expect(mapUserDoc("u1", doc)).toEqual({ ok: false, error: "invalid-document" });
  });
});

describe("toUserDoc / toAliasDoc", () => {
  const attendee = {
    uid: "u1",
    alias: "Nova_7",
    role: "attendee" as const,
    squad: null,
    xp: 0,
    credits: 0,
    ticket: { type: "premium" as const, source: "list" as const },
    createdAt: CREATED,
  };
  const alias = { display: "Nova_7", key: "nova_7" };

  it("writes the lowercase key, safe defaults and the schema version, and nothing else", () => {
    expect(toUserDoc(attendee, alias)).toEqual({
      alias: "Nova_7",
      aliasLower: "nova_7",
      role: "attendee",
      squad: null,
      xp: 0,
      credits: 0,
      ticketType: "premium",
      ticketSource: "list",
      createdAt: CREATED,
      schemaVersion: USER_SCHEMA_VERSION,
    });
  });

  it("reserves the alias for the owner uid", () => {
    expect(toAliasDoc(attendee)).toEqual({ uid: "u1", createdAt: CREATED });
  });
});
