import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const NOW = new Date("2026-10-20T12:00:00Z");
vi.mock("@/app-shell/composition/event.server", () => ({ editionsDeps: { marker: "editions", now: () => NOW }, moduleDeps: { marker: "modules" }, permissionDeps: { marker: "permissions" } }));
vi.mock("@/app-shell/event/editions.actions", () => ({
  createEditionAction: async () => ({ ok: true }),
  updateEditionAction: async () => ({ ok: true }),
  setEditionStatusAction: async () => ({ ok: true }),
  publishEditionAction: async () => ({ ok: true }),
  copyEditionAction: async () => ({ ok: true }),
  setEditionModulesAction: async () => ({ ok: true }),
  setEditionPermissionsAction: async () => ({ ok: true }),
}));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { listEditions: vi.fn(), listOffModules: vi.fn(), getEditionPermissions: vi.fn(), runInEdition: vi.fn() };
vi.mock("@/features/event/server", () => server);

const { EventsAdminView } = await import("@/features/event");
const actions = await import("@/app-shell/event/editions.actions");
const { default: AdminEventsPage } = await import("./page");

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

const START = new Date("2026-10-24T14:00:00Z");
const PERMISSIONS = { organizer: { raffle: "view" }, staffStations: ["entrance"] };
const EDITION = { id: "devfest-2026", name: "DevFest Tacna 2026", venue: "UNJBG", startsAt: START, endsAt: null, status: "draft", isPublic: true };

describe("admin events page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", adminScope: "global", displayName: null, photoUrl: null });
    server.listEditions.mockResolvedValue({ ok: true, value: [EDITION] });
    server.runInEdition.mockImplementation(async (_eventId: string, work: () => Promise<unknown>) => work());
    server.listOffModules.mockResolvedValue({ ok: true, value: ["raffle"] });
    server.getEditionPermissions.mockResolvedValue({ ok: true, value: PERMISSIONS });
  });

  it("checks the admin role itself before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new Error("not-found"));

    await expect(AdminEventsPage()).rejects.toThrow("not-found");
    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(server.listEditions).not.toHaveBeenCalled();
  });

  it("lists the editions as the session's admin and hands them, with dates as text and the actions, to the view", async () => {
    const view = findElement(await AdminEventsPage(), EventsAdminView);

    expect(server.listEditions).toHaveBeenCalledWith({ marker: "editions", now: expect.any(Function) }, { uid: "a1", role: "admin", adminScope: "global" });
    expect(view?.props).toEqual({
      editions: [{ ...EDITION, startsAt: START.toISOString(), endsAt: null }],
      now: NOW.toISOString(),
      canManage: true,
      create: actions.createEditionAction,
      update: actions.updateEditionAction,
      setStatus: actions.setEditionStatusAction,
      publish: actions.publishEditionAction,
      copyContent: actions.copyEditionAction,
      modules: { "devfest-2026": ["raffle"] },
      saveModules: actions.setEditionModulesAction,
      permissions: { "devfest-2026": PERMISSIONS },
      savePermissions: actions.setEditionPermissionsAction,
    });
    expect(server.runInEdition).toHaveBeenCalledWith("devfest-2026", expect.any(Function));
  });

  it("lets an organizer only edit their edition", async () => {
    guards.requireRole.mockResolvedValue({ uid: "o1", role: "admin", adminScope: "edition", displayName: null, photoUrl: null });

    const view = findElement(await AdminEventsPage(), EventsAdminView);

    expect(server.listEditions).toHaveBeenCalledWith(expect.anything(), { uid: "o1", role: "admin", adminScope: "edition" });
    expect(view?.props.canManage).toBe(false);
    expect(view?.props.copyContent).toBeUndefined();
    expect(view?.props.saveModules).toBeUndefined();
    expect(server.listOffModules).not.toHaveBeenCalled();
  });

  it("surfaces a failed read through the error boundary", async () => {
    server.listEditions.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AdminEventsPage()).rejects.toThrow("Could not read the editions");
  });
});
