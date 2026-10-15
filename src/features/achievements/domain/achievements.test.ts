import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { offeredBadges, syncAchievements, type AchievementDeps } from "./achievements";
import type { Badge, PlayerProgress } from "./badge";

const NOW = new Date("2026-10-24T16:00:00Z");
const EARLIER = new Date("2026-10-24T10:00:00Z");

const badge = (id: string, rule: Badge["rule"], order: number, active = true): Badge => ({ id, name: id.toUpperCase(), description: "Algo que hacer.", tone: "cyan", rule, order, active, image: null });
const FIRST = badge("first", { type: "missions-completed", count: 1 }, 0);
const FIVE = badge("five", { type: "missions-completed", count: 5 }, 1);
const TALKS = badge("talks", { type: "talks-attended", count: 2 }, 2);
const OFF = badge("off", { type: "missions-completed", count: 1 }, 3, false);

const PLAYER: PlayerProgress = {
  completedMissionIds: new Set(["m1", "m2"]),
  missionsByQuadrant: new Map(),
  talks: 2,
  stands: 0,
  level: 1,
  credits: 0,
  contacts: 0,
};

interface Setup {
  own?: Result<readonly Badge[], { code: string }>;
  awards?: Result<ReadonlyMap<string, Date>, { code: string }>;
  progress?: Result<PlayerProgress, { code: string }>;
  award?: (badgeId: string) => Result<{ awarded: boolean }, { code: string }>;
}

function setup({ own = ok([TALKS, FIVE, FIRST, OFF]), awards = ok(new Map()), progress = ok(PLAYER), award = () => ok({ awarded: true }) }: Setup = {}) {
  const deps: AchievementDeps = {
    badges: { list: vi.fn(async () => own) },
    defaults: [badge("default", { type: "level-reached", level: 2 }, 0)],
    awards: { awardsOf: vi.fn(async () => awards), award: vi.fn(async ({ badgeId }) => award(badgeId)) },
    progress: { progress: vi.fn(async () => progress) },
    now: () => NOW,
  };
  return deps;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("offeredBadges", () => {
  it("offers the edition's active badges in order", async () => {
    expect(await offeredBadges(setup())).toEqual(ok([FIRST, FIVE, TALKS]));
  });

  it("offers the bundled badges while the edition has none, and reports a failed read", async () => {
    expect(await offeredBadges(setup({ own: ok([]) }))).toMatchObject({ ok: true, value: [{ id: "default" }] });
    expect(await offeredBadges(setup({ own: err({ code: "unknown" }) }))).toEqual(err({ code: "unknown" }));
  });
});

describe("syncAchievements", () => {
  it("awards what the attendee now meets, once, and answers with every badge's standing", async () => {
    const deps = setup();

    const result = await syncAchievements(deps, "u1");

    expect(result).toEqual(
      ok({
        badges: [
          { badge: FIRST, earnedAt: NOW, current: 1, target: 1 },
          { badge: FIVE, earnedAt: null, current: 2, target: 5 },
          { badge: TALKS, earnedAt: NOW, current: 2, target: 2 },
        ],
        unlocked: [FIRST, TALKS],
      }),
    );
    expect(deps.awards.award).toHaveBeenCalledTimes(2);
    expect(deps.awards.award).toHaveBeenCalledWith({ uid: "u1", badgeId: "first", at: NOW });
    expect(deps.progress.progress).toHaveBeenCalledWith("u1");
    expect(deps.awards.awardsOf).toHaveBeenCalledWith("u1");
  });

  it("keeps earlier awards with their date and does not award them again", async () => {
    const deps = setup({ awards: ok(new Map([["first", EARLIER]])) });

    const result = await syncAchievements(deps, "u1");

    expect(result).toMatchObject({ ok: true, value: { unlocked: [TALKS] } });
    expect(result.ok && result.value.badges[0]).toEqual({ badge: FIRST, earnedAt: EARLIER, current: 1, target: 1 });
    expect(deps.awards.award).toHaveBeenCalledTimes(1);
  });

  it("keeps a badge earned before, even when the rule is now harder", async () => {
    const harder = { ...FIRST, rule: { type: "missions-completed" as const, count: 9 } };
    const deps = setup({ own: ok([harder]), awards: ok(new Map([["first", EARLIER]])) });

    expect(await syncAchievements(deps, "u1")).toEqual(ok({ badges: [{ badge: harder, earnedAt: EARLIER, current: 2, target: 9 }], unlocked: [] }));
  });

  it("counts an award another evaluation made meanwhile as earned, but not as new", async () => {
    const deps = setup({ award: () => ok({ awarded: false }) });

    const result = await syncAchievements(deps, "u1");

    expect(result).toMatchObject({ ok: true, value: { unlocked: [] } });
    expect(result.ok && result.value.badges.map((standing) => standing.earnedAt)).toEqual([NOW, null, NOW]);
  });

  it("leaves a badge to earn when its award fails, and still awards the others", async () => {
    const deps = setup({ award: (badgeId) => (badgeId === "first" ? err({ code: "unknown" }) : ok({ awarded: true })) });

    const result = await syncAchievements(deps, "u1");

    expect(result).toMatchObject({ ok: true, value: { unlocked: [TALKS] } });
    expect(result.ok && result.value.badges[0].earnedAt).toBeNull();
  });

  it("caps the progress shown at the target", async () => {
    const deps = setup({ own: ok([FIRST]), awards: ok(new Map([["first", EARLIER]])) });

    expect(await syncAchievements(deps, "u1")).toMatchObject({ ok: true, value: { badges: [{ current: 1, target: 1 }] } });
  });

  it.each([
    ["badges", { own: err({ code: "unknown" }) }],
    ["awards", { awards: err({ code: "unknown" }) }],
    ["progress", { progress: err({ code: "unknown" }) }],
  ] as const)("reports a failed read of the %s and awards nothing", async (_part, overrides) => {
    const deps = setup(overrides as Setup);

    expect(await syncAchievements(deps, "u1")).toEqual(err({ code: "unknown" }));
    expect(deps.awards.award).not.toHaveBeenCalled();
  });
});
