import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/leaderboard.server", () => ({ leaderboardDeps: { marker: "leaderboard" }, stageDeps: { marker: "stage" } }));
const catalog = { list: vi.fn() };
vi.mock("@/app-shell/composition/squads.server", () => ({ squadCatalog: catalog }));
vi.mock("@/app-shell/StageScreenBound", () => ({ StageScreenBound: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
}));
const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const server = { getStage: vi.fn(), getFleetBoard: vi.fn(), currentEditionId: async () => "devfest-2026" };
vi.mock("@/features/leaderboard/server", () => server);
const features = vi.hoisted(() => ({ FEATURES: { leaderboard: true, polls: false } }));
vi.mock("@/shared/config/features", () => features);

const { StageScreenBound } = await import("@/app-shell/StageScreenBound");
const { DEFAULT_STAGE } = await import("@/features/leaderboard");
const { default: StagePage } = await import("./page");

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

const SPRITE = { rows: ["x"], palette: { x: "#fff" } };
const BOARD = { cadets: [], squads: [] };

describe("stage page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.leaderboard = true;
    guards.requireRole.mockResolvedValue({ uid: "a1", role: "admin", displayName: null, photoUrl: null });
    server.getStage.mockResolvedValue({ ok: true, value: DEFAULT_STAGE });
    server.getFleetBoard.mockResolvedValue({ ok: true, value: BOARD });
    catalog.list.mockResolvedValue({ ok: true, value: [{ id: "firebase", name: "Escuadrón Firebase", tagline: "t", sprite: SPRITE, active: true }] });
  });

  it("is for admins only, and does not exist with the ranking off", async () => {
    guards.requireRole.mockRejectedValueOnce(new Error("not-found"));
    await expect(StagePage()).rejects.toThrow("not-found");
    expect(guards.requireRole).toHaveBeenCalledWith(["admin"]);

    features.FEATURES.leaderboard = false;
    await expect(StagePage()).rejects.toThrow("not-found");
    expect(server.getStage).not.toHaveBeenCalled();
  });

  it("hands the screen the edition, the squads and their logos, and a first frame", async () => {
    const screen = findElement(await StagePage(), StageScreenBound);

    expect(screen?.props).toEqual({
      eventId: "devfest-2026",
      squads: [{ id: "firebase", name: "Escuadrón Firebase", active: true }],
      sprites: { firebase: { ...SPRITE, logoUrl: null } },
      initialStage: DEFAULT_STAGE,
      initialBoard: BOARD,
      pollsOn: false,
    });
  });

  it("still opens without squads or a first ranking, and surfaces a failed stage read", async () => {
    catalog.list.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    server.getFleetBoard.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(findElement(await StagePage(), StageScreenBound)?.props).toMatchObject({ squads: [], sprites: {}, initialBoard: null });

    server.getStage.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    await expect(StagePage()).rejects.toThrow("Could not read the stage");
  });

  it("lets the screen draw polls only with polls on", async () => {
    features.FEATURES.polls = true;
    expect(findElement(await StagePage(), StageScreenBound)?.props.pollsOn).toBe(true);
    features.FEATURES.polls = false;
    expect(findElement(await StagePage(), StageScreenBound)?.props.pollsOn).toBe(false);
  });
});
