import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/raffle.server", () => ({ raffleDeps: { marker: "raffle" } }));
const media = vi.hoisted(() => ({ uploadImageAction: async () => ({ ok: false as const, code: "unknown" as const }) }));
vi.mock("@/app-shell/media/upload.action", () => media);
const raffleActions = vi.hoisted(() => ({
  saveRaffleSettingsAction: async () => ({ ok: true }),
  createRafflePrizeAction: async () => ({ ok: true }),
  updateRafflePrizeAction: async () => ({ ok: true }),
  drawRafflePrizeAction: async () => ({ ok: true }),
  voidRaffleDrawAction: async () => ({ ok: true }),
}));
vi.mock("@/app-shell/raffle/raffle.actions", () => raffleActions);
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
  useRouter: () => ({ refresh: () => undefined }),
}));
const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const server = { getRaffleOverview: vi.fn() };
vi.mock("@/features/raffle/server", () => server);
const features = vi.hoisted(() => ({ FEATURES: { raffle: true } }));
vi.mock("@/shared/config/features", () => features);

const { RaffleAdminView } = await import("@/features/raffle");
const { default: AdminRafflePage } = await import("./page");

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

const OVERVIEW = { settings: { minCredits: 1 }, isDefault: true, prizes: [], draws: [], eligible: 0, tickets: 0 };

describe("admin raffle page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.raffle = true;
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    server.getRaffleOverview.mockResolvedValue({ ok: true, value: OVERVIEW });
  });

  it("checks the admin role first, and does not exist with the raffle off", async () => {
    guards.requireRole.mockRejectedValueOnce(new Error("not-found"));
    await expect(AdminRafflePage()).rejects.toThrow("not-found");
    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);

    features.FEATURES.raffle = false;
    await expect(AdminRafflePage()).rejects.toThrow("not-found");
    expect(server.getRaffleOverview).not.toHaveBeenCalled();
  });

  it("opens the raffle with its actions and a way to the stage", async () => {
    const view = findElement(await AdminRafflePage(), RaffleAdminView);

    expect(server.getRaffleOverview).toHaveBeenCalledWith({ marker: "raffle" }, { uid: "a1", role: "admin" });
    expect(view?.props).toEqual({
      overview: OVERVIEW,
      actions: {
        saveSettings: raffleActions.saveRaffleSettingsAction,
        createPrize: raffleActions.createRafflePrizeAction,
        updatePrize: raffleActions.updateRafflePrizeAction,
        draw: raffleActions.drawRafflePrizeAction,
        voidDraw: raffleActions.voidRaffleDrawAction,
        upload: media.uploadImageAction,
      },
      stageHref: "/admin/escenario",
    });
  });

  it("surfaces a failed read through the error boundary", async () => {
    server.getRaffleOverview.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AdminRafflePage()).rejects.toThrow("Could not read the raffle");
  });
});
