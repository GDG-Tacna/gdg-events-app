import { describe, expect, it, vi } from "vitest";
import { createRankLadder, type Attendee } from "@/features/attendee";
import { err, ok } from "@/shared/lib/result";
import { getAttendeeOverview, type AttendeeSource } from "./use-cases";

const attendee: Attendee = {
  uid: "u1",
  alias: "Nova_7",
  role: "attendee",
  squad: "firebase",
  xp: 120,
  credits: 4,
  createdAt: new Date("2026-10-04T12:00:00Z"),
};

const source = (result: Awaited<ReturnType<AttendeeSource["findByUid"]>>): AttendeeSource => ({
  findByUid: vi.fn(async () => result),
});

describe("getAttendeeOverview", () => {
  it("builds the card of the attendee that was found", async () => {
    const attendees = source(ok(attendee));

    const result = await getAttendeeOverview({ attendees }, "u1");

    expect(attendees.findByUid).toHaveBeenCalledWith("u1");
    expect(result).toMatchObject({
      ok: true,
      value: { alias: "Nova_7", xp: 120, credits: 4, rank: { id: "pilot", level: 2 }, squadId: "firebase" },
    });
  });

  it("ranks the attendee with the edition's own ladder and its names", async () => {
    const ladder = createRankLadder([
      { id: "cadet", name: "Cadete", minXp: 0 },
      { id: "ace", name: "As del espacio", minXp: 50 },
      { id: "captain", name: "Capitana", minXp: 300 },
    ]);

    const result = await getAttendeeOverview({ attendees: source(ok(attendee)), ranks: async () => ladder }, "u1");

    expect(result).toMatchObject({
      ok: true,
      value: { rank: { id: "ace", level: 2, name: "As del espacio" }, nextRank: { id: "captain", minXp: 300 }, progressPercent: 28 },
    });
  });

  it("reads the person's wallet next to the profile", async () => {
    const wallet = vi.fn(async () => ({ creditsEnabled: true, balance: 520 }));

    const result = await getAttendeeOverview({ attendees: source(ok(attendee)), wallet }, "u1");

    expect(wallet).toHaveBeenCalledWith("u1");
    expect(result).toMatchObject({ ok: true, value: { credits: 4, walletBalance: 520, creditsEnabled: true } });
  });

  it("resolves null for a user without an attendee profile, so the page can choose where they go", async () => {
    expect(await getAttendeeOverview({ attendees: source(ok(null)) }, "u1")).toEqual(ok(null));
  });

  it("reports a failed read instead of drawing a card with made-up numbers", async () => {
    const result = await getAttendeeOverview({ attendees: source(err({ code: "unknown" })) }, "u1");

    expect(result).toEqual(err({ code: "unknown" }));
  });
});
