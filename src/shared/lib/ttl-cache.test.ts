import { describe, expect, it, vi } from "vitest";
import { err, ok } from "./result";
import { forgetCachedKey, ttlCached } from "./ttl-cache";

describe("ttlCached", () => {
  it("shares one read until the time is up, then reads again", async () => {
    let clock = 0;
    const load = vi.fn(async () => ok(clock));
    const read = ttlCached(load, { ttlMs: 1000, now: () => clock });

    expect(await read()).toEqual(ok(0));
    clock = 999;
    expect(await read()).toEqual(ok(0));
    expect(load).toHaveBeenCalledTimes(1);

    clock = 1000;
    expect(await read()).toEqual(ok(1000));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("never keeps a failure", async () => {
    const load = vi.fn().mockResolvedValueOnce(err({ code: "unknown" })).mockResolvedValueOnce(ok("again"));
    const read = ttlCached(load, { now: () => 0 });

    expect(await read()).toEqual(err({ code: "unknown" }));
    expect(await read()).toEqual(ok("again"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reads again right after clear", async () => {
    const load = vi.fn().mockResolvedValueOnce(ok("before")).mockResolvedValueOnce(ok("after"));
    const read = ttlCached(load, { now: () => 0 });

    expect(await read()).toEqual(ok("before"));
    read.clear();
    expect(await read()).toEqual(ok("after"));
  });

  it("keeps a minute by default", async () => {
    let clock = 0;
    const load = vi.fn(async () => ok(clock));
    const read = ttlCached(load, { now: () => clock });

    await read();
    clock = 59_999;
    await read();
    expect(load).toHaveBeenCalledTimes(1);
    clock = 60_000;
    await read();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps one answer per key, and clear drops them all", async () => {
    let edition = "devfest-2026";
    const load = vi.fn(async () => ok(edition));
    const read = ttlCached(load, { now: () => 0, key: async () => edition });

    expect(await read()).toEqual(ok("devfest-2026"));
    edition = "meetup-nov";
    expect(await read()).toEqual(ok("meetup-nov"));
    edition = "devfest-2026";
    expect(await read()).toEqual(ok("devfest-2026"));
    expect(load).toHaveBeenCalledTimes(2);

    read.clear();
    await read();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("forgets one key in every keyed cache", async () => {
    let edition = "meetup-nov";
    const load = vi.fn(async () => ok(edition));
    const read = ttlCached(load, { now: () => 0, key: async () => edition });
    await read();
    edition = "devfest-2026";
    await read();

    forgetCachedKey("meetup-nov");
    edition = "meetup-nov";
    await read();
    edition = "devfest-2026";
    await read();

    expect(load).toHaveBeenCalledTimes(3);
  });
});
