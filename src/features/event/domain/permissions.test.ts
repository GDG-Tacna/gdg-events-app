import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { DEFAULT_PERMISSIONS, parsePermissions, sectionAccess, setEditionPermissions, type EditionPermissions, type PermissionDeps } from "./permissions";

vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const GLOBAL = { uid: "a1", role: "admin", adminScope: "global" } as const;
const ORGANIZER = { uid: "o1", role: "admin", adminScope: "edition" } as const;

describe("edition permissions", () => {
  it("lets organizers edit everything and staff operate every station until an admin limits them", () => {
    expect(Object.values(DEFAULT_PERMISSIONS.organizer).every((level) => level === "edit")).toBe(true);
    expect(DEFAULT_PERMISSIONS.staffStations).toEqual(["entrance", "catering", "stand"]);
    expect(parsePermissions(undefined)).toEqual(DEFAULT_PERMISSIONS);
  });

  it("reads stored levels over the defaults, ignoring anything unknown", () => {
    const read = parsePermissions({ organizer: { raffle: "none", economy: "view", store: "edit", missions: "admin" }, staffStations: ["stand", "kitchen"] });

    expect(read.organizer.raffle).toBe("none");
    expect(read.organizer.economy).toBe("view");
    expect(read.organizer.missions).toBe("edit");
    expect(read.staffStations).toEqual(["stand"]);
  });

  it("never limits an admin of every edition, and gives nothing to anyone who is not an admin", () => {
    const limited: EditionPermissions = { ...DEFAULT_PERMISSIONS, organizer: { ...DEFAULT_PERMISSIONS.organizer, raffle: "none" } };

    expect(sectionAccess(limited, GLOBAL, "raffle")).toBe("edit");
    expect(sectionAccess(limited, ORGANIZER, "raffle")).toBe("none");
    expect(sectionAccess(limited, ORGANIZER, "missions")).toBe("edit");
    expect(sectionAccess(limited, { role: "staff" }, "missions")).toBe("none");
  });
});

describe("setEditionPermissions", () => {
  function setup() {
    const saved: EditionPermissions[] = [];
    const deps = {
      store: { read: vi.fn(async () => ok(DEFAULT_PERMISSIONS)), save: vi.fn(async (permissions: EditionPermissions) => (saved.push(permissions), ok(undefined))) },
      audit: { append: vi.fn(async () => ok(undefined)) },
      now: () => new Date(0),
    } satisfies PermissionDeps;
    return { deps, saved };
  }

  it("saves the levels over the defaults and the stations in order, and audits what is limited", async () => {
    const t = setup();

    const result = await setEditionPermissions(t.deps, GLOBAL, { eventId: "meetup-nov", organizer: { raffle: "none", economy: "view" }, staffStations: ["stand", "entrance"] });

    expect(result.ok && result.value.organizer.missions).toBe("edit");
    expect(t.saved[0].organizer.raffle).toBe("none");
    expect(t.saved[0].staffStations).toEqual(["entrance", "stand"]);
    expect(t.deps.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "event.permissions", targetUid: "meetup-nov", details: { organizer: "economy:view,raffle:none", staffStations: "entrance,stand" } }),
    );
  });

  it("refuses an organizer and unknown sections, levels or stations before saving", async () => {
    const t = setup();

    expect(await setEditionPermissions(t.deps, ORGANIZER, { eventId: "e1", organizer: {}, staffStations: [] })).toEqual(err({ code: "forbidden" }));
    expect(await setEditionPermissions(t.deps, GLOBAL, { eventId: "e1", organizer: { store: "edit" }, staffStations: [] })).toEqual(err({ code: "invalid-permissions" }));
    expect(await setEditionPermissions(t.deps, GLOBAL, { eventId: "e1", organizer: { raffle: "admin" }, staffStations: [] })).toEqual(err({ code: "invalid-permissions" }));
    expect(await setEditionPermissions(t.deps, GLOBAL, { eventId: "e1", organizer: {}, staffStations: ["kitchen"] })).toEqual(err({ code: "invalid-permissions" }));
    expect(t.deps.store.save).not.toHaveBeenCalled();
  });
});
