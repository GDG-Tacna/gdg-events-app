import type { Mission } from "../domain/mission";
import { DEFAULT_XP } from "../domain/mission";

/**
 * The missions every edition starts with, spread over the bundled quadrants (`features/quadrants`): per
 * quadrant a stand visit, a quiz and a keyword, plus the opening talk. Served until the edition saves its
 * own; the admin seeds and edits them in module 4. Titles and texts are edition data, in Spanish.
 *
 * Stand missions point to the checkpoint `stand-{area}` of a stand on the bundled plan, and the talk to
 * `talk-keynote`: both are created in Puestos. Keywords are placeholders the organizers replace.
 */
const base = (id: string, quadrantId: string, order: number) => ({ id, quadrantId, order, active: true, minigame: null, minigameDifficulty: null, credits: null });

export const DEFAULT_MISSIONS: readonly Mission[] = [
  {
    ...base("keynote", "community", 0),
    title: "Asiste a la charla inaugural",
    description: "Escanea el QR que aparece en pantalla durante la charla inaugural.",
    xp: DEFAULT_XP.talk,
    config: { type: "talk", checkpointId: "talk-keynote" },
  },

  {
    ...base("cloud-stand", "cloud", 10),
    title: "Visita el stand de Google Cloud",
    description: "Escanea el QR impreso del Stand Google Cloud 1.",
    xp: DEFAULT_XP.stand,
    config: { type: "stand", checkpointId: "stand-cloud-1" },
  },
  {
    ...base("cloud-quiz", "cloud", 11),
    title: "Desafío Google Cloud",
    description: "Pon a prueba lo que sabes de Google Cloud.",
    xp: DEFAULT_XP.quiz,
    config: {
      type: "quiz",
      question: "¿Qué servicio de Google Cloud ejecuta contenedores sin que administres servidores?",
      options: ["Cloud Run", "Compute Engine", "Cloud Storage", "BigQuery"],
      answer: 0,
    },
  },
  {
    ...base("cloud-keyword", "cloud", 12),
    title: "Clave de la nube",
    description: "Pide la palabra clave en el stand de Google Cloud.",
    xp: DEFAULT_XP.keyword,
    config: { type: "keyword", prompt: "Escribe la palabra clave que te dieron en el stand de Google Cloud.", keywords: ["nube estelar"] },
  },

  {
    ...base("firebase-stand", "firebase", 20),
    title: "Visita el stand de Firebase",
    description: "Escanea el QR impreso del Stand Firebase 1.",
    xp: DEFAULT_XP.stand,
    config: { type: "stand", checkpointId: "stand-firebase-1" },
  },
  {
    ...base("firebase-quiz", "firebase", 21),
    title: "Desafío Firebase",
    description: "Pon a prueba lo que sabes de Firebase.",
    xp: DEFAULT_XP.quiz,
    config: {
      type: "quiz",
      question: "¿Qué producto de Firebase guarda datos en documentos y colecciones?",
      options: ["Remote Config", "Cloud Firestore", "Crashlytics", "Hosting"],
      answer: 1,
    },
  },
  {
    ...base("firebase-keyword", "firebase", 22),
    title: "Clave del fuego",
    description: "Pide la palabra clave en el stand de Firebase.",
    xp: DEFAULT_XP.keyword,
    config: { type: "keyword", prompt: "Escribe la palabra clave que te dieron en el stand de Firebase.", keywords: ["llama orbital"] },
  },

  {
    ...base("android-stand", "android", 30),
    title: "Visita el stand de Android",
    description: "Escanea el QR impreso del Stand Android 1.",
    xp: DEFAULT_XP.stand,
    config: { type: "stand", checkpointId: "stand-android-1" },
  },
  {
    ...base("android-quiz", "android", 31),
    title: "Desafío Android",
    description: "Pon a prueba lo que sabes de Android.",
    xp: DEFAULT_XP.quiz,
    config: {
      type: "quiz",
      question: "¿Cuál es el kit moderno de Android para construir interfaces de forma declarativa?",
      options: ["Android Studio", "Kotlin Multiplatform", "Jetpack Compose", "Vistas XML"],
      answer: 2,
    },
  },
  {
    ...base("android-keyword", "android", 32),
    title: "Clave del androide",
    description: "Pide la palabra clave en el stand de Android.",
    xp: DEFAULT_XP.keyword,
    config: { type: "keyword", prompt: "Escribe la palabra clave que te dieron en el stand de Android.", keywords: ["robot verde"] },
  },

  {
    ...base("ai-stand", "ai", 40),
    title: "Visita el stand de AI",
    description: "Escanea el QR impreso del Stand AI 1.",
    xp: DEFAULT_XP.stand,
    config: { type: "stand", checkpointId: "stand-ai-1" },
  },
  {
    ...base("ai-quiz", "ai", 41),
    title: "Desafío AI",
    description: "Pon a prueba lo que sabes de inteligencia artificial.",
    xp: DEFAULT_XP.quiz,
    config: {
      type: "quiz",
      question: "¿Cómo se llama el asistente de IA de Google que reemplazó a Bard?",
      options: ["Colab", "TensorFlow", "Kotlin", "Gemini"],
      answer: 3,
    },
  },
  {
    ...base("ai-keyword", "ai", 42),
    title: "Clave de la inteligencia",
    description: "Pide la palabra clave en el stand de AI.",
    xp: DEFAULT_XP.keyword,
    config: { type: "keyword", prompt: "Escribe la palabra clave que te dieron en el stand de AI.", keywords: ["red neuronal"] },
  },

  {
    ...base("community-stand", "community", 50),
    title: "Visita el stand de la comunidad",
    description: "Escanea el QR impreso del Stand Comunidad GDG 1.",
    xp: DEFAULT_XP.stand,
    config: { type: "stand", checkpointId: "stand-community-1" },
  },
  {
    ...base("community-quiz", "community", 51),
    title: "Desafío de la comunidad",
    description: "Pon a prueba lo que sabes de la comunidad GDG.",
    xp: DEFAULT_XP.quiz,
    config: {
      type: "quiz",
      question: "¿Qué significan las siglas GDG?",
      options: ["Google Developer Groups", "Google Design Guild", "Global Developer Garage", "Google Data Group"],
      answer: 0,
    },
  },
  {
    ...base("community-keyword", "community", 52),
    title: "Clave de la tripulación",
    description: "Pide la palabra clave en el stand de la Comunidad GDG.",
    xp: DEFAULT_XP.keyword,
    config: { type: "keyword", prompt: "Escribe la palabra clave que te dieron en el stand de la comunidad.", keywords: ["tacna despega"] },
  },
];
