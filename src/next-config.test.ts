import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";

type Rule = { source: string; headers: Array<{ key: string; value: string }> };

const rules = async (): Promise<Rule[]> => (await nextConfig.headers?.()) as Rule[];
const headerValue = (rule: Rule | undefined, key: string) => rule?.headers.find((header) => header.key === key)?.value;

describe("next.config headers", () => {
  it("sets the security headers on every route", async () => {
    const all = (await rules()).find((rule) => rule.source === "/(.*)");

    expect(headerValue(all, "X-Content-Type-Options")).toBe("nosniff");
    expect(headerValue(all, "X-Frame-Options")).toBe("DENY");
    expect(headerValue(all, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("lets only the stage screen be framed, and only by this same site (the console shows a copy of it)", async () => {
    const list = await rules();
    const stage = list.find((rule) => rule.source === "/escenario");

    expect(headerValue(stage, "X-Frame-Options")).toBe("SAMEORIGIN");
    // It comes after the rule for every route, which wins for the same header; the console itself stays unframeable.
    expect(list.indexOf(stage as Rule)).toBeGreaterThan(list.findIndex((rule) => rule.source === "/(.*)"));
    expect(list.some((rule) => rule.source === "/escenario/consola")).toBe(false);
  });

  it("lets the app use the camera (the scanner) and nothing else sensitive", async () => {
    const all = (await rules()).find((rule) => rule.source === "/(.*)");
    const policy = headerValue(all, "Permissions-Policy") ?? "";

    expect(policy).toContain("camera=(self)");
    expect(policy).toContain("microphone=()");
    expect(policy).toContain("geolocation=()");
  });

  it("never caches the service worker and restricts it to same-origin scripts", async () => {
    const sw = (await rules()).find((rule) => rule.source === "/sw.js");

    expect(headerValue(sw, "Cache-Control")).toBe("no-cache, no-store, must-revalidate");
    expect(headerValue(sw, "Content-Type")).toBe("application/javascript; charset=utf-8");
    expect(headerValue(sw, "Content-Security-Policy")).toBe("default-src 'self'; script-src 'self'");
    expect(headerValue(sw, "Service-Worker-Allowed")).toBe("/");
  });
});

describe("next.config distDir", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses .next by default and the isolated folder when NEXT_DIST_DIR is set", async () => {
    expect(nextConfig.distDir).toBe(process.env.NEXT_DIST_DIR || ".next");

    vi.stubEnv("NEXT_DIST_DIR", ".next-check");
    vi.resetModules();
    const isolated = (await import("../next.config")).default;
    expect(isolated.distDir).toBe(".next-check");

    vi.stubEnv("NEXT_DIST_DIR", "");
    vi.resetModules();
    const fallback = (await import("../next.config")).default;
    expect(fallback.distDir).toBe(".next");
  });
});
