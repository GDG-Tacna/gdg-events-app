import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/missions.server", () => ({ missionDeps: { marker: "missions" } }));
vi.mock("@/app-shell/missions/answer.action", () => ({ submitMissionAnswerAction: async () => ({ ok: true }) }));
const minigames = vi.hoisted(() => ({ minigameViewDeps: { marker: "minigames" }, enabledMinigames: vi.fn() }));
vi.mock("@/app-shell/composition/minigames.server", () => minigames);
vi.mock("@/app-shell/composition/quadrants.server", () => ({ galaxyDeps: { marker: "galaxy" } }));
const quadrantsServer = { getGalaxyMap: vi.fn() };
vi.mock("@/features/quadrants/server", () => quadrantsServer);
const minigamesServer = { getMinigameOffer: vi.fn() };
vi.mock("@/features/minigames/server", () => minigamesServer);

const guards = { requireAttendee: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
  useRouter: () => ({ refresh: () => undefined }),
}));

const features = vi.hoisted(() => ({ FEATURES: { missions: true, achievements: true, minigames: true, checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const server = { getMissionBoard: vi.fn() };
vi.mock("@/features/missions/server", () => server);

const { MissionDetailView } = await import("@/features/missions");
const { MinigameOfferCard } = await import("@/features/minigames");
const { submitMissionAnswerAction } = await import("@/app-shell/missions/answer.action");
const { default: MissionPage } = await import("./page");

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

const MISSION = { id: "ai-quiz", title: "Desafío AI", type: "quiz", status: "open", quadrantId: "ai", minigame: "circuits" };
const GALAXY = { venue: null, quadrants: [{ id: "ai", name: "AI", planet: "ai", extra: true }] };
const OFFER = { gameId: "circuits", difficulty: "normal", state: "available", xpBonus: 40 };
const open = (missionId: string) => MissionPage({ params: Promise.resolve({ missionId }) } as unknown as Parameters<typeof MissionPage>[0]);

describe("mission page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.missions = true;
    features.FEATURES.achievements = true;
    features.FEATURES.minigames = true;
    features.FEATURES.checkins = true;
    minigamesServer.getMinigameOffer.mockResolvedValue({ ok: true, value: OFFER });
    minigames.enabledMinigames.mockResolvedValue(new Set(["circuits"]));
    quadrantsServer.getGalaxyMap.mockResolvedValue({ ok: true, value: GALAXY });
    guards.requireAttendee.mockResolvedValue({ uid: "u1", role: "attendee", displayName: null, photoUrl: null });
    server.getMissionBoard.mockResolvedValue({ ok: true, value: { missions: [MISSION], completed: 0, total: 1, xpEarned: 0 } });
  });

  it("checks the attendee before reading anything", async () => {
    guards.requireAttendee.mockRejectedValue(new NotFound("staff"));

    await expect(open("ai-quiz")).rejects.toBeInstanceOf(NotFound);
    expect(server.getMissionBoard).not.toHaveBeenCalled();
  });

  it("is not found when missions are switched off", async () => {
    features.FEATURES.missions = false;

    await expect(open("ai-quiz")).rejects.toBeInstanceOf(NotFound);
    expect(guards.requireAttendee).not.toHaveBeenCalled();
  });

  it("shows the attendee's mission with the answer action and the way back and to the scanner", async () => {
    const view = findElement(await open("ai-quiz"), MissionDetailView);

    expect(server.getMissionBoard).toHaveBeenCalledWith({ marker: "missions" }, "u1");
    expect(view?.props).toEqual({
      mission: MISSION,
      answer: submitMissionAnswerAction,
      backHref: "/missions",
      scanHref: "/scan",
      passHref: "/pass",
      quadrant: { name: "AI", planet: "ai" },
      minigame: true,
      achievementsHref: "/achievements",
      bonusSlot: undefined,
    });

    // With achievements off, nothing links to a tab that does not exist.
    features.FEATURES.achievements = false;
    expect(findElement(await open("ai-quiz"), MissionDetailView)?.props.achievementsHref).toBeUndefined();
  });

  it("is not found for an unknown or inactive mission", async () => {
    await expect(open("nope")).rejects.toBeInstanceOf(NotFound);
  });

  it("surfaces a failed read through the error boundary", async () => {
    server.getMissionBoard.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(open("ai-quiz")).rejects.toThrow("Could not read the missions");
  });

  it("offers the mini-game bonus under a completed mission, linking to its game", async () => {
    server.getMissionBoard.mockResolvedValue({ ok: true, value: { missions: [{ ...MISSION, status: "completed" }], completed: 1, total: 1, xpEarned: 40 } });

    const slot = findElement(await open("ai-quiz"), MissionDetailView)?.props.bonusSlot as { type: unknown; props: Record<string, unknown> };

    expect(minigamesServer.getMinigameOffer).toHaveBeenCalledWith({ marker: "minigames" }, "u1", "ai-quiz");
    expect(slot.type).toBe(MinigameOfferCard);
    expect(slot.props).toEqual({ offer: OFFER, playHref: "/minigame/ai-quiz" });
  });

  it("leaves the bonus out before completing, with mini-games off, without one, or when it cannot be read", async () => {
    expect(findElement(await open("ai-quiz"), MissionDetailView)?.props.bonusSlot).toBeUndefined();
    expect(minigamesServer.getMinigameOffer).not.toHaveBeenCalled();

    server.getMissionBoard.mockResolvedValue({ ok: true, value: { missions: [{ ...MISSION, status: "completed" }], completed: 1, total: 1, xpEarned: 40 } });
    features.FEATURES.minigames = false;
    expect(findElement(await open("ai-quiz"), MissionDetailView)?.props.bonusSlot).toBeUndefined();
    expect(minigamesServer.getMinigameOffer).not.toHaveBeenCalled();

    features.FEATURES.minigames = true;
    minigamesServer.getMinigameOffer.mockResolvedValue({ ok: true, value: null });
    expect(findElement(await open("ai-quiz"), MissionDetailView)?.props.bonusSlot).toBeUndefined();
    minigamesServer.getMinigameOffer.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(findElement(await open("ai-quiz"), MissionDetailView)?.props.bonusSlot).toBeUndefined();
  });

  it("leaves out the quadrant tag without the plan, the mini-game tag when its game is off, and the QR with check-ins off", async () => {
    quadrantsServer.getGalaxyMap.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    minigames.enabledMinigames.mockResolvedValue(new Set(["warp-timing"]));
    features.FEATURES.checkins = false;

    const props = findElement(await open("ai-quiz"), MissionDetailView)?.props;
    expect(props).toMatchObject({ quadrant: null, minigame: false, passHref: undefined });
  });

  it("reads no mini-game settings with mini-games off", async () => {
    features.FEATURES.minigames = false;

    expect(findElement(await open("ai-quiz"), MissionDetailView)?.props.minigame).toBe(false);
    expect(minigames.enabledMinigames).not.toHaveBeenCalled();
  });
});
