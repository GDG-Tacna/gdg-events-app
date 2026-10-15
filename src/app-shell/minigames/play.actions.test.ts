import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/minigames.server", () => ({ minigameDeps: { marker: "minigames" } }));
const achievements = vi.hoisted(() => ({ unlockAchievements: vi.fn() }));
vi.mock("@/app-shell/composition/achievements.server", () => achievements);
const cache = { revalidatePath: vi.fn() };
vi.mock("next/cache", () => cache);

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { startMinigame: vi.fn(), finishMinigame: vi.fn() };
vi.mock("@/features/minigames/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { missions: true, minigames: true } }));
vi.mock("@/shared/config/features", () => features);

const { finishMinigameAction, startMinigameAction } = await import("./play.actions");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "u1", role, displayName: null, photoUrl: null });
const EXPIRES = new Date("2026-10-24T15:02:50Z");
const BADGES = [{ id: "primer-salto", name: "Primer salto", tone: "cyan" }];

beforeEach(() => {
  vi.resetAllMocks();
  features.FEATURES.missions = true;
  features.FEATURES.minigames = true;
  guards.getSession.mockResolvedValue(session("attendee"));
  server.startMinigame.mockResolvedValue({ ok: true, value: { gameId: "circuits", difficulty: "normal", expiresAt: EXPIRES, codeLanguages: ["javascript"] } });
  server.finishMinigame.mockResolvedValue({ ok: true, value: { status: "won", xpBonus: 40 } });
  achievements.unlockAchievements.mockResolvedValue(BADGES);
});

describe.each([
  ["startMinigameAction", () => startMinigameAction({ missionId: "ai-quiz" }), server.startMinigame],
  ["finishMinigameAction", () => finishMinigameAction({ missionId: "ai-quiz", won: true }), server.finishMinigame],
] as const)("%s", (_name, run, useCase) => {
  it("is off with missions or mini-games switched off, and only for attendees", async () => {
    features.FEATURES.minigames = false;
    expect(await run()).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.minigames = true;
    features.FEATURES.missions = false;
    expect(await run()).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.missions = true;
    guards.getSession.mockResolvedValue(null);
    expect(await run()).toEqual({ ok: false, code: "unauthenticated" });
    guards.getSession.mockResolvedValue(session(null));
    expect(await run()).toEqual({ ok: false, code: "not-registered" });
    guards.getSession.mockResolvedValue(session("staff"));
    expect(await run()).toEqual({ ok: false, code: "forbidden" });
    expect(useCase).not.toHaveBeenCalled();
  });

  it("passes a refusal through", async () => {
    useCase.mockResolvedValue({ ok: false, error: { code: "already-played" } });

    expect(await run()).toEqual({ ok: false, code: "already-played" });
  });
});

describe("startMinigameAction", () => {
  it("issues the ticket for the session's attendee, with the expiry as milliseconds", async () => {
    expect(await startMinigameAction({ missionId: "ai-quiz" })).toEqual({ ok: true, gameId: "circuits", difficulty: "normal", expiresAt: EXPIRES.getTime(), codeLanguages: ["javascript"] });
    expect(server.startMinigame).toHaveBeenCalledWith({ marker: "minigames" }, "u1", "ai-quiz");
  });

  it("refuses a malformed mission id before the use case", async () => {
    expect(await startMinigameAction({ missionId: "" })).toEqual({ ok: false, code: "not-available" });
    expect(await startMinigameAction({ missionId: "x".repeat(61) })).toEqual({ ok: false, code: "not-available" });
    expect(server.startMinigame).not.toHaveBeenCalled();
  });
});

describe("finishMinigameAction", () => {
  it("pays a win, refreshes the screens that show XP and returns the badges it unlocked", async () => {
    expect(await finishMinigameAction({ missionId: "ai-quiz", won: true })).toEqual({ ok: true, status: "won", xpBonus: 40, achievements: BADGES });
    expect(server.finishMinigame).toHaveBeenCalledWith({ marker: "minigames" }, "u1", { missionId: "ai-quiz", won: true });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/missions");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(achievements.unlockAchievements).toHaveBeenCalledWith("u1");
  });

  it("answers a loss without refreshing or looking for badges", async () => {
    server.finishMinigame.mockResolvedValue({ ok: true, value: { status: "lost", xpBonus: 0 } });

    expect(await finishMinigameAction({ missionId: "ai-quiz", won: false })).toEqual({ ok: true, status: "lost", xpBonus: 0, achievements: [] });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
    expect(achievements.unlockAchievements).not.toHaveBeenCalled();
  });

  it("refuses malformed input before the use case", async () => {
    expect(await finishMinigameAction({ missionId: "ai-quiz", won: "yes" } as never)).toEqual({ ok: false, code: "no-ticket" });
    expect(server.finishMinigame).not.toHaveBeenCalled();
  });
});
