import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const composition = vi.hoisted(() => ({ achievementAdminDeps: { marker: "admin" }, badgeSource: { invalidate: vi.fn() } }));
vi.mock("@/app-shell/composition/achievements.server", () => composition);

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = vi.hoisted(() => ({
  DEFAULT_BADGES: [{ id: "bundled" }],
  seedBadges: vi.fn(),
  createBadge: vi.fn(),
  updateBadge: vi.fn(),
  setBadgeActive: vi.fn(),
  moveBadge: vi.fn(),
}));
vi.mock("@/features/achievements/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { admin: true, achievements: true } }));
vi.mock("@/shared/config/features", () => features);

const { createBadgeAction, moveBadgeAction, seedBadgesAction, setBadgeActiveAction, updateBadgeAction } = await import("./manage.actions");

const ADMIN = { uid: "a1", role: "admin" };
const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });
const SAVE = { id: "maestro-ia", draft: { name: "Maestro", description: "Todo IA.", tone: "gold", rule: { type: "quadrant-complete", quadrantId: "ai" } } };

const cases = [
  { name: "seedBadgesAction", run: () => seedBadgesAction(), useCase: server.seedBadges, args: [[{ id: "bundled" }]] },
  { name: "createBadgeAction", run: () => createBadgeAction(SAVE as never), useCase: server.createBadge, args: [SAVE] },
  { name: "updateBadgeAction", run: () => updateBadgeAction(SAVE as never), useCase: server.updateBadge, args: [SAVE] },
  { name: "setBadgeActiveAction", run: () => setBadgeActiveAction({ id: "maestro-ia", active: false }), useCase: server.setBadgeActive, args: [{ id: "maestro-ia", active: false }] },
  { name: "moveBadgeAction", run: () => moveBadgeAction({ id: "maestro-ia", to: 0 }), useCase: server.moveBadge, args: [{ id: "maestro-ia", to: 0 }] },
];

describe.each(cases)("$name", ({ run, useCase, args }) => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.achievements = true;
    guards.getSession.mockResolvedValue(session("admin"));
  });

  it("is off with the admin or achievements switched off, and only for admins", async () => {
    features.FEATURES.achievements = false;
    expect(await run()).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.achievements = true;
    features.FEATURES.admin = false;
    expect(await run()).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.admin = true;
    guards.getSession.mockResolvedValue(null);
    expect(await run()).toEqual({ ok: false, code: "unauthenticated" });
    guards.getSession.mockResolvedValue(session("staff"));
    expect(await run()).toEqual({ ok: false, code: "forbidden" });
    expect(useCase).not.toHaveBeenCalled();
  });

  it("runs the use case as the session's admin and drops the cached badges", async () => {
    useCase.mockResolvedValue({ ok: true, value: {} });

    expect(await run()).toEqual({ ok: true });
    expect(useCase).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, ...args);
    expect(composition.badgeSource.invalidate).toHaveBeenCalled();
  });

  it("passes a refusal through and keeps the cache", async () => {
    useCase.mockResolvedValue({ ok: false, error: { code: "already-exists" } });

    expect(await run()).toEqual({ ok: false, code: "already-exists" });
    expect(composition.badgeSource.invalidate).not.toHaveBeenCalled();
  });
});

describe("input shape", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.getSession.mockResolvedValue(session("admin"));
  });

  it("rejects malformed input before the use cases", async () => {
    expect(await createBadgeAction({ ...SAVE, draft: { ...SAVE.draft, rule: { type: { nested: true } } } } as never)).toEqual({ ok: false, code: "invalid-rule" });
    expect(await updateBadgeAction({ id: 5 } as never)).toEqual({ ok: false, code: "invalid-rule" });
    expect(await setBadgeActiveAction({ id: "x", active: "no" } as never)).toEqual({ ok: false, code: "not-found" });
    expect(await moveBadgeAction({ id: "x", to: -1 })).toEqual({ ok: false, code: "not-found" });
    expect(server.createBadge).not.toHaveBeenCalled();
    expect(server.updateBadge).not.toHaveBeenCalled();
    expect(server.setBadgeActive).not.toHaveBeenCalled();
    expect(server.moveBadge).not.toHaveBeenCalled();
  });
});
