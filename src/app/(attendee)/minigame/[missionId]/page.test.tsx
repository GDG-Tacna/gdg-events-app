import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/minigames.server", () => ({ minigameViewDeps: { marker: "minigames" } }));
vi.mock("@/app-shell/minigames/play.actions", () => ({ startMinigameAction: async () => ({ ok: true }), finishMinigameAction: async () => ({ ok: true }) }));

const guards = { requireAttendee: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}
class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const server = { getMinigameOffer: vi.fn() };
vi.mock("@/features/minigames/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { missions: true, minigames: true, achievements: true } }));
vi.mock("@/shared/config/features", () => features);

const { MinigamePlayer } = await import("@/features/minigames");
const actions = await import("@/app-shell/minigames/play.actions");
const { default: MinigamePage } = await import("./page");

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

const OFFER = { gameId: "circuits", difficulty: "normal", state: "available", xpBonus: 40 };
const open = () => MinigamePage({ params: Promise.resolve({ missionId: "ai-quiz" }) });
const target = async () => {
  try {
    await open();
  } catch (error) {
    if (error instanceof Redirected) return error.to;
    if (error instanceof NotFound) return "not-found";
    throw error;
  }
  return null;
};

describe("MinigamePage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(features.FEATURES, { missions: true, minigames: true, achievements: true });
    guards.requireAttendee.mockResolvedValue({ uid: "u1", role: "attendee", displayName: null, photoUrl: null });
    server.getMinigameOffer.mockResolvedValue({ ok: true, value: OFFER });
  });

  it("does not exist with missions or mini-games off", async () => {
    features.FEATURES.minigames = false;
    expect(await target()).toBe("not-found");
    features.FEATURES.minigames = true;
    features.FEATURES.missions = false;
    expect(await target()).toBe("not-found");
    expect(guards.requireAttendee).not.toHaveBeenCalled();
  });

  it("opens the game of the attendee's mission with the actions and the way back", async () => {
    const player = findElement(await open(), MinigamePlayer);

    expect(server.getMinigameOffer).toHaveBeenCalledWith({ marker: "minigames" }, "u1", "ai-quiz");
    expect(player?.props).toEqual({
      missionId: "ai-quiz",
      offer: OFFER,
      start: actions.startMinigameAction,
      finish: actions.finishMinigameAction,
      backHref: "/missions/ai-quiz",
      achievementsHref: "/achievements",
    });
  });

  it("sends the attendee back to the mission when there is nothing to play", async () => {
    server.getMinigameOffer.mockResolvedValue({ ok: true, value: null });
    expect(await target()).toBe("/missions/ai-quiz");
    server.getMinigameOffer.mockResolvedValue({ ok: true, value: { ...OFFER, state: "won" } });
    expect(await target()).toBe("/missions/ai-quiz");
    server.getMinigameOffer.mockResolvedValue({ ok: true, value: { ...OFFER, state: "lost" } });
    expect(await target()).toBe("/missions/ai-quiz");
  });

  it("reopens a running attempt", async () => {
    server.getMinigameOffer.mockResolvedValue({ ok: true, value: { ...OFFER, state: "in-play" } });

    expect(findElement(await open(), MinigamePlayer)?.props.offer).toMatchObject({ state: "in-play" });
  });

  it("serves attendees only, and lets a failed read reach the error boundary", async () => {
    guards.requireAttendee.mockRejectedValue(new Redirected("/login"));
    expect(await target()).toBe("/login");
    expect(server.getMinigameOffer).not.toHaveBeenCalled();

    guards.requireAttendee.mockResolvedValue({ uid: "u1", role: "attendee", displayName: null, photoUrl: null });
    server.getMinigameOffer.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    await expect(open()).rejects.toThrow("Could not read the mini-game");
  });
});
