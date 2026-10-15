#!/usr/bin/env node
// Gives the admin role to the very first admin. Run it once, from the project root:
//
//   npm run admin:first -- ana@example.com
//
// The person must have signed in to the app with that Google account at least once. After that,
// admins manage roles from the admin area (Equipo). The script refuses to run when an admin exists.
// It reads FIREBASE_SERVICE_ACCOUNT_KEY from .env.local and never prints it.
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { FirstAdminError, grantFirstAdmin } from "./first-admin-lib.mjs";

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const email = process.argv[2];
if (!email) fail("falta el correo. Uso: npm run admin:first -- correo@ejemplo.com");

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) fail("falta FIREBASE_SERVICE_ACCOUNT_KEY en .env.local (ver .env.example).");

let key;
try {
  key = JSON.parse(rawKey);
} catch {
  fail("FIREBASE_SERVICE_ACCOUNT_KEY no es un JSON valido.");
}

const app = getApps()[0] ?? initializeApp({ credential: cert(key), projectId: key.project_id });
const auth = getAuth(app);
const firestore = getFirestore(app);

const db = {
  async hasAdmin() {
    const snapshot = await firestore.collection("team").where("role", "==", "admin").limit(1).get();
    return !snapshot.empty;
  },
  async saveMember(uid, data) {
    await firestore.collection("team").doc(uid).set(data);
  },
  async appendAudit(entry) {
    await firestore.collection("audit").add(entry);
  },
};

try {
  const admin = await grantFirstAdmin({ email, auth, db });
  console.log(`Listo: ${admin.email} (${admin.uid}) ahora es admin. Debe cerrar sesion y volver a entrar.`);
} catch (error) {
  if (error instanceof FirstAdminError) fail(error.message);
  throw error;
}
