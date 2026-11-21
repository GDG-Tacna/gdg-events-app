#!/usr/bin/env node
// Reads (never writes) the missions the active edition has now and saves them as JSON, so they can become the edition
// defaults that «Cargar misiones por defecto» loads. Run from the project root:
//
//   node --env-file=.env.local scripts/export-missions.mjs <output.json>
//
// It reads FIREBASE_SERVICE_ACCOUNT_KEY from .env.local and never prints it. Uploaded pictures are left out: they belong
// to the edition they were uploaded in, not to the defaults.
import { writeFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const output = process.argv[2];
if (!output) {
  console.error("Usage: node --env-file=.env.local scripts/export-missions.mjs <output.json>");
  process.exit(1);
}
const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error("Error: falta FIREBASE_SERVICE_ACCOUNT_KEY en .env.local (ver .env.example).");
  process.exit(1);
}
const key = JSON.parse(rawKey);
const app = getApps()[0] ?? initializeApp({ credential: cert(key), projectId: key.project_id });
const db = getFirestore(app);

const config = await db.collection("config").doc("app").get();
const eventId = (config.exists && config.data()?.activeEventId) || "devfest-2026";
const snapshot = await db.collection("events").doc(eventId).collection("missions").get();

const missions = snapshot.docs
  .map((doc) => {
    const { image: _image, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = doc.data();
    void _image;
    void _createdAt;
    void _updatedAt;
    return { id: doc.id, ...data };
  })
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));

writeFileSync(output, JSON.stringify({ eventId, missions }, null, 2));
console.log(`project ${key.project_id} · edition ${eventId} · ${missions.length} missions saved to ${output}`);
for (const mission of missions) console.log(`${String(mission.order).padStart(3)} ${mission.active ? "on " : "off"} ${mission.quadrantId.padEnd(10)} ${mission.config?.type?.padEnd(8)} ${mission.id} · ${mission.title} · ${mission.xp} XP`);
