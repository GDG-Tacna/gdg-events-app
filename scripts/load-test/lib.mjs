// Pure helpers of the load test (no network, no Firebase), so they can be unit tested.

/** The screens a cadet opens during the event, with how often (weights add up to 100). */
export const PAGES = [
  { path: "/dashboard", weight: 35 },
  { path: "/missions", weight: 25 },
  { path: "/achievements", weight: 15 },
  { path: "/map", weight: 10 },
  { path: "/red", weight: 10 },
  { path: "/odyssey", weight: 5 },
];

/** A page by weight, for a random number in [0, 1). */
export function pickPage(random, pages = PAGES) {
  const total = pages.reduce((sum, page) => sum + page.weight, 0);
  let point = random * total;
  for (const page of pages) {
    if (point < page.weight) return page.path;
    point -= page.weight;
  }
  return pages[pages.length - 1].path;
}

/** The value below which `p` percent of the values fall (nearest rank). `null` for no values. */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

/**
 * What a run measured: requests, how many failed (network errors or a status other than 200), latency percentiles
 * in ms, and counts by status and by page.
 */
export function summarize(samples, seconds) {
  const latencies = samples.map((sample) => sample.ms);
  const failed = samples.filter((sample) => sample.status !== 200);
  const count = (key) => samples.reduce((acc, sample) => ({ ...acc, [sample[key]]: (acc[sample[key]] ?? 0) + 1 }), {});
  return {
    requests: samples.length,
    perSecond: seconds > 0 ? Math.round((samples.length / seconds) * 10) / 10 : 0,
    failed: failed.length,
    errorRate: samples.length === 0 ? 0 : failed.length / samples.length,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    byStatus: count("status"),
    byPage: count("path"),
  };
}

/** The run passes when it measured something, failed less than `maxErrorRate`, and its p95 is under `maxP95Ms`. */
export function verdict(summary, { maxP95Ms = 1500, maxErrorRate = 0.01 } = {}) {
  const reasons = [];
  if (summary.requests === 0) reasons.push("no requests were measured");
  if (summary.errorRate >= maxErrorRate) reasons.push(`error rate ${(summary.errorRate * 100).toFixed(2)}% (limit ${(maxErrorRate * 100).toFixed(2)}%)`);
  if (summary.p95 !== null && summary.p95 > maxP95Ms) reasons.push(`p95 ${summary.p95} ms (limit ${maxP95Ms} ms)`);
  return { passed: reasons.length === 0, reasons };
}

/** The test cadet number `i`: an email no real person can own and an alias that says what it is. */
export const testCadet = (i) => ({ email: `carga-${String(i).padStart(4, "0")}@loadtest.invalid`, alias: `Carga_${String(i).padStart(4, "0")}` });

/** Refuses to touch a project unless it is named on purpose and confirmed, and is the project of the key. */
export function checkTarget({ keyProjectId, wantedProjectId, confirm }) {
  if (!wantedProjectId) return "Falta LOAD_TEST_PROJECT: escribe el id del proyecto de PRUEBA a usar.";
  if (wantedProjectId !== keyProjectId) return `LOAD_TEST_PROJECT (${wantedProjectId}) no coincide con el proyecto de la clave (${keyProjectId}).`;
  if (confirm !== "yes") return "Falta LOAD_TEST_CONFIRM=yes: confirma que este proyecto es de prueba y no el del evento.";
  return null;
}
