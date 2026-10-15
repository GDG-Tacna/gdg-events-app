import { describe, expect, it } from "vitest";
import { InMemoryAttemptLimiter } from "./in-memory-attempt-limiter";

function limiter(options: { maxAttempts?: number; windowMs?: number } = {}) {
  const clock = { now: 1_000 };
  return { clock, limiter: new InMemoryAttemptLimiter({ ...options, now: () => clock.now }) };
}

describe("InMemoryAttemptLimiter", () => {
  it("allows attempts up to the limit and refuses the next one", async () => {
    const { limiter: l } = limiter({ maxAttempts: 3 });

    expect([await l.consume("u1"), await l.consume("u1"), await l.consume("u1")]).toEqual([true, true, true]);
    expect(await l.consume("u1")).toBe(false);
  });

  it("counts each attendee on their own", async () => {
    const { limiter: l } = limiter({ maxAttempts: 1 });

    expect(await l.consume("u1")).toBe(true);
    expect(await l.consume("u1")).toBe(false);
    expect(await l.consume("u2")).toBe(true);
  });

  it("lets attempts through again once the window has passed", async () => {
    const { limiter: l, clock } = limiter({ maxAttempts: 1, windowMs: 60_000 });

    expect(await l.consume("u1")).toBe(true);
    clock.now += 59_999;
    expect(await l.consume("u1")).toBe(false);
    clock.now += 1;
    expect(await l.consume("u1")).toBe(true);
  });

  it("does not extend the block with refused attempts", async () => {
    const { limiter: l, clock } = limiter({ maxAttempts: 1, windowMs: 60_000 });

    await l.consume("u1");
    clock.now += 30_000;
    await l.consume("u1"); // refused: must not count
    clock.now += 30_000;

    expect(await l.consume("u1")).toBe(true);
  });

  it("has sensible defaults: 20 attempts a minute", async () => {
    const l = new InMemoryAttemptLimiter();

    const results = await Promise.all(Array.from({ length: 21 }, () => l.consume("u1")));

    expect(results.filter(Boolean)).toHaveLength(20);
    expect(results[20]).toBe(false);
  });
});
