import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/economy.server", () => ({ economyDeps: { marker: "economy" } }));
vi.mock("@/app-shell/composition/edition.server", () => ({ currentEditionId: async () => "devfest-2026" }));
vi.mock("@/app-shell/economy/economy.actions", () => ({ saveEconomyAction: async () => ({ ok: true }) }));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { getEconomyForEdit: vi.fn() };
vi.mock("@/features/economy/server", () => server);

const { EconomySettingsView, DEFAULT_ECONOMY } = await import("@/features/economy");
const { saveEconomyAction } = await import("@/app-shell/economy/economy.actions");
const { default: AdminEconomyPage } = await import("./page");

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

describe("admin economy page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    server.getEconomyForEdit.mockResolvedValue({ ok: true, value: { settings: DEFAULT_ECONOMY, isDefault: true } });
  });

  it("checks the admin role before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new Error("not-found"));

    await expect(AdminEconomyPage()).rejects.toThrow("not-found");
    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(server.getEconomyForEdit).not.toHaveBeenCalled();
  });

  it("opens the settings with the save action", async () => {
    const view = findElement(await AdminEconomyPage(), EconomySettingsView);

    expect(server.getEconomyForEdit).toHaveBeenCalledWith({ marker: "economy" }, { role: "admin" });
    expect(view?.props).toEqual({ settings: DEFAULT_ECONOMY, isDefault: true, eventId: "devfest-2026", save: saveEconomyAction });
  });

  it("surfaces a failed read through the error boundary", async () => {
    server.getEconomyForEdit.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AdminEconomyPage()).rejects.toThrow("Could not read the economy settings");
  });
});
