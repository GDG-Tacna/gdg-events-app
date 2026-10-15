import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const media = vi.hoisted(() => ({ uploadImageAction: async () => ({ ok: false as const, code: "unknown" as const }) }));
vi.mock("@/app-shell/media/upload.action", () => media);
const composition = vi.hoisted(() => ({ squadCreditsDeps: { marker: "squad-credits" }, currentEconomy: vi.fn() }));
vi.mock("@/app-shell/composition/economy.server", () => composition);
vi.mock("@/app-shell/economy/squad-credits.actions", () => ({
  awardSquadBonusAction: async () => ({ ok: true }),
  redeemSquadPrizeAction: async () => ({ ok: true }),
  createSquadPrizeAction: async () => ({ ok: true }),
  updateSquadPrizeAction: async () => ({ ok: true }),
  setSquadPrizeActiveAction: async () => ({ ok: true }),
}));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { getSquadCreditsOverview: vi.fn() };
vi.mock("@/features/economy/server", () => server);

const { SquadCreditsAdminView, DEFAULT_ECONOMY } = await import("@/features/economy");
const actions = await import("@/app-shell/economy/squad-credits.actions");
const { default: AdminSquadCreditsPage } = await import("./page");

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

const OVERVIEW = { squads: [], prizes: [], redemptions: [] };

describe("admin squad credits page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    server.getSquadCreditsOverview.mockResolvedValue({ ok: true, value: OVERVIEW });
    composition.currentEconomy.mockResolvedValue({ ...DEFAULT_ECONOMY, squadCreditsEnabled: false });
  });

  it("checks the admin role before reading anything", async () => {
    guards.requireRole.mockRejectedValue(new Error("not-found"));

    await expect(AdminSquadCreditsPage()).rejects.toThrow("not-found");
    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(server.getSquadCreditsOverview).not.toHaveBeenCalled();
  });

  it("opens the overview with the edition's switch and the actions", async () => {
    const view = findElement(await AdminSquadCreditsPage(), SquadCreditsAdminView);

    expect(server.getSquadCreditsOverview).toHaveBeenCalledWith({ marker: "squad-credits" }, { uid: "a1", role: "admin" });
    expect(view?.props).toEqual({
      overview: OVERVIEW,
      squadCreditsEnabled: false,
      awardBonus: actions.awardSquadBonusAction,
      redeem: actions.redeemSquadPrizeAction,
      createPrize: actions.createSquadPrizeAction,
      updatePrize: actions.updateSquadPrizeAction,
      setPrizeActive: actions.setSquadPrizeActiveAction,
      uploadImage: media.uploadImageAction,
    });
  });

  it("surfaces a failed read through the error boundary", async () => {
    server.getSquadCreditsOverview.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AdminSquadCreditsPage()).rejects.toThrow("Could not read the squad credits");
  });
});
