// Firebase Admin for the load test, against a TEST project only. Reads FIREBASE_SERVICE_ACCOUNT_KEY from the env file
// the npm script loads and never prints it.
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { checkTarget } from "./lib.mjs";

export function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/** Admin Auth and Firestore of the test project, after checking it is the project named on purpose. */
export function connect() {
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) fail("falta FIREBASE_SERVICE_ACCOUNT_KEY en el archivo de entorno.");
  let key;
  try {
    key = JSON.parse(rawKey);
  } catch {
    fail("FIREBASE_SERVICE_ACCOUNT_KEY no es un JSON válido.");
  }
  const refused = checkTarget({ keyProjectId: key.project_id, wantedProjectId: process.env.LOAD_TEST_PROJECT, confirm: process.env.LOAD_TEST_CONFIRM });
  if (refused) fail(refused);

  const app = getApps()[0] ?? initializeApp({ credential: cert(key), projectId: key.project_id });
  return { auth: getAuth(app), db: getFirestore(app), projectId: key.project_id };
}

/** The edition the app serves (`config/app.activeEventId`), or the edition's default. */
export async function activeEdition(db) {
  const snapshot = await db.collection("config").doc("app").get();
  const id = snapshot.exists ? snapshot.data()?.activeEventId : undefined;
  return typeof id === "string" && id.length > 0 ? id : "devfest-2026";
}

/** How many test cadets: LOAD_TEST_CADETS, 600 by default (twice the 300 expected). */
export function cadetCount() {
  const value = Number(process.env.LOAD_TEST_CADETS ?? 600);
  if (!Number.isInteger(value) || value < 1 || value > 5000) fail("LOAD_TEST_CADETS debe ser un entero de 1 a 5000.");
  return value;
}
