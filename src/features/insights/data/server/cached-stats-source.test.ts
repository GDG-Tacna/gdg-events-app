import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import type { StatsSource } from "../../domain/stats";

vi.mock("server-only", () => ({}));

const { CachedStatsSource } = await import("./cached-stats-source");

function fakeSource() {
  return {
    editions: vi.fn(async () => ok(["devfest-2026"])),
    registered: vi.fn(async () => ok(200)),
    attended: vi.fn(async () => ok(150)),
    checkInsOfKind: vi.fn(async () => ok(30)),
    missionsCompleted: vi.fn(async () => ok(410)),
    contacts: vi.fn(async () => ok(75)),
    squadMembers: vi.fn(async () => ok(60)),
    rations: vi.fn(async () => ok([])),
  } satisfies StatsSource;
}

describe("CachedStatsSource", () => {
  it("answers a repeated count from memory for half a minute, then reads it again", async () => {
    const inner = fakeSource();
    let clock = 0;
    const stats = new CachedStatsSource(inner, { now: () => clock });

    expect(await stats.registered("devfest-2026")).toEqual(ok(200));
    clock = 29_000;
    expect(await stats.registered("devfest-2026")).toEqual(ok(200));
    expect(inner.registered).toHaveBeenCalledTimes(1);

    clock = 31_000;
    await stats.registered("devfest-2026");
    expect(inner.registered).toHaveBeenCalledTimes(2);
  });

  it("keeps each number apart by what it asks: edition, kind and squad", async () => {
    const inner = fakeSource();
    const stats = new CachedStatsSource(inner);

    await stats.registered("devfest-2025");
    await stats.registered("devfest-2026");
    await stats.checkInsOfKind("devfest-2026", "talk");
    await stats.checkInsOfKind("devfest-2026", "stand");
    await stats.squadMembers("devfest-2026", "firebase");
    await stats.squadMembers("devfest-2026", "angular");
    await stats.squadMembers("devfest-2026", "firebase");

    expect(inner.registered).toHaveBeenCalledTimes(2);
    expect(inner.checkInsOfKind).toHaveBeenCalledTimes(2);
    expect(inner.squadMembers).toHaveBeenCalledTimes(2);
  });

  it("caches every kind of number the home reads", async () => {
    const inner = fakeSource();
    const stats = new CachedStatsSource(inner);

    for (let round = 0; round < 2; round += 1) {
      await stats.editions();
      await stats.attended("e");
      await stats.missionsCompleted("e");
      await stats.contacts("e");
      await stats.rations("e");
    }

    for (const read of [inner.editions, inner.attended, inner.missionsCompleted, inner.contacts, inner.rations]) expect(read).toHaveBeenCalledTimes(1);
  });

  it("never keeps a failed read, so the home does not show a stale error or a wrong number", async () => {
    const inner = fakeSource();
    inner.contacts.mockResolvedValueOnce(err({ code: "down" }) as never);
    const stats = new CachedStatsSource(inner);

    expect(await stats.contacts("e")).toEqual(err({ code: "down" }));
    expect(await stats.contacts("e")).toEqual(ok(75));
    expect(inner.contacts).toHaveBeenCalledTimes(2);
  });
});
