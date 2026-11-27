import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const composition = vi.hoisted(() => ({ getAttendeeAchievementsOverview: vi.fn() }));
vi.mock("@/app-shell/composition/achievements.server", () => composition);

const eventStatus = vi.hoisted(() => ({
  getPublicEventState: vi.fn(async () => ({
    id: "devfest-2026",
    name: "DevFest Tacna 2026" as string | null,
    venue: null as string | null,
    endsAt: null as Date | null,
    finished: false,
  })),
  isPublicEventFinished: vi.fn(async () => false),
}));
vi.mock("@/app-shell/event-status.server", () => eventStatus);

const guards = { requireAttendee: vi.fn(), requireSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));

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
    eventStatus.getPublicEventState.mockResolvedValue({
      id: "devfest-2026",
      name: "DevFest Tacna 2026",
      venue: null,
      endsAt: null,
      finished: false,
    });
    guards.requireAttendee.mockResolvedValue({ uid: "u1", role: "attendee", displayName: null, photoUrl: null });
    guards.requireSession.mockResolvedValue({ uid: "u1", role: null, displayName: null, photoUrl: null });
    composition.getAttendeeAchievementsOverview.mockResolvedValue({
      ok: true,
      value: { globalBadges: [{ marker: "global" }], editions: [{ eventId: "devfest-2026", eventName: "DevFest Tacna 2026", isLive: true, badges: [] }] },
    });
  });

  it("does not exist with achievements off", async () => {
    features.FEATURES.achievements = false;

    await expect(AchievementsPage()).rejects.toThrow("not-found");
    expect(guards.requireAttendee).not.toHaveBeenCalled();
  });

  it("serves attendees while live and loads global + edition achievements overview", async () => {
    guards.requireAttendee.mockRejectedValue(new Error("redirect:/login"));
    await expect(AchievementsPage()).rejects.toThrow("redirect:/login");
    expect(composition.getAttendeeAchievementsOverview).not.toHaveBeenCalled();

    guards.requireAttendee.mockResolvedValue({ uid: "u1", role: "attendee", displayName: null, photoUrl: null });
    const view = findElement(await AchievementsPage(), AchievementsView);
    expect(composition.getAttendeeAchievementsOverview).toHaveBeenCalledWith("u1", {
      activeEventId: "devfest-2026",
      activeEventName: "DevFest Tacna 2026",
      activeEventFinished: false,
      includeLiveActive: true,
    });
    expect(view?.props).toEqual({
      globalBadges: [{ marker: "global" }],
      editions: [{ eventId: "devfest-2026", eventName: "DevFest Tacna 2026", isLive: true, badges: [] }],
    });
  });

  it("allows any signed-in user once the active edition has finished", async () => {
    eventStatus.getPublicEventState.mockResolvedValue({
      id: "devfest-2026",
      name: "DevFest Tacna 2026",
      venue: null,
      endsAt: new Date("2026-11-22T00:00:00Z"),
      finished: true,
    });

    await AchievementsPage();
    expect(guards.requireSession).toHaveBeenCalledTimes(1);
    expect(guards.requireAttendee).not.toHaveBeenCalled();
    expect(composition.getAttendeeAchievementsOverview).toHaveBeenCalledWith("u1", {
      activeEventId: "devfest-2026",
      activeEventName: "DevFest Tacna 2026",
      activeEventFinished: true,
      includeLiveActive: false,
    });
  });

  it("lets a failed read reach the error boundary", async () => {
    composition.getAttendeeAchievementsOverview.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(AchievementsPage()).rejects.toThrow("Could not read the achievements");
  });
});
