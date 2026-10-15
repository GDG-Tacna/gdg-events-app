import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/odyssey.server", () => ({ odysseyAdminDeps: { marker: "admin" }, storyAdminDeps: { titles: { marker: "titles" } } }));
vi.mock("@/app-shell/odyssey/manage.actions", () => ({
  seedCommunicationsAction: async () => ({ ok: true }),
  createCommunicationAction: async () => ({ ok: true }),
  updateCommunicationAction: async () => ({ ok: true }),
  setCommunicationActiveAction: async () => ({ ok: true }),
  moveCommunicationAction: async () => ({ ok: true }),
  saveStoryTitleAction: async () => ({ ok: true }),
}));
const formOptions = { loadOdysseyFormOptions: vi.fn() };
vi.mock("@/app-shell/odyssey/form-options.server", () => formOptions);

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const server = {
  listManagedCommunications: vi.fn(),
  DEFAULT_COMMUNICATIONS: [{}, {}],
  // The admin reads the stored title, past the cadets' cache.
  getStoryTitle: async (source: { marker: string }) => (source.marker === "titles" ? "Odisea de Código" : null),
};
vi.mock("@/features/odyssey/server", () => server);

const { CommunicationForm, CommunicationsAdminView } = await import("@/features/odyssey");
const actions = await import("@/app-shell/odyssey/manage.actions");
const { default: AdminOdysseyPage } = await import("./page");
const { default: AdminNewCommunicationPage } = await import("./nueva/page");
const { default: AdminEditCommunicationPage } = await import("./[communicationId]/page");

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

const COMM = { id: "ai-senal", title: "Señal" };
const OPTIONS = { quadrants: [{ id: "ai", name: "AI" }], missions: [{ id: "ai-stand", name: "Visita el stand de AI" }] };
const edit = (communicationId: string) =>
  AdminEditCommunicationPage({ params: Promise.resolve({ communicationId }) } as unknown as Parameters<typeof AdminEditCommunicationPage>[0]);

describe("admin odyssey pages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    server.listManagedCommunications.mockResolvedValue({ ok: true, value: [COMM] });
    formOptions.loadOdysseyFormOptions.mockResolvedValue(OPTIONS);
  });

  it("every page checks the admin role before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new Error("not-found"));

    await expect(AdminOdysseyPage()).rejects.toThrow("not-found");
    await expect(AdminNewCommunicationPage()).rejects.toThrow("not-found");
    await expect(edit("ai-senal")).rejects.toThrow("not-found");
    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(server.listManagedCommunications).not.toHaveBeenCalled();
    expect(formOptions.loadOdysseyFormOptions).not.toHaveBeenCalled();
  });

  it("lists the transmissions with names for quadrants and missions, the actions and plain links", async () => {
    const view = findElement(await AdminOdysseyPage(), CommunicationsAdminView);

    expect(view?.props).toEqual({
      communications: [COMM],
      ...OPTIONS,
      defaultsCount: 2,
      seed: actions.seedCommunicationsAction,
      setActive: actions.setCommunicationActiveAction,
      move: actions.moveCommunicationAction,
      storyTitle: "Odisea de Código",
      saveTitle: actions.saveStoryTitleAction,
      hrefs: { create: "/admin/odisea/nueva", editBase: "/admin/odisea" },
    });
  });

  it("offers the create form, and the edit form for a known transmission only", async () => {
    expect(findElement(await AdminNewCommunicationPage(), CommunicationForm)?.props).toEqual({ mode: "create", save: actions.createCommunicationAction, ...OPTIONS, listHref: "/admin/odisea" });
    expect(findElement(await edit("ai-senal"), CommunicationForm)?.props).toEqual({
      mode: "edit",
      communication: COMM,
      save: actions.updateCommunicationAction,
      ...OPTIONS,
      listHref: "/admin/odisea",
    });
    await expect(edit("ghost")).rejects.toBeInstanceOf(NotFound);
  });

  it("surfaces a failed read through the error boundary", async () => {
    server.listManagedCommunications.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AdminOdysseyPage()).rejects.toThrow("Could not read the communications");
    await expect(edit("ai-senal")).rejects.toThrow("Could not read the communications");
  });
});
