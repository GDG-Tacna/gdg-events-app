import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/leaderboard.server", () => ({ leaderboardDeps: { marker: "leaderboard" }, stageDeps: { marker: "stage" } }));
vi.mock("@/app-shell/leaderboard/stage.actions", () => ({ updateStageAction: async () => ({ ok: true }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
  useRouter: () => ({ refresh: () => undefined }),
}));
const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const server = { getStage: vi.fn(), getFleetBoard: vi.fn() };
vi.mock("@/features/leaderboard/server", () => server);
const features = vi.hoisted(() => ({ FEATURES: { leaderboard: true } }));
vi.mock("@/shared/config/features", () => features);

const { StageControlView, DEFAULT_STAGE } = await import("@/features/leaderboard");
const { updateStageAction } = await import("@/app-shell/leaderboard/stage.actions");
const { default: AdminStagePage } = await import("./page");

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

const BOARD = { cadets: [], squads: [] };

describe("admin stage page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.leaderboard = true;
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    server.getStage.mockResolvedValue({ ok: true, value: DEFAULT_STAGE });
    server.getFleetBoard.mockResolvedValue({ ok: true, value: BOARD });
  });

  it("checks the admin role first, and does not exist with the ranking off", async () => {
    guards.requireRole.mockRejectedValueOnce(new Error("not-found"));
    await expect(AdminStagePage()).rejects.toThrow("not-found");
    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);

    features.FEATURES.leaderboard = false;
    await expect(AdminStagePage()).rejects.toThrow("not-found");
    expect(server.getStage).not.toHaveBeenCalled();
  });

  it("opens the controls with the stage, the live ranking and the command action", async () => {
    const view = findElement(await AdminStagePage(), StageControlView);

    expect(server.getStage).toHaveBeenCalledWith({ marker: "stage" });
    expect(server.getFleetBoard).toHaveBeenCalledWith({ marker: "leaderboard" });
    expect(view?.props).toEqual({ stage: DEFAULT_STAGE, live: BOARD, run: updateStageAction, screenHref: "/escenario" });
  });

  it("works without the live preview, and surfaces a failed stage read", async () => {
    server.getFleetBoard.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(findElement(await AdminStagePage(), StageControlView)?.props.live).toBeNull();

    server.getStage.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    await expect(AdminStagePage()).rejects.toThrow("Could not read the stage");
  });
});
