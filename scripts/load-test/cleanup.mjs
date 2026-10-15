#!/usr/bin/env node
// Deletes the test cadets the load test created (Auth users and their profiles in the active edition), and nothing
// else: only users marked `loadTest` with a test email.
//
//   LOAD_TEST_PROJECT=<id-del-proyecto-de-prueba> LOAD_TEST_CONFIRM=yes npm run load:cleanup
import { activeEdition, cadetCount, connect } from "./firebase.mjs";
import { testCadet } from "./lib.mjs";

const { auth, db, projectId } = connect();
const edition = await activeEdition(db);
const total = cadetCount();
console.log(`Borrando cadetes de prueba en ${projectId} / ${edition}…`);

let removed = 0;
for (let i = 0; i < total; i += 1) {
  const { email } = testCadet(i);
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    continue;
  }
  if (user.customClaims?.loadTest !== true) continue;
  await db.collection("events").doc(edition).collection("participants").doc(user.uid).delete();
  await auth.deleteUser(user.uid);
  removed += 1;
}
console.log(`Listo: ${removed} cadetes de prueba borrados.`);
