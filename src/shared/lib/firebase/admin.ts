import "server-only";
import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getServerEnv } from "@/shared/config/env.server";

function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const env = getServerEnv();
  if (env.serviceAccountKey) {
    return initializeApp({ credential: cert(JSON.parse(env.serviceAccountKey)), projectId: env.projectId });
  }
  if (env.authEmulatorHost || env.firestoreEmulatorHost) {
    // The Admin SDK talks to the emulators when their *_EMULATOR_HOST variables are set; no credentials needed.
    return initializeApp({ projectId: env.projectId });
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Application Default Credentials can still come from `gcloud auth application-default login` or a
    // cloud runtime, which cannot be detected here, so this is a hint and not an error.
    console.warn(
      "[firebase-admin] No server credentials found (FIREBASE_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS). " +
        "Creating session cookies and reading Firestore will fail unless Application Default Credentials exist. " +
        "See .env.example.",
    );
  }
  return initializeApp({ credential: applicationDefault(), projectId: env.projectId });
}

/** Admin Firestore. Server code only: it bypasses Security Rules, so every caller must authorize first. */
export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}

/** Admin Auth. Server code only: it can mint session cookies and set custom claims. */
export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}
