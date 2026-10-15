import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/achievements.server", () => ({ achievementAdminDeps: { marker: "admin" } }));
vi.mock("@/app-shell/media/upload.action", () => ({ uploadImageAction: async () => ({ ok: false, code: "unknown" }) }));
vi.mock("@/app-shell/achievements/manage.actions", () => ({
  seedBadgesAction: async () => ({ ok: true }),
  createBadgeAction: async () => ({ ok: true }),
  updateBadgeAction: async () => ({ ok: true }),
  setBadgeActiveAction: async () => ({ ok: true }),
  moveBadgeAction: async () => ({ ok: true }),
}));
const formOptions = vi.hoisted(() => ({
  loadAchievementFormOptions: vi.fn(),
  ruleNamesOf: vi.fn(() => ({ quadrants: { ai: "IA" }, missions: {} })),
}));
vi.mock("@/app-shell/achievements/form-options.server", () => formOptions);

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const server = { listManagedBadges: vi.fn(), DEFAULT_BADGES: [{}, {}, {}] };
vi.mock("@/features/achievements/server", () => server);

const { BadgeForm, BadgesAdminView } = await import("@/features/achievements");
const actions = await import("@/app-shell/achievements/manage.actions");
const { uploadImageAction } = await import("@/app-shell/media/upload.action");
const { default: AdminAchievementsPage } = await import("./page");
const { default: AdminNewBadgePage } = await import("./nueva/page");
const { default: AdminEditBadgePage } = await import("./[badgeId]/page");

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

const OPTIONS = { quadrants: [{ id: "ai", name: "IA" }], missions: [{ id: "ai-quiz", name: "Quiz" }], levels: [{ level: 1, name: "Recluta" }] };
const BADGE = { id: "maestro-ia", name: "Maestro", description: "Todo IA.", tone: "gold", rule: { type: "quadrant-complete", quadrantId: "ai" }, order: 0, active: true };
const params = (badgeId: string) => ({ params: Promise.resolve({ badgeId }) });

beforeEach(() => {
  vi.clearAllMocks();
  guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
  formOptions.loadAchievementFormOptions.mockResolvedValue(OPTIONS);
  server.listManagedBadges.mockResolvedValue({ ok: true, value: [BADGE] });
});

describe("admin Logros pages", () => {
  it("check the admin role before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new Error("forbidden"));

    await expect(AdminAchievementsPage()).rejects.toThrow("forbidden");
    await expect(AdminNewBadgePage()).rejects.toThrow("forbidden");
    await expect(AdminEditBadgePage(params("maestro-ia"))).rejects.toThrow("forbidden");
    expect(server.listManagedBadges).not.toHaveBeenCalled();
    expect(formOptions.loadAchievementFormOptions).not.toHaveBeenCalled();
  });

  it("lists the badges with the names their rules point at, the bundled count, the actions and plain links", async () => {
    const view = findElement(await AdminAchievementsPage(), BadgesAdminView);

    expect(server.listManagedBadges).toHaveBeenCalledWith({ marker: "admin" }, { uid: "a1", role: "admin" });
    expect(formOptions.ruleNamesOf).toHaveBeenCalledWith(OPTIONS);
    expect(view?.props).toEqual({
      badges: [BADGE],
      names: { quadrants: { ai: "IA" }, missions: {} },
      defaultsCount: 3,
      seed: actions.seedBadgesAction,
      setActive: actions.setBadgeActiveAction,
      move: actions.moveBadgeAction,
      hrefs: { create: "/admin/logros/nueva", editBase: "/admin/logros" },
    });
  });

  it("opens the form to create a badge with the edition's quadrants, missions and levels", async () => {
    const form = findElement(await AdminNewBadgePage(), BadgeForm);

    expect(form?.props).toEqual({ mode: "create", save: actions.createBadgeAction, upload: uploadImageAction, ...OPTIONS, listHref: "/admin/logros" });
  });

  it("opens a badge to edit, and answers not found for an unknown one", async () => {
    const form = findElement(await AdminEditBadgePage(params("maestro-ia")), BadgeForm);
    expect(form?.props).toEqual({ mode: "edit", badge: BADGE, save: actions.updateBadgeAction, upload: uploadImageAction, ...OPTIONS, listHref: "/admin/logros" });

    await expect(AdminEditBadgePage(params("nope"))).rejects.toThrow("not-found");
  });

  it("surface a failed read through the error boundary", async () => {
    server.listManagedBadges.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AdminAchievementsPage()).rejects.toThrow("Could not read the badges");
    await expect(AdminEditBadgePage(params("maestro-ia"))).rejects.toThrow("Could not read the badges");
  });
});
