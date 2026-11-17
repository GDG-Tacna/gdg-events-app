import { beforeEach, describe, expect, it, vi } from "vitest";

// The test setup replaces this module everywhere; here the real one is under test.
vi.unmock("@/app-shell/permissions.server");
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));
class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));
const composition = vi.hoisted(() => ({ editionPermissions: vi.fn() }));
vi.mock("./composition/event.server", () => composition);
const scopes = vi.hoisted(() => ({ staffScopeStore: { read: vi.fn() } }));
vi.mock("./composition/checkpoint-admin.server", () => scopes);

const { accessTo, mayEdit, requireSection, sectionLevels, staffCheckpoints, staffStations } = await import("./permissions.server");
const { logServerError } = await import("@/shared/lib/log");
const { DEFAULT_PERMISSIONS } = await import("@/features/event/domain/permissions");

const GLOBAL = { role: "admin" as const, adminScope: "global" as const };
const ORGANIZER = { role: "admin" as const, adminScope: "edition" as const };
const LIMITED = { organizer: { ...DEFAULT_PERMISSIONS.organizer, raffle: "none" as const, economy: "view" as const }, staffStations: ["stand" as const] };

describe("control center permissions", () => {
  beforeEach(() => {
    composition.editionPermissions.mockReset();
    composition.editionPermissions.mockResolvedValue({ ok: true, value: LIMITED });
  });

  it("lets an admin of every edition edit everything without reading the permissions", async () => {
    expect(await accessTo(GLOBAL, "raffle")).toBe("edit");
    expect(composition.editionPermissions).not.toHaveBeenCalled();
  });

  it("gives an organizer what the edition allows", async () => {
    expect(await accessTo(ORGANIZER, "raffle")).toBe("none");
    expect(await mayEdit(ORGANIZER, "economy")).toBe(false);
    expect(await mayEdit(ORGANIZER, ["economy", "missions"])).toBe(true);
    expect((await sectionLevels(ORGANIZER)).economy).toBe("view");
  });

  it("answers not found for a section the organizer may not see, and lets a view-only one through", async () => {
    await expect(requireSection(ORGANIZER, "raffle")).rejects.toThrow("not-found");
    await expect(requireSection(ORGANIZER, "economy")).resolves.toBeUndefined();
  });

  it("gives an organizer nothing when the permissions cannot be read, but lets staff operate every station", async () => {
    composition.editionPermissions.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    expect(await accessTo(ORGANIZER, "missions")).toBe("none");
    expect(await staffStations()).toEqual(["entrance", "catering", "stand"]);
  });

  it("answers the stations the edition lets staff operate", async () => {
    expect(await staffStations()).toEqual(["stand"]);
  });
});

describe("staff stations of one account", () => {
  beforeEach(() => {
    scopes.staffScopeStore.read.mockReset();
    vi.mocked(logServerError).mockClear();
  });

  it("answers the stations an admin limited a staff member to, and no limit when there is none", async () => {
    scopes.staffScopeStore.read.mockResolvedValueOnce({ ok: true, value: ["stand-louis"] }).mockResolvedValueOnce({ ok: true, value: null });

    expect(await staffCheckpoints({ uid: "s1", role: "staff" })).toEqual(["stand-louis"]);
    expect(scopes.staffScopeStore.read).toHaveBeenCalledWith("s1");
    expect(await staffCheckpoints({ uid: "s2", role: "staff" })).toBeUndefined();
  });

  it("never limits an admin, without reading anything", async () => {
    expect(await staffCheckpoints({ uid: "a1", role: "admin" })).toBeUndefined();
    expect(scopes.staffScopeStore.read).not.toHaveBeenCalled();
  });

  it("limits staff to nothing when their stations cannot be read, and says so in the log", async () => {
    scopes.staffScopeStore.read.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    expect(await staffCheckpoints({ uid: "s3", role: "staff" })).toEqual([]);
    expect(logServerError).toHaveBeenCalledWith("permissions.staff-scope", expect.any(Error));
  });
});
