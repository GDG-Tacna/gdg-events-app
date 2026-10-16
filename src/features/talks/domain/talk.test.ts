import { describe, expect, it } from "vitest";
import { checkTalk, compareTalks, parseLocalDateTime, suggestTalkId, toLocalDateTime, type Talk, type TalkDraft } from "./talk";

const LIMA = "-05:00";
const DRAFT: TalkDraft = {
  title: "  Keynote:   IA en 2026 ",
  speakerIds: ["ana-torres", "luis-quispe", "ana-torres"],
  startsAt: "2026-10-24T09:00",
  endsAt: "2026-10-24T09:45",
  roomId: "auditorio",
  description: "  De qué va.  ",
};

describe("parseLocalDateTime and toLocalDateTime", () => {
  it("reads the venue's wall clock as an instant, with its offset", () => {
    expect(parseLocalDateTime("2026-10-24T09:00", LIMA)?.toISOString()).toBe("2026-10-24T14:00:00.000Z");
    expect(parseLocalDateTime("2026-10-24T23:30", LIMA)?.toISOString()).toBe("2026-10-25T04:30:00.000Z");
  });

  it("writes an instant back as the venue's wall clock, whatever the server's time zone", () => {
    expect(toLocalDateTime(new Date("2026-10-25T04:30:00Z"), LIMA)).toBe("2026-10-24T23:30");
    expect(toLocalDateTime(new Date("2026-10-24T14:00:00Z"), "+05:30")).toBe("2026-10-24T19:30");
  });

  it.each(["", "2026-10-24", "2026-10-24 09:00", "2026-10-24T9:00", "2026-02-31T10:00", "2026-13-01T10:00", "2026-10-24T24:00", "x"])("refuses %j", (value) => {
    expect(parseLocalDateTime(value, LIMA)).toBeNull();
  });
});

describe("checkTalk", () => {
  it("normalizes a valid draft: collapsed spaces, trimmed text, times with the venue's offset", () => {
    expect(checkTalk("keynote", DRAFT, LIMA)).toEqual({
      ok: true,
      value: {
        id: "keynote",
        title: "Keynote: IA en 2026",
        speakerIds: ["ana-torres", "luis-quispe"],
        startsAt: new Date("2026-10-24T14:00:00Z"),
        endsAt: new Date("2026-10-24T14:45:00Z"),
        roomId: "auditorio",
        description: "De qué va.",
      },
    });
  });

  it("allows no room (an empty choice) and no description", () => {
    expect(checkTalk("keynote", { ...DRAFT, roomId: "", description: "" }, LIMA)).toMatchObject({ ok: true, value: { roomId: null, description: "" } });
    expect(checkTalk("keynote", { ...DRAFT, roomId: null }, LIMA)).toMatchObject({ ok: true, value: { roomId: null } });
  });

  it.each([
    ["an id that is not a checkpoint id", "Keynote", DRAFT, "invalid-id"],
    ["a title too short", "keynote", { ...DRAFT, title: " x " }, "invalid-title"],
    ["a title too long", "keynote", { ...DRAFT, title: "x".repeat(81) }, "invalid-title"],
    ["no speaker", "keynote", { ...DRAFT, speakerIds: [] }, "invalid-speaker"],
    ["more than six speakers", "keynote", { ...DRAFT, speakerIds: ["a1", "a2", "a3", "a4", "a5", "a6", "a7"] }, "invalid-speaker"],
    ["a speaker id that is not one", "keynote", { ...DRAFT, speakerIds: ["Ana Torres"] }, "invalid-speaker"],
    ["no start", "keynote", { ...DRAFT, startsAt: "" }, "invalid-schedule"],
    ["an end before the start", "keynote", { ...DRAFT, endsAt: "2026-10-24T08:59" }, "invalid-schedule"],
    ["an end equal to the start", "keynote", { ...DRAFT, endsAt: DRAFT.startsAt }, "invalid-schedule"],
    ["a talk of more than 12 hours", "keynote", { ...DRAFT, endsAt: "2026-10-24T21:01" }, "invalid-schedule"],
    ["a description too long", "keynote", { ...DRAFT, description: "x".repeat(501) }, "invalid-description"],
  ] as const)("refuses %s", (_, id, draft, code) => {
    expect(checkTalk(id, draft, LIMA)).toEqual({ ok: false, error: code });
  });

  it("accepts exactly 12 hours, and a 500-character description", () => {
    expect(checkTalk("keynote", { ...DRAFT, endsAt: "2026-10-24T21:00", description: "x".repeat(500) }, LIMA).ok).toBe(true);
  });
});

describe("compareTalks", () => {
  const talk = (id: string, title: string, start: string | null): Talk => ({
    id,
    title,
    speakerIds: [],
    speaker: null,
    startsAt: start ? new Date(start) : null,
    endsAt: null,
    roomId: null,
    description: "",
    active: true,
  });

  it("orders by start time, then by title, with undated talks last", () => {
    const talks = [
      talk("c", "Sin hora", null),
      talk("b", "Beta", "2026-10-24T15:00:00Z"),
      talk("a", "Alfa", "2026-10-24T15:00:00Z"),
      talk("d", "Temprano", "2026-10-24T14:00:00Z"),
    ];

    expect([...talks].sort(compareTalks).map((t) => t.id)).toEqual(["d", "a", "b", "c"]);
  });
});

describe("suggestTalkId", () => {
  it("makes a checkpoint id from the title", () => {
    expect(suggestTalkId("Keynote: IA en 2026")).toBe("keynote-ia-en-2026");
    expect(suggestTalkId("  ¿Qué es Firebase?  ")).toBe("que-es-firebase");
    expect(suggestTalkId("x".repeat(60))).toHaveLength(48);
  });
});
