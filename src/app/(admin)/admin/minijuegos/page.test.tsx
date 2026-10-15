import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/minigames.server", () => ({ minigameAdminDeps: { marker: "minigames" } }));
vi.mock("@/app-shell/composition/edition.server", () => ({ currentEditionId: async () => "devfest-2026" }));
vi.mock("@/app-shell/minigames/settings.actions", () => ({ saveMinigameSettingsAction: async () => ({ ok: true }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
  useRouter: () => ({ refresh: () => undefined }),
}));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { getMinigameSettingsForEdit: vi.fn() };
vi.mock("@/features/minigames/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { minigames: true } }));
vi.mock("@/shared/config/features", () => features);

const { MinigameSettingsView, DEFAULT_MINIGAME_SETTINGS } = await import("@/features/minigames");
const { saveMinigameSettingsAction } = await import("@/app-shell/minigames/settings.actions");
const { default: AdminMinigamesPage } = await import("./page");

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

describe("admin mini-games page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.minigames = true;
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    server.getMinigameSettingsForEdit.mockResolvedValue({ ok: true, value: { settings: DEFAULT_MINIGAME_SETTINGS, isDefault: true } });
  });

  it("checks the admin role before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new Error("not-found"));

    await expect(AdminMinigamesPage()).rejects.toThrow("not-found");
    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(server.getMinigameSettingsForEdit).not.toHaveBeenCalled();
  });

  it("does not exist while mini-games are switched off", async () => {
    features.FEATURES.minigames = false;

    await expect(AdminMinigamesPage()).rejects.toThrow("not-found");
    expect(server.getMinigameSettingsForEdit).not.toHaveBeenCalled();
  });

  it("opens the settings with the save action", async () => {
    const view = findElement(await AdminMinigamesPage(), MinigameSettingsView);

    expect(server.getMinigameSettingsForEdit).toHaveBeenCalledWith({ marker: "minigames" }, { role: "admin" });
    expect(view?.props).toEqual({ settings: DEFAULT_MINIGAME_SETTINGS, isDefault: true, eventId: "devfest-2026", save: saveMinigameSettingsAction });
  });

  it("surfaces a failed read through the error boundary", async () => {
    server.getMinigameSettingsForEdit.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AdminMinigamesPage()).rejects.toThrow("Could not read the mini-game settings");
  });
});
