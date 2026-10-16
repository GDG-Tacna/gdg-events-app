import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/missions.server", () => ({ missionDeps: { marker: "missions" } }));
vi.mock("@/app-shell/composition/odyssey.server", () => ({ storyTitleSource: { marker: "title" } }));
vi.mock("@/features/odyssey/server", () => ({ getStoryTitle: async (source: { marker: string }) => (source.marker === "title" ? "Odisea de Código" : null) }));
vi.mock("@/app-shell/composition/quadrants.server", () => ({ galaxyDeps: { marker: "galaxy" } }));
const minigames = vi.hoisted(() => ({ enabledMinigames: vi.fn() }));
vi.mock("@/app-shell/composition/minigames.server", () => minigames);

const guards = { requireAttendee: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const features = vi.hoisted(() => ({ FEATURES: { missions: true, odyssey: true, minigames: true } }));
vi.mock("@/shared/config/features", () => features);

const missionsServer = { getMissionBoard: vi.fn() };
vi.mock("@/features/missions/server", () => missionsServer);
const quadrantsServer = { getGalaxyMap: vi.fn() };
vi.mock("@/features/quadrants/server", () => quadrantsServer);

const { MissionBoardView } = await import("@/features/missions");
const { default: MissionsPage } = await import("./page");

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

const BOARD = { missions: [], completed: 0, total: 0, xpEarned: 0 };
const GALAXY = {
  venue: { width: 100, height: 100, areas: [] },
  quadrants: [{ id: "ai", name: "AI", tagline: "Lema", planet: "ai", order: 0, active: true, stands: [] }],
};

describe("missions page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.missions = true;
    guards.requireAttendee.mockResolvedValue({ uid: "u1", role: "attendee", displayName: null, photoUrl: null });
    missionsServer.getMissionBoard.mockResolvedValue({ ok: true, value: BOARD });
    quadrantsServer.getGalaxyMap.mockResolvedValue({ ok: true, value: GALAXY });
  });

  it("checks the attendee before reading anything, and lets the guard's redirect through", async () => {
    guards.requireAttendee.mockRejectedValue(new NotFound("staff"));

    await expect(MissionsPage()).rejects.toBeInstanceOf(NotFound);
    expect(missionsServer.getMissionBoard).not.toHaveBeenCalled();
  });

  it("is not found when missions are switched off, without reading the session", async () => {
    features.FEATURES.missions = false;

    await expect(MissionsPage()).rejects.toBeInstanceOf(NotFound);
    expect(guards.requireAttendee).not.toHaveBeenCalled();
  });

  it("shows the signed-in attendee's board with the quadrants' names and planets", async () => {
    const view = findElement(await MissionsPage(), MissionBoardView);

    expect(missionsServer.getMissionBoard).toHaveBeenCalledWith({ marker: "missions" }, "u1");
    expect(view?.props).toMatchObject({ board: BOARD, quadrants: [{ id: "ai", name: "AI", planet: "ai" }] });
    expect((view?.props.missionHref as (id: string) => string)("ai-quiz")).toBe("/missions/ai-quiz");
    expect(view?.props.odysseyHref).toBe("/odyssey");
    expect(view?.props.odysseyTitle).toBe("Odisea de Código");
  });

  it("leaves out the story link and its title with the story switched off", async () => {
    features.FEATURES.odyssey = false;

    const view = findElement(await MissionsPage(), MissionBoardView);
    expect(view?.props.odysseyHref).toBeUndefined();
    expect(view?.props.odysseyTitle).toBeNull();
    features.FEATURES.odyssey = true;
  });

  it("still lists the missions when the quadrants cannot be read", async () => {
    quadrantsServer.getGalaxyMap.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    expect(findElement(await MissionsPage(), MissionBoardView)?.props.quadrants).toEqual([]);
  });

  it("surfaces a failed read of the missions through the error boundary", async () => {
    missionsServer.getMissionBoard.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(MissionsPage()).rejects.toThrow("Could not read the missions");
  });

  it("tags the missions whose mini-game the edition has on, and reads no settings with mini-games off", async () => {
    const games = new Set(["circuits"]);
    minigames.enabledMinigames.mockResolvedValue(games);
    expect(findElement(await MissionsPage(), MissionBoardView)?.props.enabledGames).toBe(games);

    features.FEATURES.minigames = false;
    minigames.enabledMinigames.mockClear();
    expect(findElement(await MissionsPage(), MissionBoardView)?.props.enabledGames).toBeUndefined();
    expect(minigames.enabledMinigames).not.toHaveBeenCalled();
    features.FEATURES.minigames = true;
  });
});
