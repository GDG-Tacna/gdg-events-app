#!/usr/bin/env node
// Creates the four «Conoce a…» missions in the active edition: meet an organizer, meet a speaker (any), meet a
// volunteer, and meet someone of every other squad. Run from the project root:
//
//   npm run missions:meet                         shows what would change (writes nothing)
//   npm run missions:meet -- --apply              creates them
//   npm run missions:meet -- --zone <zoneId>      puts them in another zone (default: community)
//
// Safe to repeat: a mission whose id already exists is never overwritten. It reads FIREBASE_SERVICE_ACCOUNT_KEY from
// .env.local and never prints it. The bundled default set (`default-missions.ts`) only seeds an empty edition, which is
// why an edition that already has missions needs this script (or Admin › Misiones).
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");
const zoneFlag = process.argv.indexOf("--zone");
const ZONE = zoneFlag !== -1 && process.argv[zoneFlag + 1] ? process.argv[zoneFlag + 1] : "community";

// Same texts and XP as the bundled set. Credits stay `null`: the edition's Economía value for the type applies.
const MISSIONS = [
  {
    id: "meet-organizer",
    title: "Conoce a un organizador",
    description: "Pídele a un organizador del DevFest que te muestre su código y escanéalo.",
    xp: 30,
    config: { type: "team", role: "organizer", memberUids: null },
  },
  {
    id: "meet-speaker",
    title: "Conoce a un speaker",
    description: "Pídele a cualquier speaker del evento que te muestre su código y escanéalo.",
    xp: 40,
    config: { type: "speaker", speakerIds: null },
  },
  {
    id: "meet-volunteer",
    title: "Conoce a un voluntario",
    description: "Pídele a un voluntario del DevFest que te muestre su código y escanéalo.",
    xp: 30,
    config: { type: "team", role: "volunteer", memberUids: null },
  },
  {
    id: "meet-squads",
    title: "Conoce a alguien de cada escuadrón",
    description: "Escanea el código de contacto de un cadete de cada escuadrón distinto al tuyo.",
    xp: 60,
    config: { type: "squads" },
  },
];

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
console.log(`${apply ? "APPLY" : "DRY RUN"} · project ${key.project_id} · edition ${eventId} · zone ${ZONE}`);

const [zones, missions] = await Promise.all([event.collection("quadrants").get(), event.collection("missions").get()]);

const zone = zones.docs.find((doc) => doc.id === ZONE);
if (!zone) {
  console.error(`Error: la zona "${ZONE}" no existe en esta edición. Zonas disponibles:`);
  for (const doc of zones.docs) console.error(`  ${doc.id} · ${doc.data().name ?? "(sin nombre)"}${doc.data().active === false ? " (inactiva)" : ""}`);
  console.error("Repite con --zone <id>.");
  process.exit(1);
}
if (zone.data().active === false) {
  console.error(`Error: la zona "${ZONE}" está inactiva; las misiones no se verían. Elige otra con --zone.`);
  process.exit(1);
}
console.log(`  zone           ${ZONE} · ${zone.data().name ?? ""}`);

const existing = new Set(missions.docs.map((doc) => doc.id));
const similar = missions.docs.filter((doc) => ["team", "squads"].includes(doc.data().config?.type) || (doc.data().config?.type === "speaker" && !MISSIONS.some((m) => m.id === doc.id)));
for (const doc of similar) {
  if (!MISSIONS.some((m) => m.id === doc.id)) console.log(`  note           ya hay otra misión de ese tipo: ${doc.id} · ${doc.data().title}`);
}

let order = Math.max(-1, ...missions.docs.map((doc) => Number(doc.data().order) || 0)) + 1;
const audit = (action, targetUid, details) => db.collection("audit").add({ action, actorUid: "seed-meet-missions-script", targetUid, details, at: new Date() });

for (const mission of MISSIONS) {
  if (existing.has(mission.id)) {
    console.log(`  exists, kept   ${mission.id}`);
    continue;
  }
  const { id, ...fields } = mission;
  const data = { ...fields, quadrantId: ZONE, credits: null, order: order++, active: true, minigame: null, minigameDifficulty: null, imagePath: null };
  console.log(`  ${apply ? "created       " : "would create  "} ${id} · ${mission.title} · ${mission.config.type}${mission.config.role ? `/${mission.config.role}` : ""} · ${mission.xp} XP`);
  if (!apply) continue;
  try {
    await event.collection("missions").doc(id).create({ ...data, createdAt: new Date() });
    await audit("mission.created", id, { title: mission.title, type: mission.config.type, minigame: null });
  } catch (cause) {
    if (cause?.code !== 6 && cause?.code !== "already-exists") throw cause;
    console.log(`  exists, kept   ${id}`);
  }
}
console.log(apply ? "Listo." : "Nada escrito. Repite con --apply para crearlas.");
