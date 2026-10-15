import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import {
  awardSquadBonus,
  checkPrize,
  createPrize,
  getSquadCreditsOverview,
  getSquadStanding,
  redeemPrize,
  setPrizeActive,
  squadShare,
  updatePrize,
  type SquadCreditsDeps,
  type SquadCreditsStore,
  type SquadPrize,
} from "./squad-credits";

const NOW = new Date("2026-10-24T15:00:00Z");
const ADMIN = { uid: "admin-1", role: "admin" as const };
const STAFF = { uid: "staff-1", role: "staff" as const };
const OP = "op_12345678";

const prize = (id: string, overrides: Partial<SquadPrize> = {}): SquadPrize => ({
  id,
  name: `Premio ${id}`,
  description: "",
  cost: 100,
  stock: null,
  active: true,
  order: 0,
  image: null,
  ...overrides,
});

function setup() {
  const store = {
    wallets: vi.fn<SquadCreditsStore["wallets"]>(async () => ok([{ squadId: "angular", balance: 50, earned: 80, spent: 30 }])),
    wallet: vi.fn<SquadCreditsStore["wallet"]>(async (squadId) => ok({ squadId, balance: 50, earned: 80, spent: 30 })),
    addBonus: vi.fn<SquadCreditsStore["addBonus"]>(async (input) => ok({ added: true, balance: 50 + input.amount })),
    prizes: vi.fn<SquadCreditsStore["prizes"]>(async () => ok([])),
    createPrize: vi.fn<SquadCreditsStore["createPrize"]>(async () => ok(undefined)),
    updatePrize: vi.fn<SquadCreditsStore["updatePrize"]>(async (id, patch) => ok({ before: prize(id), after: { ...prize(id), ...patch } })),
    redeem: vi.fn<SquadCreditsStore["redeem"]>(async () => ok({ redeemed: true, balance: 0 })),
    redemptions: vi.fn<SquadCreditsStore["redemptions"]>(async () => ok([])),
  };
  const audit = { append: vi.fn<SquadCreditsDeps["audit"]["append"]>(async () => ok(undefined)) };
  const squads = {
    list: vi.fn<SquadCreditsDeps["squads"]["list"]>(async () =>
      ok([
        { id: "angular", name: "Angular", active: true },
        { id: "gemini", name: "Gemini", active: false },
      ]),
    ),
  };
  const images = { ref: vi.fn((path: string, purpose: string) => (path.includes(`/${purpose}/`) ? { path, url: `https://cdn/${path}` } : null)), remove: vi.fn(async () => {}) };
  const deps: SquadCreditsDeps = { store, squads, images, audit, now: () => NOW };
  return { deps, store, audit, squads, images };
}

describe("squadShare", () => {
  it.each([
    [10, 1, 10],
    [10, 0.5, 5],
    [5, 0.5, 2],
    [3, 0.25, 0],
    [10, 0, 0],
    [0, 2, 0],
    [-4, 1, 0],
    [7, 1.5, 10],
  ])("gives %s credits at ratio %s a share of %s", (credits, ratio, share) => {
    expect(squadShare(credits, ratio)).toBe(share);
  });
});

describe("checkPrize", () => {
  const valid = { name: " Pizza para el escuadrón ", description: "Una por miembro", cost: 500, stock: 3, active: true, order: 2 };

  it("trims and keeps a valid prize, with no limit when stock is missing or null", () => {
    expect(checkPrize("pizza", valid)).toEqual({ ok: true, value: { id: "pizza", name: "Pizza para el escuadrón", description: "Una por miembro", cost: 500, stock: 3, active: true, order: 2, image: null } });
    expect(checkPrize("pizza", { ...valid, stock: null })).toMatchObject({ ok: true, value: { stock: null } });
    expect(checkPrize("pizza", { name: "Pizza", cost: 1 })).toEqual({
      ok: true,
      value: { id: "pizza", name: "Pizza", description: "", cost: 1, stock: null, active: false, order: Number.MAX_SAFE_INTEGER, image: null },
    });
  });

  it.each([
    ["P", valid, "invalid-id"],
    ["Pizza", valid, "invalid-id"],
    ["pizza", null, "invalid-name"],
    ["pizza", { ...valid, name: "P" }, "invalid-name"],
    ["pizza", { ...valid, name: "x".repeat(61) }, "invalid-name"],
    ["pizza", { ...valid, description: "x".repeat(201) }, "invalid-description"],
    ["pizza", { ...valid, description: 3 }, "invalid-description"],
    ["pizza", { ...valid, cost: 0 }, "invalid-cost"],
    ["pizza", { ...valid, cost: 1.5 }, "invalid-cost"],
    ["pizza", { ...valid, cost: 1_000_001 }, "invalid-cost"],
    ["pizza", { ...valid, cost: "5" }, "invalid-cost"],
    ["pizza", { ...valid, stock: -1 }, "invalid-stock"],
    ["pizza", { ...valid, stock: 2.5 }, "invalid-stock"],
    ["pizza", { ...valid, stock: 100_001 }, "invalid-stock"],
    ["pizza", { ...valid, stock: "3" }, "invalid-stock"],
  ])("refuses id %s with %j: %s", (id, input, code) => {
    expect(checkPrize(id, input)).toEqual({ ok: false, code });
  });

  it("accepts the edges of each range", () => {
    expect(checkPrize("pizza", { ...valid, cost: 1_000_000, stock: 100_000, description: "x".repeat(200), name: "x".repeat(60) }).ok).toBe(true);
    expect(checkPrize("pizza", { ...valid, stock: 0 })).toMatchObject({ ok: true, value: { stock: 0 } });
  });
});

describe("getSquadStanding", () => {
  it("returns the balance and only the active prizes in stock, cheapest first", async () => {
    const t = setup();
    t.store.prizes.mockResolvedValue(ok([prize("cc", { cost: 300 }), prize("aa", { cost: 100, active: false }), prize("bb", { cost: 200, stock: 0 }), prize("dd", { cost: 50, stock: 2 })]));

    expect(await getSquadStanding(t.deps, "angular")).toEqual(
      ok({ wallet: { squadId: "angular", balance: 50, earned: 80, spent: 30 }, prizes: [prize("dd", { cost: 50, stock: 2 }), prize("cc", { cost: 300 })] }),
    );
    expect(t.store.wallet).toHaveBeenCalledWith("angular");
  });

  it("breaks cost ties by name", async () => {
    const t = setup();
    t.store.prizes.mockResolvedValue(ok([prize("zz", { name: "Zeta" }), prize("aa", { name: "Alfa" })]));

    const standing = await getSquadStanding(t.deps, "angular");
    expect(standing.ok && standing.value.prizes.map((p) => p.id)).toEqual(["aa", "zz"]);
  });

  it("fails when the wallet or the prizes cannot be read", async () => {
    const t = setup();
    t.store.wallet.mockResolvedValueOnce(err({ code: "unknown" }));
    expect(await getSquadStanding(t.deps, "angular")).toEqual(err({ code: "unknown" }));
    t.store.prizes.mockResolvedValueOnce(err({ code: "unknown" }));
    expect(await getSquadStanding(t.deps, "angular")).toEqual(err({ code: "unknown" }));
  });
});

describe("getSquadCreditsOverview", () => {
  it("lists every squad with its wallet (empty when none yet), the prizes in order and the last 20 redemptions", async () => {
    const t = setup();
    t.store.prizes.mockResolvedValue(ok([prize("bb", { order: 1 }), prize("aa", { order: 0, cost: 200 }), prize("cc", { order: 0, cost: 100 })]));
    const redemption = { id: OP, squadId: "angular", prizeId: "aa", prizeName: "Premio aa", cost: 200, actorUid: "admin-1", at: NOW };
    t.store.redemptions.mockResolvedValue(ok([redemption]));

    expect(await getSquadCreditsOverview(t.deps, ADMIN)).toEqual(
      ok({
        squads: [
          { id: "angular", name: "Angular", active: true, wallet: { squadId: "angular", balance: 50, earned: 80, spent: 30 } },
          { id: "gemini", name: "Gemini", active: false, wallet: { squadId: "gemini", balance: 0, earned: 0, spent: 0 } },
        ],
        prizes: [prize("cc", { order: 0, cost: 100 }), prize("aa", { order: 0, cost: 200 }), prize("bb", { order: 1 })],
        redemptions: [redemption],
      }),
    );
    expect(t.store.redemptions).toHaveBeenCalledWith(20);
  });

  it("is for admins only, and fails when any read fails", async () => {
    const t = setup();
    expect(await getSquadCreditsOverview(t.deps, STAFF)).toEqual(err({ code: "forbidden" }));
    expect(t.store.wallets).not.toHaveBeenCalled();

    for (const broken of [t.squads.list, t.store.wallets, t.store.prizes, t.store.redemptions] as const) {
      (broken as ReturnType<typeof vi.fn>).mockResolvedValueOnce(err({ code: "unknown" }));
      expect(await getSquadCreditsOverview(t.deps, ADMIN)).toEqual(err({ code: "unknown" }));
    }
  });
});

describe("awardSquadBonus", () => {
  const input = { squadId: "angular", amount: 150, reason: "  Ganó el reto del escenario ", operationId: OP };

  it("adds the bonus with the trimmed reason and writes it to the audit trail", async () => {
    const t = setup();

    expect(await awardSquadBonus(t.deps, ADMIN, input)).toEqual(ok({ added: true, balance: 200 }));
    expect(t.store.addBonus).toHaveBeenCalledWith({ squadId: "angular", amount: 150, reason: "Ganó el reto del escenario", operationId: OP, actorUid: "admin-1" });
    expect(t.audit.append).toHaveBeenCalledWith({
      action: "squad.bonus",
      actorUid: "admin-1",
      targetUid: "angular",
      details: { amount: "150", reason: "Ganó el reto del escenario" },
      at: NOW,
    });
  });

  it("adds a repeated operation once, without a second audit entry", async () => {
    const t = setup();
    t.store.addBonus.mockResolvedValue(ok({ added: false, balance: 200 }));

    expect(await awardSquadBonus(t.deps, ADMIN, input)).toEqual(ok({ added: false, balance: 200 }));
    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("gives a retired squad its bonus too", async () => {
    const t = setup();
    expect((await awardSquadBonus(t.deps, ADMIN, { ...input, squadId: "gemini" })).ok).toBe(true);
  });

  it.each([
    [{ amount: 0 }, "invalid-amount"],
    [{ amount: 1.5 }, "invalid-amount"],
    [{ amount: 100_001 }, "invalid-amount"],
    [{ reason: " ab " }, "invalid-reason"],
    [{ reason: "x".repeat(121) }, "invalid-reason"],
    [{ operationId: "short" }, "invalid-operation"],
    [{ operationId: "op 12345678" }, "invalid-operation"],
    [{ squadId: "cloud" }, "unknown-squad"],
  ])("refuses %j: %s", async (change, code) => {
    const t = setup();

    expect(await awardSquadBonus(t.deps, ADMIN, { ...input, ...change })).toEqual(err({ code }));
    expect(t.store.addBonus).not.toHaveBeenCalled();
  });

  it("accepts the edges of the amount", async () => {
    const t = setup();
    expect((await awardSquadBonus(t.deps, ADMIN, { ...input, amount: 1 })).ok).toBe(true);
    expect((await awardSquadBonus(t.deps, ADMIN, { ...input, amount: 100_000 })).ok).toBe(true);
  });

  it("is for admins only and reports failed reads and writes", async () => {
    const t = setup();
    expect(await awardSquadBonus(t.deps, STAFF, input)).toEqual(err({ code: "forbidden" }));
    expect(t.squads.list).not.toHaveBeenCalled();

    t.squads.list.mockResolvedValueOnce(err({ code: "unknown" }));
    expect(await awardSquadBonus(t.deps, ADMIN, input)).toEqual(err({ code: "unknown" }));
    t.store.addBonus.mockResolvedValueOnce(err({ code: "unknown" }));
    expect(await awardSquadBonus(t.deps, ADMIN, input)).toEqual(err({ code: "unknown" }));
    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("keeps the bonus when the audit trail fails, and logs it", async () => {
    const t = setup();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    t.audit.append.mockResolvedValue(err({ code: "unknown" }));

    expect(await awardSquadBonus(t.deps, ADMIN, input)).toEqual(ok({ added: true, balance: 200 }));
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("createPrize", () => {
  const input = { id: "pizza", name: "Pizza", description: "", cost: 500, stock: 3 };

  it("creates an active prize after the last one and audits it", async () => {
    const t = setup();
    t.store.prizes.mockResolvedValue(ok([prize("aa", { order: 4 }), prize("bb", { order: Number.MAX_SAFE_INTEGER })]));

    expect(await createPrize(t.deps, ADMIN, input)).toEqual(ok({ ...input, active: true, order: 5, image: null }));
    expect(t.store.createPrize).toHaveBeenCalledWith({ ...input, active: true, order: 5, image: null });
    expect(t.audit.append).toHaveBeenCalledWith({ action: "squad.prize.created", actorUid: "admin-1", targetUid: "pizza", details: { name: "Pizza", cost: "500" }, at: NOW });
  });

  it("puts the first prize at order 0", async () => {
    const t = setup();
    expect(await createPrize(t.deps, ADMIN, input)).toMatchObject({ ok: true, value: { order: 0 } });
  });

  it("refuses invalid data, a taken id, non-admins and failed reads", async () => {
    const t = setup();
    expect(await createPrize(t.deps, ADMIN, { ...input, cost: 0 })).toEqual(err({ code: "invalid-cost" }));
    expect(await createPrize(t.deps, STAFF, input)).toEqual(err({ code: "forbidden" }));
    expect(t.store.createPrize).not.toHaveBeenCalled();

    t.store.prizes.mockResolvedValueOnce(err({ code: "unknown" }));
    expect(await createPrize(t.deps, ADMIN, input)).toEqual(err({ code: "unknown" }));
    t.store.createPrize.mockResolvedValueOnce(err({ code: "already-exists" }));
    expect(await createPrize(t.deps, ADMIN, input)).toEqual(err({ code: "already-exists" }));
    t.store.createPrize.mockResolvedValueOnce(err({ code: "unknown" }));
    expect(await createPrize(t.deps, ADMIN, input)).toEqual(err({ code: "unknown" }));
    expect(t.audit.append).not.toHaveBeenCalled();
  });
});

describe("updatePrize", () => {
  const input = { id: "aa", name: "Premio aa", description: "Nueva", cost: 150, stock: 4 };

  it("saves the editable fields and audits only what changed", async () => {
    const t = setup();

    expect(await updatePrize(t.deps, ADMIN, input)).toEqual(ok({ ...prize("aa"), description: "Nueva", cost: 150, stock: 4 }));
    expect(t.store.updatePrize).toHaveBeenCalledWith("aa", { name: "Premio aa", description: "Nueva", cost: 150, stock: 4 });
    expect(t.audit.append).toHaveBeenCalledWith({ action: "squad.prize.updated", actorUid: "admin-1", targetUid: "aa", details: { changed: "description,cost,stock" }, at: NOW });
  });

  it("sets a photo (deleting the one it replaces), keeps it when the form sends none, and refuses another kind's", async () => {
    const oldPath = "public/devfest-2026/squad-prize/0f8e2c1a-1111-4222-8333-944455550000.webp";
    const newPath = "public/devfest-2026/squad-prize/0f8e2c1a-1111-4222-8333-944455551111.webp";
    const ref = (path: string) => ({ path, url: `https://cdn/${path}` });
    const t = setup();
    t.store.updatePrize.mockImplementation(async (_id, patch) => ok({ before: prize("aa", { image: ref(oldPath) }), after: { ...prize("aa", { image: ref(oldPath) }), ...patch } }));

    expect(await updatePrize(t.deps, ADMIN, { ...input, imagePath: newPath })).toMatchObject({ ok: true, value: { image: ref(newPath) } });
    expect(t.images.remove).toHaveBeenCalledWith(oldPath);
    expect(t.audit.append).toHaveBeenLastCalledWith(expect.objectContaining({ details: { changed: "description,cost,stock,image" } }));

    t.images.remove.mockClear();
    await updatePrize(t.deps, ADMIN, input);
    expect(t.store.updatePrize).toHaveBeenLastCalledWith("aa", { name: "Premio aa", description: "Nueva", cost: 150, stock: 4 });
    expect(t.images.remove).not.toHaveBeenCalled();

    expect(await updatePrize(t.deps, ADMIN, { ...input, imagePath: "public/devfest-2026/badge/0f8e2c1a-1111-4222-8333-944455551111.webp" })).toEqual(err({ code: "invalid-image" }));
    expect(await createPrize(t.deps, ADMIN, { id: "pizza", name: "Pizza", description: "", cost: 500, stock: 3, imagePath: "https://evil.example/x.webp" })).toEqual(err({ code: "invalid-image" }));
  });

  it("writes no audit entry when nothing changed", async () => {
    const t = setup();
    expect((await updatePrize(t.deps, ADMIN, { ...input, description: "", cost: 100, stock: null })).ok).toBe(true);
    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("refuses invalid data, an unknown or malformed id, non-admins and failed writes", async () => {
    const t = setup();
    expect(await updatePrize(t.deps, ADMIN, { ...input, name: "x" })).toEqual(err({ code: "invalid-name" }));
    expect(await updatePrize(t.deps, ADMIN, { ...input, id: "Bad Id" })).toEqual(err({ code: "not-found" }));
    expect(await updatePrize(t.deps, STAFF, input)).toEqual(err({ code: "forbidden" }));
    expect(t.store.updatePrize).not.toHaveBeenCalled();

    t.store.updatePrize.mockResolvedValueOnce(ok(null));
    expect(await updatePrize(t.deps, ADMIN, input)).toEqual(err({ code: "not-found" }));
    t.store.updatePrize.mockResolvedValueOnce(err({ code: "unknown" }));
    expect(await updatePrize(t.deps, ADMIN, input)).toEqual(err({ code: "unknown" }));
  });
});

describe("setPrizeActive", () => {
  it("retires and offers again a prize, auditing each change", async () => {
    const t = setup();

    expect(await setPrizeActive(t.deps, ADMIN, { id: "aa", active: false })).toEqual(ok({ ...prize("aa"), active: false }));
    expect(t.store.updatePrize).toHaveBeenCalledWith("aa", { active: false });
    expect(t.audit.append).toHaveBeenLastCalledWith({ action: "squad.prize.deactivated", actorUid: "admin-1", targetUid: "aa", details: { name: "Premio aa" }, at: NOW });

    t.store.updatePrize.mockResolvedValueOnce(ok({ before: prize("aa", { active: false }), after: prize("aa") }));
    expect(await setPrizeActive(t.deps, ADMIN, { id: "aa", active: true })).toEqual(ok(prize("aa")));
    expect(t.audit.append).toHaveBeenLastCalledWith(expect.objectContaining({ action: "squad.prize.activated" }));
  });

  it("writes no audit entry when the state does not change", async () => {
    const t = setup();
    expect((await setPrizeActive(t.deps, ADMIN, { id: "aa", active: true })).ok).toBe(true);
    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("refuses non-admins, unknown prizes and failed writes", async () => {
    const t = setup();
    expect(await setPrizeActive(t.deps, STAFF, { id: "aa", active: false })).toEqual(err({ code: "forbidden" }));
    expect(t.store.updatePrize).not.toHaveBeenCalled();
    t.store.updatePrize.mockResolvedValueOnce(ok(null));
    expect(await setPrizeActive(t.deps, ADMIN, { id: "aa", active: false })).toEqual(err({ code: "not-found" }));
    t.store.updatePrize.mockResolvedValueOnce(err({ code: "unknown" }));
    expect(await setPrizeActive(t.deps, ADMIN, { id: "aa", active: false })).toEqual(err({ code: "unknown" }));
  });
});

describe("redeemPrize", () => {
  const input = { squadId: "angular", prizeId: "aa", operationId: OP };

  beforeEach(() => vi.restoreAllMocks());

  it("redeems once per operation and audits only the real redemption", async () => {
    const t = setup();

    expect(await redeemPrize(t.deps, ADMIN, input)).toEqual(ok({ redeemed: true, balance: 0 }));
    expect(t.store.redeem).toHaveBeenCalledWith({ ...input, actorUid: "admin-1" });
    expect(t.audit.append).toHaveBeenCalledWith({ action: "squad.redeemed", actorUid: "admin-1", targetUid: "angular", details: { prize: "aa" }, at: NOW });

    t.store.redeem.mockResolvedValueOnce(ok({ redeemed: false, balance: 0 }));
    expect(await redeemPrize(t.deps, ADMIN, input)).toEqual(ok({ redeemed: false, balance: 0 }));
    expect(t.audit.append).toHaveBeenCalledTimes(1);
  });

  it.each(["not-found", "inactive", "insufficient", "out-of-stock", "unknown"] as const)("passes on the store's refusal: %s", async (code) => {
    const t = setup();
    t.store.redeem.mockResolvedValueOnce(err({ code }));

    expect(await redeemPrize(t.deps, ADMIN, input)).toEqual(err({ code }));
    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("refuses non-admins, a bad operation id and an unknown squad before touching the store", async () => {
    const t = setup();
    expect(await redeemPrize(t.deps, STAFF, input)).toEqual(err({ code: "forbidden" }));
    expect(await redeemPrize(t.deps, ADMIN, { ...input, operationId: "x" })).toEqual(err({ code: "invalid-operation" }));
    expect(await redeemPrize(t.deps, ADMIN, { ...input, squadId: "cloud" })).toEqual(err({ code: "unknown-squad" }));
    t.squads.list.mockResolvedValueOnce(err({ code: "unknown" }));
    expect(await redeemPrize(t.deps, ADMIN, input)).toEqual(err({ code: "unknown" }));
    expect(t.store.redeem).not.toHaveBeenCalled();
  });
});
