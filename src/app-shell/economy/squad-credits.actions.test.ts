import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/economy.server", () => ({ squadCreditsDeps: { marker: "squad-credits" } }));
const cache = { revalidatePath: vi.fn() };
vi.mock("next/cache", () => cache);

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { awardSquadBonus: vi.fn(), redeemPrize: vi.fn(), createPrize: vi.fn(), updatePrize: vi.fn(), setPrizeActive: vi.fn() };
vi.mock("@/features/economy/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { admin: true } }));
vi.mock("@/shared/config/features", () => features);

const { awardSquadBonusAction, createSquadPrizeAction, redeemSquadPrizeAction, setSquadPrizeActiveAction, updateSquadPrizeAction } = await import("./squad-credits.actions");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });
const ADMIN = { uid: "a1", role: "admin" };
const BONUS = { squadId: "angular", amount: 50, reason: "Reto en escenario", operationId: "op-12345678" };
const REDEEM = { squadId: "angular", prizeId: "polera", operationId: "op-12345678" };
const PRIZE_INPUT = { id: "polera", name: "Polera", description: "", cost: 100, stock: 3 };
const PRIZE = { ...PRIZE_INPUT, active: true, order: 0 };

const cases = [
  { name: "awardSquadBonusAction", run: () => awardSquadBonusAction(BONUS), useCase: server.awardSquadBonus, input: BONUS, value: { added: true, balance: 90 } },
  { name: "redeemSquadPrizeAction", run: () => redeemSquadPrizeAction(REDEEM), useCase: server.redeemPrize, input: REDEEM, value: { redeemed: true, balance: 10 } },
  { name: "createSquadPrizeAction", run: () => createSquadPrizeAction(PRIZE_INPUT), useCase: server.createPrize, input: PRIZE_INPUT, value: PRIZE },
  { name: "updateSquadPrizeAction", run: () => updateSquadPrizeAction(PRIZE_INPUT), useCase: server.updatePrize, input: PRIZE_INPUT, value: PRIZE },
  { name: "setSquadPrizeActiveAction", run: () => setSquadPrizeActiveAction({ id: "polera", active: false }), useCase: server.setPrizeActive, input: { id: "polera", active: false }, value: PRIZE },
];

describe("squad credits actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    guards.getSession.mockResolvedValue(session("admin"));
  });

  describe.each(cases)("$name", ({ run, useCase, input, value }) => {
    it("is off with the admin switched off, and only for admins", async () => {
      features.FEATURES.admin = false;
      expect(await run()).toEqual({ ok: false, code: "disabled" });
      features.FEATURES.admin = true;
      guards.getSession.mockResolvedValue(null);
      expect(await run()).toEqual({ ok: false, code: "unauthenticated" });
      guards.getSession.mockResolvedValue(session("staff"));
      expect(await run()).toEqual({ ok: false, code: "forbidden" });
      expect(useCase).not.toHaveBeenCalled();
    });

    it("runs the use case with the session's actor and refreshes this screen and the dashboard", async () => {
      useCase.mockResolvedValue({ ok: true, value });

      expect(await run()).toEqual({ ok: true, value });
      expect(useCase).toHaveBeenCalledWith({ marker: "squad-credits" }, ADMIN, input);
      expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/creditos-escuadron");
      expect(cache.revalidatePath).toHaveBeenCalledWith("/dashboard");
    });

    it("passes a refusal through without refreshing anything", async () => {
      useCase.mockResolvedValue({ ok: false, error: { code: "insufficient" } });

      expect(await run()).toEqual({ ok: false, code: "insufficient" });
      expect(cache.revalidatePath).not.toHaveBeenCalled();
    });
  });

  it("rejects malformed input before reaching the use cases", async () => {
    expect(await awardSquadBonusAction({ ...BONUS, amount: "50" } as never)).toEqual({ ok: false, code: "invalid-amount" });
    expect(await redeemSquadPrizeAction({ ...REDEEM, prizeId: 7 } as never)).toEqual({ ok: false, code: "not-found" });
    expect(await createSquadPrizeAction({ ...PRIZE_INPUT, stock: "3" } as never)).toEqual({ ok: false, code: "invalid-name" });
    expect(await updateSquadPrizeAction({ ...PRIZE_INPUT, cost: undefined } as never)).toEqual({ ok: false, code: "invalid-name" });
    expect(await setSquadPrizeActiveAction({ id: "polera", active: "no" } as never)).toEqual({ ok: false, code: "not-found" });
    expect(await awardSquadBonusAction({ ...BONUS, reason: "x".repeat(401) })).toEqual({ ok: false, code: "invalid-amount" });

    for (const useCase of Object.values(server)) expect(useCase).not.toHaveBeenCalled();
  });
});
