import { describe, expect, it, vi } from "vitest";
import { ok } from "@/shared/lib/result";
import { DEFAULT_GLOBAL_BADGES } from "../data/default-global-badges";
import { syncGlobalAchievements, type GlobalAchievementDeps } from "./global-achievements";

vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const NOW = new Date("2026-11-27T15:00:00Z");
const EARLIER = new Date("2026-11-22T12:00:00Z");

describe("syncGlobalAchievements", () => {
  it("falls back to default global badges, awards newly met ones once and keeps existing awards", async () => {
    const award = vi.fn(async () => ok({ awarded: true }));
    const deps: GlobalAchievementDeps = {
      badges: { list: async () => ok([]) },
      defaults: DEFAULT_GLOBAL_BADGES,
      awards: {
        awardsOf: async () => ok(new Map([["primer-evento", EARLIER]])),
        award,
      },
      progress: {
        progress: async () =>
          ok({
            eventsAttended: 1,
            totalCredits: 50,
            totalBadges: 2,
            certificatesEarned: 1,
            totalContacts: 3,
          }),
      },
      now: () => NOW,
    };

    const result = await syncGlobalAchievements(deps, "u1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // "primer-evento" was already earned earlier; "certificado-oficial" is newly unlocked now.
    expect(result.value.unlocked.map((b) => b.id)).toEqual(["certificado-oficial"]);
    expect(award).toHaveBeenCalledTimes(1);
    expect(award).toHaveBeenCalledWith({ uid: "u1", badgeId: "certificado-oficial", at: NOW });

    const first = result.value.badges.find((s) => s.badge.id === "primer-evento");
    expect(first?.earnedAt).toEqual(EARLIER);
    const recurrent = result.value.badges.find((s) => s.badge.id === "miembro-recurrente");
    expect(recurrent).toMatchObject({ earnedAt: null, current: 1, target: 2 });
  });
});
