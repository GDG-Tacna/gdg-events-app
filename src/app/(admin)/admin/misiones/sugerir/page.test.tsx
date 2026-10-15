import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const media = vi.hoisted(() => ({ uploadImageAction: async () => ({ ok: false as const, code: "unknown" as const }) }));
vi.mock("@/app-shell/media/upload.action", () => media);
vi.mock("@/app-shell/missions/manage.actions", () => ({ createMissionAction: async () => ({ ok: true }) }));
vi.mock("@/app-shell/missions/suggest.action", () => ({ suggestMissionsAction: async () => ({ ok: true, suggestions: [] }) }));
const formOptions = { loadMissionFormOptions: vi.fn() };
vi.mock("@/app-shell/missions/form-options.server", () => formOptions);

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
  useRouter: () => ({}),
}));

const features = vi.hoisted(() => ({ FEATURES: { missionSuggestions: true } }));
vi.mock("@/shared/config/features", () => features);

const { SuggestMissionsView } = await import("@/features/missions");
const { createMissionAction } = await import("@/app-shell/missions/manage.actions");
const { suggestMissionsAction } = await import("@/app-shell/missions/suggest.action");
const { default: AdminSuggestMissionsPage } = await import("./page");

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

const OPTIONS = { quadrants: [{ id: "ai", name: "AI" }], checkpoints: { talk: [], stand: [] } };

describe("admin suggest missions page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.missionSuggestions = true;
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    formOptions.loadMissionFormOptions.mockResolvedValue(OPTIONS);
  });

  it("is not found when suggestions are switched off, without reading the session", async () => {
    features.FEATURES.missionSuggestions = false;

    await expect(AdminSuggestMissionsPage()).rejects.toBeInstanceOf(NotFound);
    expect(guards.requireRole).not.toHaveBeenCalled();
  });

  it("checks the admin role before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new Error("not-found"));

    await expect(AdminSuggestMissionsPage()).rejects.toThrow("not-found");
    expect(formOptions.loadMissionFormOptions).not.toHaveBeenCalled();
  });

  it("offers the edition's quadrants, the suggest and save actions, and the way back", async () => {
    const view = findElement(await AdminSuggestMissionsPage(), SuggestMissionsView);

    expect(view?.props).toEqual({ ...OPTIONS, suggest: suggestMissionsAction, save: createMissionAction, upload: media.uploadImageAction, listHref: "/admin/misiones" });
  });
});
