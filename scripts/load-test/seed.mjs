#!/usr/bin/env node
// Creates the test cadets of the load test in a TEST project: an Auth user with the attendee role and a profile in
// the active edition (random XP and G-Credits, so the ranking and the raffle have data). Run it once:
//
//   LOAD_TEST_PROJECT=<id-del-proyecto-de-prueba> LOAD_TEST_CONFIRM=yes npm run load:seed
//
// It refuses any project that is not named on purpose and confirmed. Undo it with `npm run load:cleanup`.
import { activeEdition, cadetCount, connect } from "./firebase.mjs";
import { testCadet } from "./lib.mjs";

const { auth, db, projectId } = connect();
const edition = await activeEdition(db);
const total = cadetCount();
console.log(`Creando ${total} cadetes de prueba en ${projectId} / ${edition}…`);

const BATCH = 25;
let created = 0;
for (let start = 0; start < total; start += BATCH) {
  await Promise.all(
    Array.from({ length: Math.min(BATCH, total - start) }, async (_, offset) => {
      const i = start + offset;
      const { email, alias } = testCadet(i);
      let user;
      try {
        user = await auth.getUserByEmail(email);
      } catch {
        user = await auth.createUser({ email, displayName: alias });
      }
      await auth.setCustomUserClaims(user.uid, { role: "attendee", loadTest: true });
      const xp = Math.floor(Math.random() * 1500);
      await db
        .collection("events")
        .doc(edition)
        .collection("participants")
        .doc(user.uid)
        .set({ uid: user.uid, alias, role: "attendee", squad: null, xp, credits: Math.floor(xp / 10), xpReachedAt: new Date(), createdAt: new Date(), loadTest: true });
      created += 1;
    }),
  );
  process.stdout.write(`\r${created}/${total}`);
}
console.log(`\nListo: ${created} cadetes de prueba.`);
