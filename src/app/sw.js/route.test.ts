import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { GET } = await import("./route");

describe("GET /sw.js", () => {
  afterEach(() => {
    delete process.env.BUILD_ID;
  });

  it("serves JavaScript that the browser must never cache, so users always see a new worker", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-cache, no-store, must-revalidate");
  });

  it("puts the deploy version in the worker, so each deploy produces a different file and an update prompt", async () => {
    process.env.BUILD_ID = "commit-abc123";
    const first = await GET().text();
    process.env.BUILD_ID = "commit-def456";
    const second = await GET().text();

    expect(first).toContain('"commit-abc123"');
    expect(second).toContain('"commit-def456"');
    expect(first).not.toBe(second);
  });

  it("falls back to a fixed version without BUILD_ID, so the file is stable between builds", async () => {
    expect(await GET().text()).toBe(await GET().text());
    expect(await GET().text()).toContain('const VERSION = "1"');
  });

  it("precaches the offline page and the manifest icons, and nothing that depends on the session", async () => {
    const source = await GET().text();
    const precache = JSON.parse(/const PRECACHE = (\[.*\]);/.exec(source)?.[1] ?? "[]") as string[];

    expect(precache).toEqual(["/offline", "/icons/icon-192.png", "/icons/icon-512.png"]);
    expect(precache.some((path) => path.startsWith("/dashboard") || path.startsWith("/api"))).toBe(false);
  });

  it("is a classic worker script (no modules), as `register()` is called without a type", async () => {
    const source = await GET().text();

    expect(source).not.toMatch(/^\s*(import|export)\s/m);
  });
});
