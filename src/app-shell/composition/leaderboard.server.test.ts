import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("./squads.server", () => ({ squadCatalog: { list: mocks.list } }));
vi.mock("@/features/admin/server", () => ({ FirestoreAuditLog: class {} }));
vi.mock("@/features/leaderboard/server", () => ({
  FirestoreStageStore: class {},
  FirestoreRankingSource: class {},
  CachedRankingSource: class {
    constructor(readonly inner: unknown) {}
  },
}));

const { leaderboardDeps, stageDeps } = await import("./leaderboard.server");

describe("leaderboardDeps", () => {
  it("reads the squads from the cached catalog, keeping only what the ranking needs", async () => {
    mocks.list.mockResolvedValue({ ok: true, value: [{ id: "firebase", name: "Escuadrón Firebase", tagline: "t", sprite: {}, active: false }] });

    expect(await leaderboardDeps.squads.list()).toEqual({ ok: true, value: [{ id: "firebase", name: "Escuadrón Firebase", active: false }] });

    mocks.list.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(await leaderboardDeps.squads.list()).toEqual({ ok: false, error: { code: "unknown" } });
  });

  it("freezes and reveals from the ranking as it stands, never the cache", () => {
    expect(stageDeps.ranking).not.toBe(leaderboardDeps.ranking);
    expect((stageDeps.ranking as unknown as { inner?: unknown }).inner).toBeUndefined();
    expect(stageDeps.squads).toBe(leaderboardDeps.squads);
  });

  it("caches the shared ranking reads over Firestore", () => {
    expect((leaderboardDeps.ranking as unknown as { inner: unknown }).inner).toBeDefined();
  });
});
