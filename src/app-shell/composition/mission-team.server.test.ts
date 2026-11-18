import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const admin = vi.hoisted(() => ({ teamDeps: { team: { list: vi.fn() } } }));
vi.mock("./admin.server", () => admin);

const { missionRoleOf, teamByMissionRole } = await import("./mission-team.server");

const member = (uid: string, role: "staff" | "organizer" | "admin") => ({ uid, email: `${uid}@example.com`, displayName: null, role });

describe("missionRoleOf", () => {
  it("counts staff as volunteers, and organizers and admins as organizers (the rule of the team code)", () => {
    expect(missionRoleOf("staff")).toBe("volunteer");
    expect(missionRoleOf("organizer")).toBe("organizer");
    expect(missionRoleOf("admin")).toBe("organizer");
  });
});

describe("teamByMissionRole", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("groups the edition's team by the role its code carries", async () => {
    admin.teamDeps.team.list.mockResolvedValue({
      ok: true,
      value: [member("uid-ana-123", "staff"), member("uid-olga-123", "organizer"), member("uid-root-123", "admin"), member("uid-bruno-1", "staff")],
    });

    const grouped = await teamByMissionRole();

    expect(grouped.ok && grouped.value.volunteer.map((m) => m.uid)).toEqual(["uid-ana-123", "uid-bruno-1"]);
    expect(grouped.ok && grouped.value.organizer.map((m) => m.uid)).toEqual(["uid-olga-123", "uid-root-123"]);
  });

  it("answers both roles, empty, for a team with nobody", async () => {
    admin.teamDeps.team.list.mockResolvedValue({ ok: true, value: [] });

    expect(await teamByMissionRole()).toEqual({ ok: true, value: { organizer: [], volunteer: [] } });
  });

  it("fails when the team cannot be read, instead of offering an empty list", async () => {
    admin.teamDeps.team.list.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    expect(await teamByMissionRole()).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
