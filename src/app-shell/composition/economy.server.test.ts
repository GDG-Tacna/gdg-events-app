import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/event/server", () => ({ currentEditionOf: async () => "e1" }));
const mocks = vi.hoisted(() => ({ wallet: vi.fn(), prizes: vi.fn() }));
vi.mock("./squads.server", () => ({ squadStore: { marker: "squads" } }));
vi.mock("@/features/admin/server", () => ({ FirestoreAuditLog: class {} }));
vi.mock("@/features/economy/server", () => ({
  FirestoreEconomyStore: class {},
  FirestoreXpLedger: class {},
  getEconomySettings: vi.fn(),
  FirestoreSquadCreditsStore: class {
    wallet = mocks.wallet;
    prizes = mocks.prizes;
  },
}));

const { squadCardDeps, squadCreditsDeps } = await import("./economy.server");

describe("squadCardDeps", () => {
  it("keeps the prize list for the dashboard, and reads the squad's balance every time", async () => {
    mocks.prizes.mockResolvedValue({ ok: true, value: [] });
    mocks.wallet.mockResolvedValue({ ok: true, value: { squadId: "firebase", balance: 10, earned: 10, spent: 0 } });

    await squadCardDeps.store.prizes();
    await squadCardDeps.store.prizes();
    await squadCardDeps.store.wallet("firebase");
    await squadCardDeps.store.wallet("firebase");

    expect(mocks.prizes).toHaveBeenCalledTimes(1);
    expect(mocks.wallet).toHaveBeenCalledTimes(2);
    expect(mocks.wallet).toHaveBeenCalledWith("firebase");
  });

  it("leaves the admin screen and redemptions on the stored prizes", () => {
    expect(squadCreditsDeps.store.prizes).toBe(mocks.prizes);
  });
});
