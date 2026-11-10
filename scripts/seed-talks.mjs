#!/usr/bin/env node
// Loads the DevFest 2026 agenda: its speakers, the single room (a zone) and the talks. Run from the project root:
//
//   npm run talks:seed              shows what would be created (writes nothing)
//   npm run talks:seed -- --apply   creates it in the active edition
//
// Safe to repeat: documents that already exist are never overwritten. It reads FIREBASE_SERVICE_ACCOUNT_KEY from
// .env.local and never prints it.
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const DATE = "2026-11-21";
const UTC_OFFSET = "-05:00";
const DEFAULT_EVENT_ID = "devfest-2026";
const ROOM = { id: "auditorio", name: "Auditorio principal", tagline: "Charlas y keynotes del evento", planet: "gdg" };

const BUNDLED_ZONES = [
  { id: "cloud", name: "Google Cloud", tagline: "Infraestructura que escala hasta las estrellas", planet: "cloud", order: 0 },
  { id: "firebase", name: "Firebase", tagline: "Lanza tu app a la órbita en minutos", planet: "firebase", order: 1 },
  { id: "android", name: "Android", tagline: "Pilotea la flota de dispositivos", planet: "android", order: 2 },
  { id: "ai", name: "AI", tagline: "Inteligencia para navegar la galaxia", planet: "ai", order: 3 },
  { id: "community", name: "Comunidad GDG", tagline: "La tripulación que hace posible la misión", planet: "gdg", order: 4 },
];

const TEAM = "Equipo GDG Tacna";

// Titles are capped at 80 characters by the app: the two long ones are shortened and kept whole in the description.
const TALKS = [
  { time: "09:00", minutes: 15, title: "Keynote de apertura", speakers: [[TEAM]] },
  { time: "09:15", minutes: 40, title: "Construya su primer agente de IA con Genkit", speakers: [["Luis Eduardo", "GDE Firebase"]] },
  { time: "10:00", minutes: 40, title: "Desarrollo de videojuegos y financiamiento de proyectos", speakers: [["Rafael Gonzalez-Otoya B."]] },
  { time: "10:40", minutes: 15, title: "Pausa para el café", speakers: [[TEAM]], description: "Vestíbulo principal." },
  { time: "10:55", minutes: 40, title: "¿Y si la AI dibujara la pantalla?", speakers: [["Jimy Huacho Dolores", "GDE Angular"]] },
  { time: "11:40", minutes: 40, title: "Automatización inteligente: GitHub Actions + Firebase", speakers: [["Eduardo Ormeño Meneses"]] },
  { time: "12:20", minutes: 50, title: "Almuerzo / networking", speakers: [[TEAM]], description: "Área de networking." },
  {
    time: "13:10",
    minutes: 40,
    title: "Del Vibe Coding al SDD: Web Apps robustas con Genkit, Gemini y Devin",
    description: "Del Vibe Coding al SDD: Cómo construir Web Apps robustas con Firebase Genkit, Gemini y Devin",
    speakers: [["Homer López Vidal"]],
  },
  {
    time: "13:55",
    minutes: 40,
    title: "¿Podemos construir JARVIS hoy? Gemini Live, JEV y Computer Use",
    description: "¿Podemos construir JARVIS hoy? Voz con Gemini Live, decisiones con JEV y Computer Use",
    speakers: [["Jefferson Alfonso Vargas Espinoza"]],
  },
  { time: "14:40", minutes: 40, title: "The Agentic Software Engineer: ¿Quién maneja este avión?", speakers: [["Juan Carlos Romaina"]] },
  { time: "15:20", minutes: 60, title: "Cierre y networking final", speakers: [[TEAM]], description: "Auditorio principal y vestíbulo." },
];

const slug = (value, max) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");

const at = (time) => new Date(`${DATE}T${time}:00${UTC_OFFSET}`);
const apply = process.argv.includes("--apply");

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) fail("falta FIREBASE_SERVICE_ACCOUNT_KEY en .env.local (ver .env.example).");
let key;
try {
  key = JSON.parse(rawKey);
} catch {
  fail("FIREBASE_SERVICE_ACCOUNT_KEY no es un JSON valido.");
}

const app = getApps()[0] ?? initializeApp({ credential: cert(key), projectId: key.project_id });
const db = getFirestore(app);

const config = await db.collection("config").doc("app").get();
const eventId = (config.exists && config.data()?.activeEventId) || DEFAULT_EVENT_ID;
const event = db.collection("events").doc(eventId);
console.log(`${apply ? "APPLY" : "DRY RUN"} · project ${key.project_id} · edition ${eventId}`);

const isAlreadyExists = (cause) => cause?.code === 6 || cause?.code === "already-exists";

async function create(ref, data, label, auditEntry) {
  if (!apply) {
    console.log(`  would create ${label}`);
    return;
  }
  try {
    await ref.create({ ...data, createdAt: new Date() });
  } catch (cause) {
    if (isAlreadyExists(cause)) {
      console.log(`  exists, kept   ${label}`);
      return;
    }
    throw cause;
  }
  await db.collection("audit").add({ ...auditEntry, actorUid: "seed-talks-script", at: new Date() });
  console.log(`  created        ${label}`);
}

// An edition with no zones of its own serves the bundled ones (see features/quadrants/data/default-layout.ts); saving
// any zone makes the edition's own list the only one. So when the room would be the first, the bundled zones are saved
// with it, or they would disappear (and every mission pointing at them would lose its zone).
console.log("Zones");
const quadrants = await event.collection("quadrants").get();
if (quadrants.docs.every((doc) => doc.id === ROOM.id)) {
  for (const zone of BUNDLED_ZONES) {
    await create(event.collection("quadrants").doc(zone.id), { name: zone.name, tagline: zone.tagline, planet: zone.planet, order: zone.order, active: true }, `${zone.id} (${zone.name})`, {
      action: "quadrant.created",
      targetUid: zone.id,
      details: { name: zone.name },
    });
  }
}
const order = Math.max(BUNDLED_ZONES.length - 1, ...quadrants.docs.filter((doc) => doc.id !== ROOM.id).map((doc) => Number(doc.data().order) || 0)) + 1;

// Room (zone).
console.log("Room");
await create(
  event.collection("quadrants").doc(ROOM.id),
  { name: ROOM.name, tagline: ROOM.tagline, planet: ROOM.planet, order, active: true },
  `${ROOM.id} (${ROOM.name})`,
  { action: "quadrant.created", targetUid: ROOM.id, details: { name: ROOM.name } },
);

// Speakers.
console.log("Speakers");
const speakers = new Map();
for (const talk of TALKS) for (const [name, headline = ""] of talk.speakers) speakers.set(slug(name, 48), { name, headline });
for (const [id, { name, headline }] of speakers) {
  await create(
    event.collection("speakers").doc(id),
    { name, headline, bio: "", links: { linkedin: null, github: null, web: null }, photoPath: null, active: true },
    `${id} (${name})`,
    { action: "speaker.created", targetUid: id, details: { name } },
  );
}

// Talks (checkpoints of kind `talk`).
console.log("Talks");
const ids = new Set();
for (const talk of TALKS) {
  if (talk.title.length > 80) fail(`el título supera 80 caracteres: ${talk.title}`);
  const id = slug(talk.title, 48);
  if (ids.has(id)) fail(`id repetido: ${id}`);
  ids.add(id);
  const startsAt = at(talk.time);
  const endsAt = new Date(startsAt.getTime() + talk.minutes * 60_000);
  await create(
    event.collection("checkpoints").doc(id),
    {
      kind: "talk",
      name: talk.title,
      speakerIds: talk.speakers.map(([name]) => slug(name, 48)),
      startsAt,
      endsAt,
      roomId: ROOM.id,
      description: talk.description ?? "",
      active: true,
    },
    `${id} · ${talk.time} (${talk.minutes} min)`,
    { action: "talk.created", targetUid: id, details: { title: talk.title } },
  );
}
console.log(apply ? "Listo." : "Nada escrito. Repite con --apply para crearlo.");
