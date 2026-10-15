import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/achievements.server", () => ({ achievementDeps: { marker: "achievements" } }));

const guards = { requireAttendee: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

const server = { syncAchievements: vi.fn() };
vi.mock("@/features/achievements/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { achievements: true } }));
vi.mock("@/shared/config/features", () => features);

const { AchievementsView } = await import("@/features/achievements");
const { default: AchievementsPage } = await import("./page");

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

describe("AchievementsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.achievements = true;
    guards.requireAttendee.mockResolvedValue({ uid: "u1", role: "attendee", displayName: null, photoUrl: null });
    server.syncAchievements.mockResolvedValue({ ok: true, value: { badges: [{ marker: "standing" }], unlocked: [] } });
  });

  it("does not exist with achievements off", async () => {
    features.FEATURES.achievements = false;

    await expect(AchievementsPage()).rejects.toThrow("not-found");
    expect(guards.requireAttendee).not.toHaveBeenCalled();
  });

  it("serves attendees only, and evaluates their badges as it opens", async () => {
    guards.requireAttendee.mockRejectedValue(new Error("redirect:/login"));
    await expect(AchievementsPage()).rejects.toThrow("redirect:/login");
    expect(server.syncAchievements).not.toHaveBeenCalled();

    guards.requireAttendee.mockResolvedValue({ uid: "u1", role: "attendee", displayName: null, photoUrl: null });
    const view = findElement(await AchievementsPage(), AchievementsView);
    expect(server.syncAchievements).toHaveBeenCalledWith({ marker: "achievements" }, "u1");
    expect(view?.props).toEqual({ badges: [{ marker: "standing" }] });
  });

  it("lets a failed read reach the error boundary", async () => {
    server.syncAchievements.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AchievementsPage()).rejects.toThrow("Could not read the achievements");
  });
});
