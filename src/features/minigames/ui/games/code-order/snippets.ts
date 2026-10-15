import type { CodeLanguage } from "../../../domain/catalog";

export interface Snippet {
  id: string;
  language: CodeLanguage;
  /** What it does, shown above the lines (Spanish copy is data of the game). */
  title: string;
  /**
   * In the right order. A nested list is a group of lines that may go in any order among themselves (two
   * independent imports). Leading spaces are the indentation and part of the line.
   */
  lines: ReadonlyArray<string | readonly string[]>;
}

/**
 * The bundled snippets: Google technology (Firebase, Gemini, Angular, Cloud) and plain code, five of each
 * length (4, 5 and 6 lines) per language. Every line is distinct inside a snippet; lines whose order does not
 * matter are grouped, so any valid order is accepted.
 */
export const SNIPPETS: readonly Snippet[] = [
  // JavaScript / TypeScript, 4 lines
  { id: "js-firebase-init", language: "javascript", title: "Inicia Firebase", lines: ['import { initializeApp } from "firebase/app";', "const config = { projectId: \"devfest\" };", "const app = initializeApp(config);", "export default app;"] },
  { id: "js-sum", language: "javascript", title: "Suma una lista", lines: ["function total(items) {", "  let sum = 0;", "  for (const item of items) sum += item;", "  return sum;"] },
  { id: "js-fetch", language: "javascript", title: "Pide datos a una API", lines: ["async function load(url) {", "  const response = await fetch(url);", "  const data = await response.json();", "  return data;"] },
  { id: "js-greet", language: "javascript", title: "Saluda a un cadete", lines: [["const alias = \"Nova\";", "const squad = \"Gemini\";"], "const message = `Hola ${alias}`;", "console.log(message, squad);"] },
  { id: "js-filter", language: "javascript", title: "Filtra misiones completas", lines: ["const missions = await getMissions();", "const done = missions.filter((m) => m.done);", "const xp = done.length * 40;", "console.log(`XP: ${xp}`);"] },
  // JavaScript / TypeScript, 5 lines
  { id: "js-firestore-add", language: "javascript", title: "Guarda en Firestore", lines: ['import { getFirestore, collection, addDoc } from "firebase/firestore";', "const db = getFirestore(app);", 'const cadets = collection(db, "cadets");', 'await addDoc(cadets, { alias: "Nova" });', 'console.log("Cadete guardado");'] },
  { id: "js-gemini", language: "javascript", title: "Pregunta a Gemini", lines: ['import { GoogleGenAI } from "@google/genai";', "const ai = new GoogleGenAI({});", "const response = await ai.models.generateContent({", '  model: "gemini-flash", contents: "Hola" });', "console.log(response.text);"] },
  { id: "js-angular", language: "javascript", title: "Un componente de Angular", lines: ['import { Component } from "@angular/core";', "@Component({", '  selector: "app-cadet", template: "<h1>Cadete</h1>" })', "export class CadetComponent {", "}"] },
  { id: "js-max", language: "javascript", title: "Busca el mayor puntaje", lines: ["function best(scores) {", "  let top = scores[0];", "  for (const score of scores) {", "    if (score > top) top = score;", "  } return top; }"] },
  { id: "js-class", language: "javascript", title: "Una clase Nave", lines: ["class Ship {", "  constructor(name) {", "    this.name = name;", "  }", "  fly() { return `${this.name} despega`; } }"] },
  // JavaScript / TypeScript, 6 lines
  { id: "js-auth", language: "javascript", title: "Inicia sesión con Google", lines: [['import { getAuth, GoogleAuthProvider } from "firebase/auth";', 'import { signInWithPopup } from "firebase/auth";'], ["const auth = getAuth(app);", "const provider = new GoogleAuthProvider();"], "const result = await signInWithPopup(auth, provider);", "console.log(result.user.displayName);"] },
  { id: "js-onsnapshot", language: "javascript", title: "Escucha el ranking en vivo", lines: ['import { doc, onSnapshot } from "firebase/firestore";', 'const ref = doc(db, "boards", "devfest");', "onSnapshot(ref, (snapshot) => {", "  const data = snapshot.data();", "  render(data.leaders);", "});"] },
  { id: "js-fizz", language: "javascript", title: "FizzBuzz espacial", lines: ["for (let i = 1; i <= 15; i++) {", "  let text = \"\";", '  if (i % 3 === 0) text += "Fizz";', '  if (i % 5 === 0) text += "Buzz";', "  console.log(text || i);", "}"] },
  { id: "js-promise", language: "javascript", title: "Espera un salto", lines: ["function wait(ms) {", "  return new Promise((resolve) => {", "    setTimeout(resolve, ms);", "  });", "}", "await wait(1000);"] },
  { id: "js-rank", language: "javascript", title: "Calcula el rango", lines: ["function rank(xp) {", '  if (xp >= 2000) return "Leyenda";', '  if (xp >= 500) return "Comandante";', '  if (xp >= 100) return "Piloto";', '  return "Recluta";', "}"] },
  // Python, 4 lines
  { id: "py-sum", language: "python", title: "Suma una lista", lines: ["def total(items):", "    result = 0", "    for item in items: result += item", "    return result"] },
  { id: "py-greet", language: "python", title: "Saluda a un cadete", lines: [['alias = "Nova"', 'squad = "Gemini"'], 'message = f"Hola {alias}"', "print(message, squad)"] },
  { id: "py-even", language: "python", title: "Números pares", lines: ["numbers = range(10)", "evens = [n for n in numbers if n % 2 == 0]", "count = len(evens)", 'print(f"Pares: {count}")'] },
  { id: "py-dict", language: "python", title: "XP por escuadrón", lines: ['xp = {"angular": 120, "firebase": 90}', 'xp["gemini"] = 150', "leader = max(xp, key=xp.get)", "print(leader)"] },
  { id: "py-read", language: "python", title: "Lee un archivo", lines: ['with open("cadetes.txt") as file:', "    lines = file.readlines()", "names = [line.strip() for line in lines]", "print(names)"] },
  // Python, 5 lines
  { id: "py-gemini", language: "python", title: "Pregunta a Gemini", lines: ["from google import genai", "client = genai.Client()", "response = client.models.generate_content(", '    model="gemini-flash", contents="Hola")', "print(response.text)"] },
  { id: "py-firestore", language: "python", title: "Guarda en Firestore", lines: ["from google.cloud import firestore", "db = firestore.Client()", 'cadets = db.collection("cadets")', 'cadets.add({"alias": "Nova"})', 'print("Cadete guardado")'] },
  { id: "py-max", language: "python", title: "Busca el mayor puntaje", lines: ["def best(scores):", "    top = scores[0]", "    for score in scores:", "        if score > top: top = score", "    return top"] },
  { id: "py-class", language: "python", title: "Una clase Nave", lines: ["class Ship:", "    def __init__(self, name):", "        self.name = name", "    def fly(self):", '        return f"{self.name} despega"'] },
  { id: "py-countdown", language: "python", title: "Cuenta regresiva", lines: ["import time", "for second in range(3, 0, -1):", "    print(second)", "    time.sleep(1)", 'print("¡Despegue!")'] },
  // Python, 6 lines
  { id: "py-fizz", language: "python", title: "FizzBuzz espacial", lines: ["for i in range(1, 16):", '    text = ""', '    if i % 3 == 0: text += "Fizz"', '    if i % 5 == 0: text += "Buzz"', "    print(text or i)", 'print("Fin")'] },
  { id: "py-rank", language: "python", title: "Calcula el rango", lines: ["def rank(xp):", '    if xp >= 2000: return "Leyenda"', '    if xp >= 500: return "Comandante"', '    if xp >= 100: return "Piloto"', '    return "Recluta"', "print(rank(750))"] },
  { id: "py-flask", language: "python", title: "Una API en Cloud Run", lines: ["from flask import Flask", "app = Flask(__name__)", '@app.route("/")', "def home():", '    return "Hola DevFest"', 'app.run(host="0.0.0.0", port=8080)'] },
  { id: "py-vertex", language: "python", title: "Clasifica una imagen", lines: ["from google.cloud import vision", "client = vision.ImageAnnotatorClient()", 'image = vision.Image(source={"image_uri": url})', "result = client.label_detection(image=image)", "for label in result.label_annotations:", "    print(label.description)"] },
  { id: "py-average", language: "python", title: "Promedio de XP", lines: ["def average(values):", "    if not values:", "        return 0", "    total = sum(values)", "    return total / len(values)", "print(average([40, 50, 30]))"] },
];
