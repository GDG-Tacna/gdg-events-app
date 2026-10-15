import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/raffle.server", () => ({ raffleDeps: { marker: "raffle" } }));
const cache = { revalidatePath: vi.fn() };
vi.mock("next/cache", () => cache);
const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const server = { saveRaffleSettings: vi.fn(), createRafflePrize: vi.fn(), updateRafflePrize: vi.fn(), drawRafflePrize: vi.fn(), voidRaffleDraw: vi.fn() };
vi.mock("@/features/raffle/server", () => server);
const features = vi.hoisted(() => ({ FEATURES: { admin: true, raffle: true } }));
vi.mock("@/shared/config/features", () => features);

const actions = await import("./raffle.actions");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });
const ADMIN = { uid: "a1", role: "admin" };
const DRAW = { id: "polera-1", winnerUid: "u1", winnerAlias: "Nova", tickets: 4, totalTickets: 90 };

describe("raffle actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.raffle = true;
    guards.getSession.mockResolvedValue(session("admin"));
    for (const name of ["saveRaffleSettings", "createRafflePrize", "updateRafflePrize", "voidRaffleDraw"] as const) server[name].mockResolvedValue({ ok: true, value: {} });
    server.drawRafflePrize.mockResolvedValue({ ok: true, value: DRAW });
  });

  const calls = [
    ["settings", () => actions.saveRaffleSettingsAction({ minCredits: 1 })],
    ["create", () => actions.createRafflePrizeAction({ name: "Taza", quantity: 1 })],
    ["update", () => actions.updateRafflePrizeAction({ id: "p", active: false })],
    ["draw", () => actions.drawRafflePrizeAction({ prizeId: "p" })],
    ["void", () => actions.voidRaffleDrawAction({ drawId: "p-1" })],
  ] as const;

  it.each(calls)("%s is off with the admin or the raffle switched off, and only for admins", async (_, call) => {
    features.FEATURES.raffle = false;
    expect(await call()).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.raffle = true;
    features.FEATURES.admin = false;
    expect(await call()).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.admin = true;

    guards.getSession.mockResolvedValue(null);
    expect(await call()).toEqual({ ok: false, code: "unauthenticated" });
    guards.getSession.mockResolvedValue(session("staff"));
    expect(await call()).toEqual({ ok: false, code: "forbidden" });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("runs each command as the admin of the session and refreshes the raffle, the stage and the dashboard", async () => {
    expect(await actions.saveRaffleSettingsAction({ minCredits: 5 })).toEqual({ ok: true });
    expect(server.saveRaffleSettings).toHaveBeenCalledWith({ marker: "raffle" }, ADMIN, { minCredits: 5 });
    expect(await actions.createRafflePrizeAction({ name: "Taza", quantity: 2 })).toEqual({ ok: true });
    expect(server.createRafflePrize).toHaveBeenCalledWith({ marker: "raffle" }, ADMIN, { name: "Taza", quantity: 2 });
    expect(await actions.updateRafflePrizeAction({ id: "p", name: "Taza XL" })).toEqual({ ok: true });
    expect(server.updateRafflePrize).toHaveBeenCalledWith({ marker: "raffle" }, ADMIN, { id: "p", name: "Taza XL" });
    expect(await actions.voidRaffleDrawAction({ drawId: "p-1" })).toEqual({ ok: true });
    expect(server.voidRaffleDraw).toHaveBeenCalledWith({ marker: "raffle" }, ADMIN, { drawId: "p-1" });

    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/sorteo");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/escenario");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("answers a draw with the winner's alias and tickets, never their uid", async () => {
    const result = await actions.drawRafflePrizeAction({ prizeId: "polera" });

    expect(result).toEqual({ ok: true, winnerAlias: "Nova", tickets: 4, totalTickets: 90 });
    expect(server.drawRafflePrize).toHaveBeenCalledWith({ marker: "raffle" }, ADMIN, { prizeId: "polera" });
  });

  it("refuses malformed input before the use cases, and passes refusals through", async () => {
    expect(await actions.saveRaffleSettingsAction({ minCredits: "5" } as never)).toEqual({ ok: false, code: "invalid-settings" });
    expect(await actions.createRafflePrizeAction({ name: 3 } as never)).toEqual({ ok: false, code: "invalid-name" });
    expect(await actions.updateRafflePrizeAction({ id: "" })).toEqual({ ok: false, code: "not-found" });
    expect(await actions.drawRafflePrizeAction({} as never)).toEqual({ ok: false, code: "not-found" });
    expect(await actions.voidRaffleDrawAction({ drawId: "" })).toEqual({ ok: false, code: "not-found" });

    server.drawRafflePrize.mockResolvedValue({ ok: false, error: { code: "exhausted" } });
    expect(await actions.drawRafflePrizeAction({ prizeId: "polera" })).toEqual({ ok: false, code: "exhausted" });
    server.createRafflePrize.mockResolvedValue({ ok: false, error: { code: "invalid-quantity" } });
    expect(await actions.createRafflePrizeAction({ name: "Taza", quantity: 0 })).toEqual({ ok: false, code: "invalid-quantity" });
    for (const name of ["saveRaffleSettings", "updateRafflePrize", "voidRaffleDraw"] as const) server[name].mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(await actions.saveRaffleSettingsAction({ minCredits: 1 })).toEqual({ ok: false, code: "unknown" });
    expect(await actions.updateRafflePrizeAction({ id: "p" })).toEqual({ ok: false, code: "unknown" });
    expect(await actions.voidRaffleDrawAction({ drawId: "p-1" })).toEqual({ ok: false, code: "unknown" });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
