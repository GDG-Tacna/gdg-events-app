import { describe, expect, it } from "vitest";
import { createRankLadder, type Attendee } from "@/features/attendee";
import { buildOverview, decideSquadCallout } from "./overview";

const attendee = (overrides: Partial<Attendee> = {}): Attendee => ({
  uid: "u1",
  alias: "Nova_7",
  role: "attendee",
  squad: null,
  xp: 0,
  credits: 0,
  createdAt: new Date("2026-10-04T12:00:00Z"),
  ...overrides,
});

describe("buildOverview", () => {
  it("shows a brand new attendee as a recruit at level 1 with an empty bar", () => {
    expect(buildOverview(attendee())).toEqual({
      alias: "Nova_7",
      xp: 0,
      credits: 0,
      walletBalance: null,
      creditsEnabled: true,
      rank: { id: "recruit", level: 1, name: null, iconUrl: null },
      nextRank: { id: "pilot", level: 2, minXp: 100 },
      progressPercent: 0,
      squadId: null,
    });
  });

  it("derives the rank and the bar from XP", () => {
    const overview = buildOverview(attendee({ xp: 750, credits: 12 }));

    expect(overview).toMatchObject({
      xp: 750,
      credits: 12,
      rank: { id: "commander", level: 3 },
      nextRank: { id: "stellar-legend", level: 4, minXp: 2000 },
      progressPercent: 16, // 250 of the 1500 XP between Comandante and Leyenda Estelar
    });
  });

  it("keeps a name the admin gave the rank, and null otherwise", () => {
    const ladder = createRankLadder([{ id: "cadet", name: "Cadete", minXp: 0 }, { id: "pilot", minXp: 10 }]);

    expect(buildOverview(attendee({ xp: 0 }), ladder).rank).toEqual({ id: "cadet", level: 1, name: "Cadete", iconUrl: null });
    expect(buildOverview(attendee({ xp: 15 }), ladder).rank).toEqual({ id: "pilot", level: 2, name: null, iconUrl: null });
  });

  it("carries the wallet and whether credits are shown", () => {
    expect(buildOverview(attendee({ credits: 40 }), undefined, { creditsEnabled: false, balance: 300 })).toMatchObject({ credits: 40, walletBalance: 300, creditsEnabled: false });
  });

  it("has no next rank at the top", () => {
    expect(buildOverview(attendee({ xp: 2500 }))).toMatchObject({ nextRank: null, progressPercent: 100 });
  });

  it("carries the squad id through, including one that was retired from the catalog", () => {
    expect(buildOverview(attendee({ squad: "cloud" })).squadId).toBe("cloud");
  });

  it("does not leak fields the card does not need", () => {
    const keys = Object.keys(buildOverview(attendee())).sort();

    expect(keys).toEqual(["alias", "credits", "creditsEnabled", "nextRank", "progressPercent", "rank", "squadId", "walletBalance", "xp"]);
  });
});

describe("decideSquadCallout", () => {
  it("shows the squad badge when the attendee has one", () => {
    expect(decideSquadCallout({ featureEnabled: true, squadId: "gemini", availableSquads: 3 })).toBe("badge");
  });

  it("shows nothing about squads when the edition has them switched off, even to a member", () => {
    expect(decideSquadCallout({ featureEnabled: false, squadId: "gemini", availableSquads: 3 })).toBe("none");
  });

  it("keeps showing the badge of a member, even if the squad was retired", () => {
    expect(decideSquadCallout({ featureEnabled: true, squadId: "gemini", availableSquads: 0 })).toBe("badge");
    expect(decideSquadCallout({ featureEnabled: true, squadId: "cloud", availableSquads: 3 })).toBe("badge");
  });

  it("invites an attendee without a squad to discover it", () => {
    expect(decideSquadCallout({ featureEnabled: true, squadId: null, availableSquads: 3 })).toBe("discover");
  });

  it("shows nothing when the feature is off or there is nothing to assign", () => {
    expect(decideSquadCallout({ featureEnabled: false, squadId: null, availableSquads: 3 })).toBe("none");
    expect(decideSquadCallout({ featureEnabled: true, squadId: null, availableSquads: 0 })).toBe("none");
  });
});
