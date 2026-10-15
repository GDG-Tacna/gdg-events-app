import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { getAgenda, type AgendaDeps } from "./agenda";
import type { Talk } from "./talk";

const NOW = new Date("2026-10-24T15:10:00Z"); // 10:10 in Tacna
const talk = (id: string, start: string | null, end: string | null, overrides: Partial<Talk> = {}): Talk => ({
  id,
  title: id,
  speaker: "Ana",
  startsAt: start ? new Date(start) : null,
  endsAt: end ? new Date(end) : null,
  roomId: "auditorio",
  description: "",
  active: true,
  ...overrides,
});

const TALKS = [
  talk("later", "2026-10-24T17:00:00Z", "2026-10-24T17:45:00Z"),
  talk("past", "2026-10-24T14:00:00Z", "2026-10-24T14:45:00Z"),
  talk("live", "2026-10-24T15:00:00Z", "2026-10-24T15:45:00Z"),
  talk("next", "2026-10-24T16:00:00Z", "2026-10-24T16:45:00Z"),
  talk("closed", "2026-10-24T16:00:00Z", "2026-10-24T16:45:00Z", { active: false }),
  talk("undated", null, null),
];

function deps(overrides: Partial<AgendaDeps> = {}): AgendaDeps {
  return {
    talks: vi.fn(async () => ok(TALKS)),
    attendedTalkIds: vi.fn(async () => ok(new Set(["past", "live"]))),
    now: () => NOW,
    ...overrides,
  };
}

describe("getAgenda", () => {
  it("lists the open talks in time order, each with where it stands now and whether the cadet attended it", async () => {
    const d = deps();
    const agenda = await getAgenda(d, "u1");

    expect(d.attendedTalkIds).toHaveBeenCalledWith("u1");
    expect(agenda.ok && agenda.value.map(({ id, status, attended }) => [id, status, attended])).toEqual([
      ["past", "past", true],
      ["live", "live", true],
      ["next", "next", false],
      ["later", "later", false],
      ["undated", "later", false],
    ]);
  });

  it("hands the times over as ISO instants and keeps what the screen shows", async () => {
    const agenda = await getAgenda(deps(), "u1");

    expect(agenda.ok && agenda.value[1]).toEqual({
      id: "live",
      title: "live",
      speaker: "Ana",
      startsAt: "2026-10-24T15:00:00.000Z",
      endsAt: "2026-10-24T15:45:00.000Z",
      roomId: "auditorio",
      description: "",
      status: "live",
      attended: true,
    });
    expect(agenda.ok && agenda.value[4]).toMatchObject({ startsAt: null, endsAt: null });
  });

  it("counts a talk as over at its exact end, and live from its exact start", async () => {
    const atEnd = await getAgenda(deps({ now: () => new Date("2026-10-24T15:45:00Z") }), "u1");
    expect(atEnd.ok && atEnd.value.find((item) => item.id === "live")?.status).toBe("past");

    const atStart = await getAgenda(deps({ now: () => new Date("2026-10-24T16:00:00Z") }), "u1");
    expect(atStart.ok && atStart.value.find((item) => item.id === "next")?.status).toBe("live");
    // Once it starts, the following talk becomes the next one.
    expect(atStart.ok && atStart.value.find((item) => item.id === "later")?.status).toBe("next");
  });

  it("marks no next talk after the last one has started, and never an undated one", async () => {
    const agenda = await getAgenda(deps({ now: () => new Date("2026-10-24T18:00:00Z") }), "u1");

    expect(agenda.ok && agenda.value.filter((item) => item.status === "next")).toEqual([]);
  });

  it("answers unknown when the talks or the cadet's check-ins cannot be read", async () => {
    expect(await getAgenda(deps({ talks: async () => err({ code: "x" }) }), "u1")).toEqual(err({ code: "unknown" }));
    expect(await getAgenda(deps({ attendedTalkIds: async () => err({ code: "x" }) }), "u1")).toEqual(err({ code: "unknown" }));
  });

  it("is empty when the edition has no open talks", async () => {
    expect(await getAgenda(deps({ talks: async () => ok([]) }), "u1")).toEqual(ok([]));
  });
});
