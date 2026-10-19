"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { getClientEnv } from "@/shared/config/env.client";

let emulatorConnected = false;
let firestoreEmulatorConnected = false;

export function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  const env = getClientEnv();
  return initializeApp({
    apiKey: env.apiKey,
    authDomain: env.authDomain,
    projectId: env.projectId,
    appId: env.appId,
    ...(env.measurementId ? { measurementId: env.measurementId } : {}),
  });
}

/**
 * Client Firestore instance. Only the stage screen uses it (phase 6), to listen to the ranking with an admin
 * session; every write still goes through the server.
 */
export function getFirebaseFirestore(): Firestore {
  const db = getFirestore(getFirebaseApp());
  const env = getClientEnv();
  if (env.useEmulator && !firestoreEmulatorConnected) {
    const [host, port] = env.firestoreEmulatorHost.split(":");
    connectFirestoreEmulator(db, host, Number(port));
    firestoreEmulatorConnected = true;
  }
  return db;
}

/** Client Auth instance. Authentication runs on the client; Firestore only on the stage screen. */
export function getFirebaseAuth(): Auth {
  const auth = getAuth(getFirebaseApp());
  const env = getClientEnv();
  if (env.useEmulator && !emulatorConnected) {
    connectAuthEmulator(auth, env.authEmulatorUrl, { disableWarnings: true });
    emulatorConnected = true;
  }
  return auth;
}
