import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const media = vi.hoisted(() => ({ uploadImageAction: async () => ({ ok: false as const, code: "unknown" as const }) }));
vi.mock("@/app-shell/media/upload.action", () => media);
vi.mock("@/app-shell/composition/quadrant-admin.server", () => ({ quadrantAdminDeps: { marker: "admin" } }));
vi.mock("@/app-shell/quadrants/manage.actions", () => ({
  seedLayoutAction: async () => ({ ok: true }),
  createQuadrantAction: async () => ({ ok: true }),
  updateQuadrantAction: async () => ({ ok: true }),
  setQuadrantActiveAction: async () => ({ ok: true }),
  moveQuadrantAction: async () => ({ ok: true }),
  saveVenueAction: async () => ({ ok: true }),
}));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const server = { listManagedQuadrants: vi.fn(), getVenueForEdit: vi.fn(), DEFAULT_QUADRANTS: [{}, {}, {}, {}, {}] };
vi.mock("@/features/quadrants/server", () => server);

const { QuadrantForm, QuadrantsAdminView, VenueEditor } = await import("@/features/quadrants");
const actions = await import("@/app-shell/quadrants/manage.actions");
const { default: AdminMapPage } = await import("./page");
const { default: AdminNewQuadrantPage } = await import("./nueva/page");
const { default: AdminEditQuadrantPage } = await import("./[quadrantId]/page");
const { default: AdminVenuePage } = await import("../mapa/page");

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

const AI = { id: "ai", name: "AI", tagline: "Lema", planet: "ai", order: 0, active: true };
const EDIT = { venue: { width: 100, height: 140, areas: [] }, isDefault: true, quadrants: [AI] };
const edit = (quadrantId: string) => AdminEditQuadrantPage({ params: Promise.resolve({ quadrantId }) } as unknown as Parameters<typeof AdminEditQuadrantPage>[0]);

describe("admin map pages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    server.listManagedQuadrants.mockResolvedValue({ ok: true, value: [AI] });
    server.getVenueForEdit.mockResolvedValue({ ok: true, value: EDIT });
  });

  it("every page checks the admin role itself before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new Error("not-found"));

    await expect(AdminMapPage()).rejects.toThrow("not-found");
    await expect(AdminNewQuadrantPage()).rejects.toThrow("not-found");
    await expect(edit("ai")).rejects.toThrow("not-found");
    await expect(AdminVenuePage()).rejects.toThrow("not-found");
    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(server.listManagedQuadrants).not.toHaveBeenCalled();
    expect(server.getVenueForEdit).not.toHaveBeenCalled();
  });

  it("lists the quadrants with the actions and plain links", async () => {
    const view = findElement(await AdminMapPage(), QuadrantsAdminView);

    expect(view?.props).toEqual({
      quadrants: [AI],
      defaultsCount: 5,
      seed: actions.seedLayoutAction,
      setActive: actions.setQuadrantActiveAction,
      move: actions.moveQuadrantAction,
      // Plain text only: a client component cannot receive functions from a server page.
      hrefs: { create: "/admin/zonas/nueva", editBase: "/admin/zonas", plan: "/admin/mapa" },
    });
  });

  it("offers the create form, and the edit form for a known quadrant only", async () => {
    expect(findElement(await AdminNewQuadrantPage(), QuadrantForm)?.props).toEqual({ mode: "create", save: actions.createQuadrantAction, listHref: "/admin/zonas" });
    expect(findElement(await edit("ai"), QuadrantForm)?.props).toEqual({ mode: "edit", quadrant: AI, save: actions.updateQuadrantAction, listHref: "/admin/zonas" });
    await expect(edit("ghost")).rejects.toBeInstanceOf(NotFound);
  });

  it("opens the plan editor with the plan to edit", async () => {
    const editor = findElement(await AdminVenuePage(), VenueEditor);

    expect(server.getVenueForEdit).toHaveBeenCalledWith({ marker: "admin" }, { uid: "a1", role: "admin" });
    expect(editor?.props).toEqual({ ...EDIT, save: actions.saveVenueAction, upload: media.uploadImageAction, hrefs: { back: "/admin/zonas", checkpoints: "/admin/puestos" } });
  });

  it("surfaces failed reads through the error boundary", async () => {
    server.listManagedQuadrants.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    server.getVenueForEdit.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AdminMapPage()).rejects.toThrow("Could not read the quadrants");
    await expect(edit("ai")).rejects.toThrow("Could not read the quadrants");
    await expect(AdminVenuePage()).rejects.toThrow("Could not read the venue plan");
  });
});
