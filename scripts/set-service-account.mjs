// Puts a downloaded Firebase service account key into .env.local as FIREBASE_SERVICE_ACCOUNT_KEY (one line, in
// single quotes), replacing the previous one. It never prints the key: only the project it belongs to.
//
//   node scripts/set-service-account.mjs "C:/Users/me/Downloads/gdg-event-app-firebase-adminsdk-xxxx.json"
//
// Then delete the downloaded file (the key now lives only in .env.local, which git ignores) and restart `npm run dev`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const source = process.argv[2];
if (!source) {
  console.error('Uso: node scripts/set-service-account.mjs "ruta/al/archivo.json"');
  process.exit(1);
}

let key;
try {
  key = JSON.parse(readFileSync(source, "utf8"));
} catch (error) {
  console.error(`No se pudo leer el JSON: ${error.message}`);
  process.exit(1);
}
if (key.type !== "service_account" || !key.project_id || !key.private_key || !key.client_email) {
  console.error("Ese archivo no es una clave de cuenta de servicio de Firebase (falta type, project_id, private_key o client_email).");
  process.exit(1);
}

// JSON.stringify writes the key's line breaks as \n, so the whole key fits on one line.
const line = `FIREBASE_SERVICE_ACCOUNT_KEY='${JSON.stringify(key)}'`;
const envPath = ".env.local";
const lines = existsSync(envPath) ? readFileSync(envPath, "utf8").split(/\r?\n/) : [];
const index = lines.findIndex((entry) => /^\s*FIREBASE_SERVICE_ACCOUNT_KEY\s*=/.test(entry));
if (index >= 0) lines[index] = line;
else lines.push(line);
writeFileSync(envPath, lines.join("\n").replace(/\n*$/, "\n"));

const publicProject = lines.map((entry) => /^\s*NEXT_PUBLIC_FIREBASE_PROJECT_ID\s*=\s*(.*)$/.exec(entry)?.[1]?.trim()).find(Boolean);
console.log(`Listo: ${index >= 0 ? "se reemplazó" : "se agregó"} FIREBASE_SERVICE_ACCOUNT_KEY en .env.local (proyecto ${key.project_id}).`);
if (publicProject && publicProject !== key.project_id) {
  console.warn(`Ojo: NEXT_PUBLIC_FIREBASE_PROJECT_ID es "${publicProject}" y la clave es de "${key.project_id}". Deben ser el mismo proyecto.`);
}
console.log("Ahora borra el archivo JSON descargado y reinicia npm run dev.");
