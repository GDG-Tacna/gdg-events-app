#!/usr/bin/env node
// The load test: every test cadet signs in like the app does (a fresh credential exchanged for a session cookie),
// then keeps opening the screens cadets use most, with human pauses, for a while. Reports latency and errors, and
// exits with an error when the run fails the limits.
//
//   LOAD_TEST_PROJECT=<id> LOAD_TEST_CONFIRM=yes LOAD_TEST_URL=https://<deploy-de-prueba> npm run load:run
//
// Optional: LOAD_TEST_CADETS (600), LOAD_TEST_SECONDS (300), LOAD_TEST_P95_MS (1500), LOAD_TEST_MAX_ERRORS (0.01).
// The web API key comes from NEXT_PUBLIC_FIREBASE_API_KEY. Run `npm run load:seed` first.
import { cadetCount, connect, fail } from "./firebase.mjs";
import { pickPage, summarize, testCadet, verdict } from "./lib.mjs";

const { auth } = connect();
const baseUrl = process.env.LOAD_TEST_URL?.replace(/\/$/, "");
if (!baseUrl) fail("falta LOAD_TEST_URL: la dirección del despliegue de prueba.");
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
if (!apiKey) fail("falta NEXT_PUBLIC_FIREBASE_API_KEY.");
const total = cadetCount();
const seconds = Number(process.env.LOAD_TEST_SECONDS ?? 300);
const limits = { maxP95Ms: Number(process.env.LOAD_TEST_P95_MS ?? 1500), maxErrorRate: Number(process.env.LOAD_TEST_MAX_ERRORS ?? 0.01) };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A test cadet's session cookie: custom token → ID token (Identity Toolkit) → the app's session endpoint. */
async function signIn(i) {
  const user = await auth.getUserByEmail(testCadet(i).email);
  const customToken = await auth.createCustomToken(user.uid);
  const exchange = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  if (!exchange.ok) throw new Error(`sign-in ${exchange.status}`);
  const { idToken } = await exchange.json();
  // The route only accepts its own origin (what a browser sends): a script has to say it.
  const session = await fetch(`${baseUrl}/api/auth/session`, { method: "POST", headers: { "content-type": "application/json", origin: new URL(baseUrl).origin }, body: JSON.stringify({ credential: idToken }) });
  if (!session.ok) throw new Error(`session ${session.status}`);
  const cookie = session.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("no session cookie");
  return cookie;
}

console.log(`Iniciando sesión con ${total} cadetes de prueba…`);
const cookies = [];
for (let start = 0; start < total; start += 20) {
  const batch = await Promise.allSettled(Array.from({ length: Math.min(20, total - start) }, (_, offset) => signIn(start + offset)));
  for (const result of batch) if (result.status === "fulfilled") cookies.push(result.value);
  process.stdout.write(`\r${cookies.length}/${total}`);
}
if (cookies.length === 0) fail("ningún cadete pudo iniciar sesión: revisa la URL, la clave web y que corriste load:seed.");
console.log(`\n${cookies.length} sesiones. Navegando durante ${seconds} s…`);

const samples = [];
const end = Date.now() + seconds * 1000;
await Promise.all(
  cookies.map(async (cookie) => {
    // Cadets do not arrive at the same instant: spread the start over the first 30 s.
    await sleep(Math.random() * 30_000);
    while (Date.now() < end) {
      const path = pickPage(Math.random());
      const started = performance.now();
      let status = 0;
      try {
        const response = await fetch(`${baseUrl}${path}`, { headers: { cookie }, redirect: "manual" });
        status = response.status;
        await response.arrayBuffer();
      } catch {
        status = 0;
      }
      samples.push({ path, status, ms: Math.round(performance.now() - started) });
      // A person reads a screen for a few seconds before the next one.
      await sleep(3000 + Math.random() * 7000);
    }
  }),
);

const summary = summarize(samples, seconds);
console.log(JSON.stringify(summary, null, 2));
const result = verdict(summary, limits);
if (result.passed) console.log(`APROBADA: p95 ${summary.p95} ms, errores ${(summary.errorRate * 100).toFixed(2)}%.`);
else fail(`NO APROBADA: ${result.reasons.join("; ")}.`);
