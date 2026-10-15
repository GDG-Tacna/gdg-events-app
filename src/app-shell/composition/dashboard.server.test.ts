import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./attendee.server", () => ({ attendeeDeps: { attendees: { marker: "attendees" } } }));
vi.mock("./ranks.server", () => ({ rankDeps: {} }));
vi.mock("@/features/attendee/server", () => ({ getEditionLadder: vi.fn() }));
const economy = { currentEconomy: vi.fn(), rewardLedger: { balanceOf: vi.fn() } };
vi.mock("./economy.server", () => economy);
const catalogs = vi.hoisted(() => ({ list: vi.fn(), getGalaxyMap: vi.fn() }));
vi.mock("./missions.server", () => ({ missionSource: { list: catalogs.list } }));
vi.mock("./quadrants.server", () => ({ galaxyDeps: { marker: "galaxy" } }));
vi.mock("@/features/quadrants/server", () => ({ getGalaxyMap: catalogs.getGalaxyMap }));
vi.mock("@/features/missions/server", () => ({ DEFAULT_MISSIONS: [{ id: "bundled", quadrantId: "cloud", xp: 40, active: true }] }));

const { dashboardDeps, openMissionsSummary } = await import("./dashboard.server");

const GALAXY = { venue: null, quadrants: [{ id: "cloud", name: "Google Cloud" }, { id: "firebase", name: "Firebase" }, { id: "ai", name: "AI" }] };

describe("dashboard composition", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads the person's wallet and whether the edition shows credits", async () => {
    economy.currentEconomy.mockResolvedValue({ creditsEnabled: true });
    economy.rewardLedger.balanceOf.mockResolvedValue({ ok: true, value: 520 });

    expect(await dashboardDeps.wallet("u1")).toEqual({ creditsEnabled: true, balance: 520 });
    expect(economy.rewardLedger.balanceOf).toHaveBeenCalledWith("u1");
  });

  it("hides only the total when the wallet cannot be read", async () => {
    economy.currentEconomy.mockResolvedValue({ creditsEnabled: false });
    economy.rewardLedger.balanceOf.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    expect(await dashboardDeps.wallet("u1")).toEqual({ creditsEnabled: false, balance: null });
  });

  it("sums the XP of the open missions and names their quadrants in the plan's order", async () => {
    catalogs.list.mockResolvedValue({
      ok: true,
      value: [
        { id: "a", quadrantId: "ai", xp: 50, active: true },
        { id: "b", quadrantId: "cloud", xp: 30, active: true },
        { id: "c", quadrantId: "firebase", xp: 999, active: false },
        { id: "d", quadrantId: "cloud", xp: 20, active: true },
      ],
    });
    catalogs.getGalaxyMap.mockResolvedValue({ ok: true, value: GALAXY });

    expect(await openMissionsSummary()).toEqual({ xp: 100, quadrants: ["Google Cloud", "AI"] });
    expect(catalogs.getGalaxyMap).toHaveBeenCalledWith({ marker: "galaxy" });
  });

  it("uses the bundled missions while the edition has none, and gives up (null) when a catalog cannot be read", async () => {
    catalogs.list.mockResolvedValue({ ok: true, value: [] });
    catalogs.getGalaxyMap.mockResolvedValue({ ok: true, value: GALAXY });
    expect(await openMissionsSummary()).toEqual({ xp: 40, quadrants: ["Google Cloud"] });

    catalogs.list.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(await openMissionsSummary()).toBeNull();
    catalogs.list.mockResolvedValue({ ok: true, value: [] });
    catalogs.getGalaxyMap.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(await openMissionsSummary()).toBeNull();
  });
});
