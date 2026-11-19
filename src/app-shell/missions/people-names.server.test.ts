import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const speakers = vi.hoisted(() => ({ speakerStore: { list: vi.fn() } }));
vi.mock("@/app-shell/composition/speakers.server", () => speakers);
const team = vi.hoisted(() => ({ teamByMissionRole: vi.fn() }));
vi.mock("@/app-shell/composition/mission-team.server", () => team);

const { missionPeopleNames } = await import("./people-names.server");

const member = (uid: string, displayName: string | null) => ({ uid, email: `${uid}@private.example`, displayName, role: "staff" });

describe("missionPeopleNames", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    speakers.speakerStore.list.mockResolvedValue({
      ok: true,
      value: [
        { id: "ana-torres", name: "Ana Torres", active: true },
        { id: "luis", name: "Luis Quispe", active: true },
        { id: "zoe", name: "Zoe Apaza", active: false },
      ],
    });
    team.teamByMissionRole.mockResolvedValue({
      ok: true,
      value: { organizer: [member("uid-olga-123", "Olga Rojas")], volunteer: [member("uid-ana-123", "Ana Mamani"), member("uid-bruno-1", null), member("uid-carla-1", "Carla Rojas")] },
    });
  });

  it("names the chosen speakers, in the order the mission lists them, leaving out anyone switched off", async () => {
    expect(await missionPeopleNames({ type: "speaker", speakerIds: ["luis", "ana-torres", "zoe", "ghost"] })).toEqual(["Luis Quispe", "Ana Torres"]);
  });

  it("names the chosen team members by the name on their account, never their email, and skips those with no name", async () => {
    const names = await missionPeopleNames({ type: "team", role: "volunteer", memberUids: ["uid-ana-123", "uid-bruno-1"] });

    expect(names).toEqual(["Ana Mamani"]);
    expect(JSON.stringify(names)).not.toContain("private.example");
  });

  it("only looks in the people of the mission's role", async () => {
    expect(await missionPeopleNames({ type: "team", role: "organizer", memberUids: ["uid-ana-123", "uid-olga-123"] })).toEqual(["Olga Rojas"]);
  });

  it("names nobody when the mission accepts everyone, or is of another type, without reading anything", async () => {
    expect(await missionPeopleNames({ type: "speaker", speakerIds: null })).toEqual([]);
    expect(await missionPeopleNames({ type: "team", role: "volunteer", memberUids: null })).toEqual([]);
    expect(await missionPeopleNames({ type: "squads" })).toEqual([]);
    expect(speakers.speakerStore.list).not.toHaveBeenCalled();
    expect(team.teamByMissionRole).not.toHaveBeenCalled();
  });

  it("names nobody when a read fails, so the mission shows its general instructions", async () => {
    speakers.speakerStore.list.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    team.teamByMissionRole.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    expect(await missionPeopleNames({ type: "speaker", speakerIds: ["luis"] })).toEqual([]);
    expect(await missionPeopleNames({ type: "team", role: "volunteer", memberUids: ["uid-ana-123"] })).toEqual([]);
  });
});
