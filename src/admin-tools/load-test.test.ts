import { describe, expect, it } from "vitest";
import { PAGES, checkTarget, percentile, pickPage, summarize, testCadet, verdict } from "../../scripts/load-test/lib.mjs";

describe("load test helpers", () => {
  it("picks pages by weight", () => {
    expect(PAGES.reduce((sum: number, page: { weight: number }) => sum + page.weight, 0)).toBe(100);
    expect(pickPage(0)).toBe("/dashboard");
    expect(pickPage(0.349)).toBe("/dashboard");
    expect(pickPage(0.35)).toBe("/missions");
    expect(pickPage(0.999)).toBe("/odyssey");
  });

  it("finds percentiles by nearest rank", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(95);
    expect(percentile([300, 100, 200], 99)).toBe(300);
    expect(percentile([7], 1)).toBe(7);
    expect(percentile([], 50)).toBeNull();
  });

  it("summarizes a run, counting anything but 200 as failed", () => {
    const samples = [
      { path: "/dashboard", status: 200, ms: 100 },
      { path: "/dashboard", status: 200, ms: 300 },
      { path: "/missions", status: 500, ms: 900 },
      { path: "/missions", status: 0, ms: 2000 },
    ];

    expect(summarize(samples, 2)).toEqual({
      requests: 4,
      perSecond: 2,
      failed: 2,
      errorRate: 0.5,
      p50: 300,
      p95: 2000,
      p99: 2000,
      byStatus: { 200: 2, 500: 1, 0: 1 },
      byPage: { "/dashboard": 2, "/missions": 2 },
    });
    expect(summarize([], 0)).toMatchObject({ requests: 0, perSecond: 0, errorRate: 0, p95: null });
  });

  it("passes a run only with requests, few errors and a fast p95", () => {
    expect(verdict({ requests: 1000, errorRate: 0.001, p95: 800 })).toEqual({ passed: true, reasons: [] });
    expect(verdict({ requests: 0, errorRate: 0, p95: null }).passed).toBe(false);
    expect(verdict({ requests: 10, errorRate: 0.02, p95: 800 }).reasons[0]).toContain("error rate 2.00%");
    expect(verdict({ requests: 10, errorRate: 0, p95: 1600 }).reasons[0]).toContain("p95 1600 ms");
    expect(verdict({ requests: 10, errorRate: 0, p95: 1600 }, { maxP95Ms: 2000 }).passed).toBe(true);
  });

  it("names test cadets so nobody could mistake them for real ones", () => {
    expect(testCadet(7)).toEqual({ email: "carga-0007@loadtest.invalid", alias: "Carga_0007" });
  });

  it("refuses a project that is not named on purpose, confirmed, and the key's own", () => {
    expect(checkTarget({ keyProjectId: "devfest-test", wantedProjectId: undefined, confirm: "yes" })).toContain("LOAD_TEST_PROJECT");
    expect(checkTarget({ keyProjectId: "devfest-prod", wantedProjectId: "devfest-test", confirm: "yes" })).toContain("no coincide");
    expect(checkTarget({ keyProjectId: "devfest-test", wantedProjectId: "devfest-test", confirm: "si" })).toContain("LOAD_TEST_CONFIRM");
    expect(checkTarget({ keyProjectId: "devfest-test", wantedProjectId: "devfest-test", confirm: "yes" })).toBeNull();
  });
});
