import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import type { RankingSource } from "../../domain/ranking";

vi.mock("server-only", () => ({}));
const { CachedRankingSource } = await import("./cached-ranking-source");

function source() {
  return {
    top: vi.fn(async (limit: number) => ok([{ uid: "u1", alias: "Nova", squadId: null, xp: limit, reachedAt: null }])),
    placeOf: vi.fn(async () => ok({ xp: 10, ahead: 2 })),
    total: vi.fn(async () => ok(42)),
    squadTotals: vi.fn(async () => ok(new Map([["a", { xp: 1, members: 1 }]]))),
  } satisfies RankingSource;
}

describe("CachedRankingSource", () => {
  it("keeps the shared reads for the window, per shape, and reads again after it", async () => {
    let clock = 0;
    const inner = source();
    const cached = new CachedRankingSource(inner, { ttlMs: 10_000, now: () => clock });

    await cached.top(10);
    await cached.top(10);
    await cached.top(3);
    await cached.total();
    await cached.total();
    await cached.squadTotals(["b", "a"]);
    await cached.squadTotals(["a", "b"]);
    expect(inner.top).toHaveBeenCalledTimes(2);
    expect(inner.total).toHaveBeenCalledTimes(1);
    expect(inner.squadTotals).toHaveBeenCalledTimes(1);

    clock = 10_001;
    await cached.top(10);
    expect(inner.top).toHaveBeenCalledTimes(3);
  });

  it("never caches a cadet's own place or a failed read", async () => {
    const inner = source();
    inner.total.mockResolvedValueOnce(err({ code: "x" }) as never);
    const cached = new CachedRankingSource(inner, { now: () => 0 });

    expect(await cached.total()).toEqual(err({ code: "x" }));
    expect(await cached.total()).toEqual(ok(42));
    await cached.placeOf("u1");
    await cached.placeOf("u1");
    expect(inner.placeOf).toHaveBeenCalledTimes(2);
  });
});
