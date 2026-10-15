import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import type { EditionLayout } from "../../domain/ports";

vi.mock("server-only", () => ({}));

const { CachedQuadrantSource } = await import("./cached-quadrant-source");

const LAYOUT: EditionLayout = { quadrants: [], venue: null };

function setup() {
  const clock = { now: 0 };
  const inner = { load: vi.fn(async (): Promise<Result<EditionLayout, { code: string }>> => ok(LAYOUT)) };
  const source = new CachedQuadrantSource(inner, { ttlMs: 60_000, now: () => clock.now });
  return { clock, inner, source };
}

describe("CachedQuadrantSource", () => {
  it("reads once a minute, not on every map view", async () => {
    const { source, inner, clock } = setup();

    expect(await source.load()).toEqual(ok(LAYOUT));
    clock.now = 59_999;
    await source.load();
    expect(inner.load).toHaveBeenCalledTimes(1);

    clock.now = 60_000;
    await source.load();
    expect(inner.load).toHaveBeenCalledTimes(2);
  });

  it("reads again right away after an admin change", async () => {
    const { source, inner } = setup();
    await source.load();

    source.invalidate();
    await source.load();

    expect(inner.load).toHaveBeenCalledTimes(2);
  });

  it("never caches a failure", async () => {
    const { source, inner } = setup();
    inner.load.mockResolvedValueOnce(err({ code: "unknown" }));

    expect(await source.load()).toEqual(err({ code: "unknown" }));
    expect(await source.load()).toEqual(ok(LAYOUT));
    expect(inner.load).toHaveBeenCalledTimes(2);
  });
});
