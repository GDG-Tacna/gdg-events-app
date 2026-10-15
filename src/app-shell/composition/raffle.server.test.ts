import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/event/server", () => ({ currentEditionOf: async () => "e1" }));
const mocks = vi.hoisted(() => ({ presentRaffle: vi.fn(), entrants: vi.fn(), settings: vi.fn(), drawsOf: vi.fn() }));
vi.mock("./leaderboard.server", () => ({ stageDeps: { marker: "stage" } }));
vi.mock("@/features/admin/server", () => ({ FirestoreAuditLog: class {} }));
vi.mock("@/features/leaderboard/server", () => ({ presentRaffle: mocks.presentRaffle }));
vi.mock("@/features/raffle/server", () => ({
  FirestoreRaffleStore: class {
    entrants = mocks.entrants;
    settings = mocks.settings;
    drawsOf = mocks.drawsOf;
  },
}));

const { raffleCardDeps, raffleDeps } = await import("./raffle.server");

const AT = new Date("2026-10-24T23:50:00Z");
const DRAW = { id: "polera-1", prizeId: "polera", prizeName: "Polera", winnerUid: "u1", winnerAlias: "Nova", winnerSquadId: "firebase", tickets: 4, totalTickets: 90, entrants: 9, at: AT, voided: false };

describe("raffleDeps", () => {
  it("hands each draw to the stage, without the winner's uid", async () => {
    mocks.presentRaffle.mockResolvedValue({ ok: true, value: {} });

    expect(await raffleDeps.stage.present(DRAW, ["Orion", "Nova"])).toEqual({ ok: true, value: undefined });
    expect(mocks.presentRaffle).toHaveBeenCalledWith(
      { marker: "stage" },
      { drawId: "polera-1", prizeName: "Polera", prizeImageUrl: null, winnerAlias: "Nova", winnerSquadId: "firebase", tickets: 4, totalTickets: 90, reel: ["Orion", "Nova"], at: AT },
    );

    // The prize's photo, answered by the draw, goes to the stage too.
    await raffleDeps.stage.present({ ...DRAW, prizeImageUrl: "https://cdn/polera.webp" }, []);
    expect(mocks.presentRaffle).toHaveBeenLastCalledWith({ marker: "stage" }, expect.objectContaining({ prizeImageUrl: "https://cdn/polera.webp" }));

    mocks.presentRaffle.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(await raffleDeps.stage.present(DRAW, [])).toEqual({ ok: false, error: { code: "unknown" } });
  });

  it("draws whole numbers below the bound from a cryptographic source, and reads entrants from the store", async () => {
    for (let i = 0; i < 50; i += 1) {
      const n = raffleDeps.random(7);
      expect(Number.isInteger(n) && n >= 0 && n < 7).toBe(true);
    }
    mocks.entrants.mockResolvedValue({ ok: true, value: [] });
    expect(await raffleDeps.entrants.list()).toEqual({ ok: true, value: [] });
  });
});

describe("raffleCardDeps", () => {
  it("keeps the raffle settings for the dashboard, and reads the cadet's own draws every time", async () => {
    mocks.settings.mockResolvedValue({ ok: true, value: { minCredits: 5 } });
    mocks.drawsOf.mockResolvedValue({ ok: true, value: [] });

    await raffleCardDeps.store.settings();
    await raffleCardDeps.store.settings();
    await raffleCardDeps.store.drawsOf("u1");
    await raffleCardDeps.store.drawsOf("u1");

    expect(mocks.settings).toHaveBeenCalledTimes(1);
    expect(mocks.drawsOf).toHaveBeenCalledTimes(2);
    expect(mocks.drawsOf).toHaveBeenCalledWith("u1");
  });

  it("leaves the draws on the stored settings", () => {
    expect(raffleDeps.store).not.toBe(raffleCardDeps.store);
    expect(raffleDeps.store.settings).toBe(mocks.settings);
  });
});
