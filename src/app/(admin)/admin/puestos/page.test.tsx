import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/checkpoint-admin.server", () => ({ checkpointAdminDeps: { marker: "deps" } }));
vi.mock("@/app-shell/checkpoints/manage.actions", () => ({
  createCheckpointAction: async () => ({ ok: false, code: "unknown" }),
  renameCheckpointAction: async () => ({ ok: false, code: "unknown" }),
  setCheckpointActiveAction: async () => ({ ok: false, code: "unknown" }),
  setFoodRequirementsAction: async () => ({ ok: false, code: "unknown" }),
}));
vi.mock("@/app-shell/composition/ranks.server", () => ({ rankDeps: { marker: "ranks" } }));
const attendeeServer = { getEditionLadder: vi.fn() };
vi.mock("@/features/attendee/server", () => attendeeServer);

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { listCheckpoints: vi.fn() };
vi.mock("@/features/checkpoints/server", () => server);

const { CheckpointsAdminView } = await import("@/features/checkpoints");
const actions = await import("@/app-shell/checkpoints/manage.actions");
const { default: AdminCheckpointsPage } = await import("./page");

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

const LIST = [{ id: "lunch-1", kind: "catering", name: "Almuerzo", active: true }];

describe("admin checkpoints page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    server.listCheckpoints.mockResolvedValue({ ok: true, value: LIST });
    attendeeServer.getEditionLadder.mockResolvedValue([
      { id: "recruit", minXp: 0, level: 1 },
      { id: "cadete-pro", minXp: 80, level: 2, name: "Cadete Pro" },
    ]);
  });

  it("checks the admin role itself before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new Error("forbidden"));

    await expect(AdminCheckpointsPage()).rejects.toThrow("forbidden");
    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(server.listCheckpoints).not.toHaveBeenCalled();
  });

  it("reads the checkpoints as the session's admin and hands them, with the actions and the links, to the view", async () => {
    const tree = await AdminCheckpointsPage();

    expect(server.listCheckpoints).toHaveBeenCalledWith({ marker: "deps" }, { uid: "a1", role: "admin" });
    const view = findElement(tree, CheckpointsAdminView);
    expect(view?.props).toMatchObject({
      checkpoints: LIST,
      create: actions.createCheckpointAction,
      rename: actions.renameCheckpointAction,
      setActive: actions.setCheckpointActiveAction,
      setRequirements: actions.setFoodRequirementsAction,
    });
    // The edition's ladder names the levels a meal can ask for.
    expect(attendeeServer.getEditionLadder).toHaveBeenCalledWith({ marker: "ranks" });
    expect(view?.props.levels).toEqual([
      { level: 1, name: "Recluta" },
      { level: 2, name: "Cadete Pro" },
    ]);
    // No codes to link: staff scan the cadet's QR at the stations.
    expect(view?.props).not.toHaveProperty("hrefs");
  });

  it("leaves the talks out: they have their own screen (Charlas)", async () => {
    server.listCheckpoints.mockResolvedValue({ ok: true, value: [...LIST, { id: "talk-keynote", kind: "talk", name: "Keynote", active: true }] });

    const view = findElement(await AdminCheckpointsPage(), CheckpointsAdminView);

    expect(view?.props.checkpoints).toEqual(LIST);
  });

  it("surfaces a failed read through the error boundary instead of an empty list", async () => {
    server.listCheckpoints.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AdminCheckpointsPage()).rejects.toThrow("Could not read the checkpoints");
  });
});
