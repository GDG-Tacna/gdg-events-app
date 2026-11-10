#!/usr/bin/env node
// Creates one "attend the talk" mission for each talk of the active edition that gives attendance (every talk but the
// breaks), and points the old `keynote` mission at the new keynote talk. Run from the project root:
//
//   npm run talks:missions              shows what would change (writes nothing)
//   npm run talks:missions -- --apply   creates it
//
// Safe to repeat: missions that exist are never overwritten, and a talk that already has a mission gets no second one.
// It reads FIREBASE_SERVICE_ACCOUNT_KEY from .env.local and never prints it.
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const ZONE = "auditorio";
const BREAKS = new Set(["pausa-para-el-cafe", "almuerzo-networking"]);
const LEGACY = { missionId: "keynote", oldCheckpoint: "talk-keynote", newCheckpoint: "keynote-de-apertura" };
const apply = process.argv.includes("--apply");

/** At most `max` characters, cut at a word and ended with an ellipsis. */
const shorten = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1).replace(/s+S*$/, "")}…`);

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
const event = db.collection("events").doc(eventId);
console.log(`${apply ? "APPLY" : "DRY RUN"} · project ${key.project_id} · edition ${eventId}`);

const [talks, missions] = await Promise.all([event.collection("checkpoints").where("kind", "==", "talk").get(), event.collection("missions").get()]);
const tiedTo = new Set(missions.docs.map((doc) => doc.data().config?.checkpointId).filter(Boolean));
let order = Math.max(-1, ...missions.docs.map((doc) => Number(doc.data().order) || 0)) + 1;

const audit = (action, targetUid, details) => db.collection("audit").add({ action, actorUid: "seed-talk-missions-script", targetUid, details, at: new Date() });

// The old keynote mission pointed at a talk that no longer exists.
const legacy = missions.docs.find((doc) => doc.id === LEGACY.missionId);
if (legacy?.data().config?.checkpointId === LEGACY.oldCheckpoint) {
  console.log(`  repoint        ${LEGACY.missionId}: ${LEGACY.oldCheckpoint} -> ${LEGACY.newCheckpoint}`);
  if (apply) {
    await legacy.ref.update({ "config.checkpointId": LEGACY.newCheckpoint });
    await audit("mission.updated", LEGACY.missionId, { changed: "config" });
  }
  tiedTo.add(LEGACY.newCheckpoint);
}

const sorted = talks.docs.filter((doc) => doc.data().active === true && !BREAKS.has(doc.id)).sort((a, b) => a.data().startsAt.toMillis() - b.data().startsAt.toMillis());
for (const talk of sorted) {
  if (tiedTo.has(talk.id)) {
    console.log(`  has a mission  ${talk.id}`);
    continue;
  }
  const name = talk.data().name;
  const id = `charla-${talk.id.slice(0, 32)}`.replace(/-+$/, "");
  const title = shorten(`Asiste: ${name}`, 60);
  const data = {
    title,
    description: "Escanea el QR que aparece en pantalla durante la charla.",
    quadrantId: ZONE,
    xp: 50,
    credits: null,
    order: order++,
    active: true,
    minigame: null,
    minigameDifficulty: null,
    config: { type: "talk", checkpointId: talk.id },
    imagePath: null,
  };
  console.log(`  ${apply ? "created       " : "would create  "} ${id} · ${title}`);
  if (!apply) continue;
  try {
    await event.collection("missions").doc(id).create({ ...data, createdAt: new Date() });
    await audit("mission.created", id, { title, type: "talk", minigame: null });
  } catch (cause) {
    if (cause?.code !== 6 && cause?.code !== "already-exists") throw cause;
    console.log(`  exists, kept   ${id}`);
  }
}
console.log(apply ? "Listo." : "Nada escrito. Repite con --apply para crearlo.");
