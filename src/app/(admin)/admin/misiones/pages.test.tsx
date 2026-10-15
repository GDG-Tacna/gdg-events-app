import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const media = vi.hoisted(() => ({ uploadImageAction: async () => ({ ok: false as const, code: "unknown" as const }) }));
vi.mock("@/app-shell/media/upload.action", () => media);
vi.mock("@/app-shell/composition/mission-admin.server", () => ({ missionAdminDeps: { marker: "admin" } }));
vi.mock("@/app-shell/composition/quadrants.server", () => ({ galaxyDeps: { marker: "galaxy" } }));
vi.mock("@/app-shell/missions/manage.actions", () => ({
  seedMissionsAction: async () => ({ ok: true }),
  createMissionAction: async () => ({ ok: true }),
  updateMissionAction: async () => ({ ok: true }),
  setMissionActiveAction: async () => ({ ok: true }),
  moveMissionAction: async () => ({ ok: true }),
}));
const formOptions = { loadMissionFormOptions: vi.fn() };
vi.mock("@/app-shell/missions/form-options.server", () => formOptions);

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const missionsServer = { listManagedMissions: vi.fn(), DEFAULT_MISSIONS: [{}, {}, {}] };
vi.mock("@/features/missions/server", () => missionsServer);
const quadrantsServer = { getGalaxyMap: vi.fn() };
vi.mock("@/features/quadrants/server", () => quadrantsServer);

const { MissionForm, MissionsAdminView } = await import("@/features/missions");
const actions = await import("@/app-shell/missions/manage.actions");
const { default: AdminMissionsPage } = await import("./page");
const { default: AdminNewMissionPage } = await import("./nueva/page");
const { default: AdminEditMissionPage } = await import("./[missionId]/page");

function findElement(node: ReactNode, type: unknown): { props: Record<string, unknown> } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as { type: unknown; props: Record<string, unknown> };
  if (element.type === type) return element;
  return findElement(element.props.children as ReactNode, type);
}

const MISSION = { id: "ai-quiz", title: "Desafío AI" };
const OPTIONS = {
  quadrants: [{ id: "ai", name: "AI" }],
  checkpoints: { talk: [], stand: [{ id: "stand-ai-1", name: "Stand AI 1" }] },
  minigames: [{ id: "circuits", name: "Conecta los circuitos", enabled: true, difficulty: "normal" }],
};
const GALAXY = { venue: { width: 100, height: 100, areas: [] }, quadrants: [{ id: "ai", name: "AI", tagline: "x", planet: "ai", order: 0, active: true, stands: [] }] };
const edit = (missionId: string) => AdminEditMissionPage({ params: Promise.resolve({ missionId }) } as unknown as Parameters<typeof AdminEditMissionPage>[0]);

describe("admin mission pages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    missionsServer.listManagedMissions.mockResolvedValue({ ok: true, value: [MISSION] });
    quadrantsServer.getGalaxyMap.mockResolvedValue({ ok: true, value: GALAXY });
    formOptions.loadMissionFormOptions.mockResolvedValue(OPTIONS);
  });

  it("every page checks the admin role itself before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new Error("not-found"));

    await expect(AdminMissionsPage()).rejects.toThrow("not-found");
    await expect(AdminNewMissionPage()).rejects.toThrow("not-found");
    await expect(edit("ai-quiz")).rejects.toThrow("not-found");
    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(missionsServer.listManagedMissions).not.toHaveBeenCalled();
    expect(formOptions.loadMissionFormOptions).not.toHaveBeenCalled();
  });

  it("lists the missions with the quadrant names, the bundled count, the actions and plain links", async () => {
    const view = findElement(await AdminMissionsPage(), MissionsAdminView);

    expect(missionsServer.listManagedMissions).toHaveBeenCalledWith({ marker: "admin" }, { uid: "a1", role: "admin" });
    expect(view?.props).toEqual({
      missions: [MISSION],
      quadrants: [{ id: "ai", name: "AI" }],
      defaultsCount: 3,
      seed: actions.seedMissionsAction,
      setActive: actions.setMissionActiveAction,
      move: actions.moveMissionAction,
      // Plain text only: a client component cannot receive functions from a server page.
      hrefs: { create: "/admin/misiones/nueva", editBase: "/admin/misiones", suggest: "/admin/misiones/sugerir" },
    });
  });

  it("still lists the missions when the quadrants cannot be read", async () => {
    quadrantsServer.getGalaxyMap.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    expect(findElement(await AdminMissionsPage(), MissionsAdminView)?.props.quadrants).toEqual([]);
  });

  it("surfaces a failed read through the error boundary", async () => {
    missionsServer.listManagedMissions.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AdminMissionsPage()).rejects.toThrow("Could not read the missions");
    await expect(edit("ai-quiz")).rejects.toThrow("Could not read the missions");
  });

  it("offers the create form with the edition's quadrants and open checkpoints", async () => {
    const form = findElement(await AdminNewMissionPage(), MissionForm);

    expect(formOptions.loadMissionFormOptions).toHaveBeenCalledWith({ uid: "a1", role: "admin" });
    expect(form?.props).toEqual({ mode: "create", save: actions.createMissionAction, upload: media.uploadImageAction, ...OPTIONS, listHref: "/admin/misiones" });
  });

  it("edits an existing mission, and is not found for an unknown one", async () => {
    const form = findElement(await edit("ai-quiz"), MissionForm);
    expect(form?.props).toEqual({ mode: "edit", mission: MISSION, save: actions.updateMissionAction, upload: media.uploadImageAction, ...OPTIONS, listHref: "/admin/misiones" });

    await expect(edit("ghost")).rejects.toBeInstanceOf(NotFound);
  });
});
