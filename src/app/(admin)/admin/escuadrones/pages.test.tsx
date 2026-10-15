import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/squad-admin.server", () => ({ squadAdminDeps: { marker: "squads" } }));
vi.mock("@/app-shell/composition/event.server", () => ({ eventDeps: { marker: "event" } }));
vi.mock("@/app-shell/squads/manage.actions", () => ({
  seedSquadsAction: async () => ({ ok: true }),
  createSquadAction: async () => ({ ok: true }),
  updateSquadAction: async () => ({ ok: true }),
  retireSquadAction: async () => ({ ok: true }),
  reactivateSquadAction: async () => ({ ok: true }),
  moveSquadAction: async () => ({ ok: true }),
}));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const squadsServer = { listManagedSquads: vi.fn() };
vi.mock("@/features/squads/server", () => squadsServer);
const eventServer = { hasEventFinished: vi.fn() };
vi.mock("@/features/event/server", () => eventServer);

const { SquadForm, SquadsAdminView } = await import("@/features/squads");
const actions = await import("@/app-shell/squads/manage.actions");
const { default: AdminSquadsPage } = await import("./page");
const { default: AdminNewSquadPage } = await import("./nuevo/page");
const { default: AdminEditSquadPage } = await import("./[squadId]/page");

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

const rows = Array.from({ length: 16 }, () => "................");
const GEMINI = { id: "gemini", name: "Escuadrón Gemini", tagline: "Lema", sprite: { rows, palette: {} }, active: true, order: 0 };
const edit = (squadId: string) =>
  AdminEditSquadPage({ params: Promise.resolve({ squadId }) } as unknown as Parameters<typeof AdminEditSquadPage>[0]);

describe("admin squad pages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    squadsServer.listManagedSquads.mockResolvedValue({ ok: true, value: [GEMINI] });
    eventServer.hasEventFinished.mockResolvedValue({ ok: true, value: false });
  });

  it("every page checks the admin role itself before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new Error("not-found"));

    await expect(AdminSquadsPage()).rejects.toThrow("not-found");
    await expect(AdminNewSquadPage()).rejects.toThrow("not-found");
    await expect(edit("gemini")).rejects.toThrow("not-found");
    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(squadsServer.listManagedSquads).not.toHaveBeenCalled();
  });

  it("lists the squads with whether the event is over, the actions and the links", async () => {
    const view = findElement(await AdminSquadsPage(), SquadsAdminView);

    expect(squadsServer.listManagedSquads).toHaveBeenCalledWith({ marker: "squads" }, { uid: "a1", role: "admin" });
    expect(view?.props).toMatchObject({
      squads: [GEMINI],
      eventFinished: false,
      seed: actions.seedSquadsAction,
      retire: actions.retireSquadAction,
      reactivate: actions.reactivateSquadAction,
      move: actions.moveSquadAction,
    });
    // Plain text only: a client component cannot receive functions from a server page (it fails with a 500).
    expect(view?.props.hrefs).toEqual({ create: "/admin/escuadrones/nuevo", editBase: "/admin/escuadrones", event: "/admin/eventos" });
  });

  it("keeps retiring locked when the end of the event cannot be read", async () => {
    eventServer.hasEventFinished.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    expect(findElement(await AdminSquadsPage(), SquadsAdminView)?.props.eventFinished).toBe(false);
  });

  it("unlocks retiring once the event is over", async () => {
    eventServer.hasEventFinished.mockResolvedValue({ ok: true, value: true });

    expect(findElement(await AdminSquadsPage(), SquadsAdminView)?.props.eventFinished).toBe(true);
  });

  it("surfaces a failed read through the error boundary", async () => {
    squadsServer.listManagedSquads.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AdminSquadsPage()).rejects.toThrow("Could not read the squads");
    await expect(edit("gemini")).rejects.toThrow("Could not read the squads");
  });

  it("offers the create form", async () => {
    const form = findElement(await AdminNewSquadPage(), SquadForm);

    expect(form?.props).toMatchObject({ mode: "create", save: actions.createSquadAction, listHref: "/admin/escuadrones" });
  });

  it("edits an existing squad, and is not found for an unknown one", async () => {
    const form = findElement(await edit("gemini"), SquadForm);
    expect(form?.props).toMatchObject({
      mode: "edit",
      save: actions.updateSquadAction,
      squad: { id: "gemini", name: "Escuadrón Gemini", tagline: "Lema", sprite: GEMINI.sprite },
    });

    await expect(edit("cloud")).rejects.toBeInstanceOf(NotFound);
  });
});
