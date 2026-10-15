import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/economy.server", () => ({ economyDeps: { marker: "economy" } }));
const cache = { revalidatePath: vi.fn() };
vi.mock("next/cache", () => cache);

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { saveEconomySettings: vi.fn() };
vi.mock("@/features/economy/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { admin: true } }));
vi.mock("@/shared/config/features", () => features);

const { saveEconomyAction } = await import("./economy.actions");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });
const SETTINGS = { creditsEnabled: true, missionCredits: { talk: 10, stand: 10, quiz: 5, keyword: 5 }, talkCredits: 10, squadCreditsEnabled: true, squadRatio: 1, contactXp: 20, contactCredits: 5, contactCap: 10 };

describe("saveEconomyAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    guards.getSession.mockResolvedValue(session("admin"));
    server.saveEconomySettings.mockResolvedValue({ ok: true, value: SETTINGS });
  });

  it("is off with the admin switched off, and only for admins", async () => {
    features.FEATURES.admin = false;
    expect(await saveEconomyAction(SETTINGS)).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.admin = true;
    guards.getSession.mockResolvedValue(null);
    expect(await saveEconomyAction(SETTINGS)).toEqual({ ok: false, code: "unauthenticated" });
    guards.getSession.mockResolvedValue(session("staff"));
    expect(await saveEconomyAction(SETTINGS)).toEqual({ ok: false, code: "forbidden" });
    expect(server.saveEconomySettings).not.toHaveBeenCalled();
  });

  it("saves with the actor of the session and refreshes the screens that show credits", async () => {
    expect(await saveEconomyAction(SETTINGS)).toEqual({ ok: true });
    expect(server.saveEconomySettings).toHaveBeenCalledWith({ marker: "economy" }, { uid: "a1", role: "admin" }, SETTINGS);
    expect(cache.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/missions");
  });

  it("rejects malformed input and passes refusals through", async () => {
    expect(await saveEconomyAction({ ...SETTINGS, creditsEnabled: "yes" } as never)).toEqual({ ok: false, code: "invalid-settings" });
    expect(server.saveEconomySettings).not.toHaveBeenCalled();

    server.saveEconomySettings.mockResolvedValue({ ok: false, error: { code: "invalid-settings" } });
    expect(await saveEconomyAction(SETTINGS)).toEqual({ ok: false, code: "invalid-settings" });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
