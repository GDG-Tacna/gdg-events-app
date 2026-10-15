import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/event/server", () => ({ currentEditionOf: async () => "e1" }));
const mocks = vi.hoisted(() => ({ getGalaxyMap: vi.fn(), list: vi.fn(), checkpointIdsOf: vi.fn() }));
vi.mock("@/app-shell/composition/quadrants.server", () => ({ galaxyDeps: { marker: "galaxy" } }));
vi.mock("@/features/quadrants/server", () => ({ getGalaxyMap: mocks.getGalaxyMap }));
vi.mock("@/features/admin/server", () => ({ FirestoreAuditLog: class {} }));
vi.mock("@/features/talks/server", () => ({
  FirestoreTalkStore: class {
    list = mocks.list;
  },
}));
vi.mock("@/features/checkins/server", () => ({
  FirestoreCheckInCounter: class {
    checkpointIdsOf = mocks.checkpointIdsOf;
  },
}));

const { agendaDeps, refreshAgenda, talkAdminDeps, talkRooms } = await import("./talks.server");

const GALAXY = { venue: null, quadrants: [{ id: "auditorio", name: "Auditorio" }, { id: "sala-b", name: "Sala B" }] };

describe("talks composition", () => {
  beforeEach(() => vi.resetAllMocks());

  it("offers the edition's quadrants as rooms", async () => {
    mocks.getGalaxyMap.mockResolvedValue({ ok: true, value: GALAXY });

    expect(await talkRooms()).toEqual([
      { id: "auditorio", name: "Auditorio" },
      { id: "sala-b", name: "Sala B" },
    ]);
    expect(await talkAdminDeps.directory.roomIds()).toEqual({ ok: true, value: new Set(["auditorio", "sala-b"]) });
    expect(mocks.getGalaxyMap).toHaveBeenCalledWith({ marker: "galaxy" });
  });

  it("reports a failed read of the quadrants", async () => {
    mocks.getGalaxyMap.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(talkRooms()).rejects.toThrow("Could not read the quadrants");
    expect(await talkAdminDeps.directory.roomIds()).toEqual({ ok: false, error: { code: "unknown" } });
  });

  it("reads the admin's times with the venue's offset (Peru, UTC-5)", () => {
    expect(talkAdminDeps.utcOffset).toBe("-05:00");
  });

  it("keeps the talks for the agenda, drops them after an admin change, and reads the cadet's talk check-ins each time", async () => {
    refreshAgenda();
    mocks.list.mockResolvedValue({ ok: true, value: [] });
    mocks.checkpointIdsOf.mockResolvedValue({ ok: true, value: new Set(["keynote"]) });

    await agendaDeps.talks();
    await agendaDeps.talks();
    expect(mocks.list).toHaveBeenCalledTimes(1);
    refreshAgenda();
    await agendaDeps.talks();
    expect(mocks.list).toHaveBeenCalledTimes(2);

    expect(await agendaDeps.attendedTalkIds("u1")).toEqual({ ok: true, value: new Set(["keynote"]) });
    await agendaDeps.attendedTalkIds("u1");
    expect(mocks.checkpointIdsOf).toHaveBeenCalledTimes(2);
    expect(mocks.checkpointIdsOf).toHaveBeenCalledWith("u1", "talk");

    mocks.checkpointIdsOf.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(await agendaDeps.attendedTalkIds("u1")).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
