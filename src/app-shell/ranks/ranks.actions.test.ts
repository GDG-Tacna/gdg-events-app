import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/ranks.server", () => ({ rankDeps: { marker: "ranks" } }));
const cache = { revalidatePath: vi.fn() };
vi.mock("next/cache", () => cache);

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { saveRanks: vi.fn() };
vi.mock("@/features/attendee/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { admin: true } }));
vi.mock("@/shared/config/features", () => features);

const { saveRanksAction } = await import("./ranks.actions");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });
const RANKS = [{ id: "recruit", name: "Recluta", minXp: 0 }];

describe("saveRanksAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    guards.getSession.mockResolvedValue(session("admin"));
    server.saveRanks.mockResolvedValue({ ok: true, value: [] });
  });

  it("is off with the admin switched off, and only for admins", async () => {
    features.FEATURES.admin = false;
    expect(await saveRanksAction(RANKS)).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.admin = true;
    guards.getSession.mockResolvedValue(null);
    expect(await saveRanksAction(RANKS)).toEqual({ ok: false, code: "unauthenticated" });
    guards.getSession.mockResolvedValue(session("staff"));
    expect(await saveRanksAction(RANKS)).toEqual({ ok: false, code: "forbidden" });
    expect(server.saveRanks).not.toHaveBeenCalled();
  });

  it("saves with the actor of the session and refreshes the dashboard", async () => {
    expect(await saveRanksAction(RANKS)).toEqual({ ok: true });
    expect(server.saveRanks).toHaveBeenCalledWith({ marker: "ranks" }, { uid: "a1", role: "admin" }, RANKS);
    expect(cache.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("rejects input that is not a ladder, and passes refusals through", async () => {
    expect(await saveRanksAction("x" as never)).toEqual({ ok: false, code: "invalid-ranks" });
    expect(await saveRanksAction([{ id: "a", name: "Uno", minXp: "0" }] as never)).toEqual({ ok: false, code: "invalid-ranks" });
    expect(server.saveRanks).not.toHaveBeenCalled();

    server.saveRanks.mockResolvedValue({ ok: false, error: { code: "invalid-ranks" } });
    expect(await saveRanksAction(RANKS)).toEqual({ ok: false, code: "invalid-ranks" });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
