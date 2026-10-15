import { describe, expect, it } from "vitest";
import { checkMission, normalizeKeyword, parseMission, publicConfig } from "./mission";

const quiz = { type: "quiz", question: "¿Qué es Firestore?", options: ["Una base de datos", "Un lenguaje"], answer: 0 };
const input = (extra: Record<string, unknown> = {}) => ({
  title: "  Desafío  ",
  description: "Responde",
  quadrantId: "firebase",
  xp: 40,
  order: 3,
  active: true,
  config: quiz,
  ...extra,
});

describe("parseMission", () => {
  it("reads a mission that can be offered, trimming its texts", () => {
    expect(parseMission("firebase-quiz", input())).toEqual({
      id: "firebase-quiz",
      title: "Desafío",
      description: "Responde",
      quadrantId: "firebase",
      xp: 40,
      credits: null,
      order: 3,
      active: true,
      minigame: null,
      minigameDifficulty: null,
      config: quiz,
    });
  });

  it("reads each type's config, normalizing and de-duplicating keywords", () => {
    expect(parseMission("t", input({ config: { type: "talk", checkpointId: "talk-keynote" } }))).toBeNull(); // id too short
    expect(parseMission("talk-1", input({ config: { type: "talk", checkpointId: "talk-keynote" } }))?.config).toEqual({ type: "talk", checkpointId: "talk-keynote" });
    expect(parseMission("stand-1", input({ config: { type: "stand", checkpointId: "stand-ai-1" } }))?.config).toEqual({ type: "stand", checkpointId: "stand-ai-1" });
    expect(parseMission("kw-1", input({ config: { type: "keyword", prompt: "Pide la clave", keywords: ["Fuégo  Azul", "fuego azul", "Nube"] } }))?.config).toEqual({
      type: "keyword",
      prompt: "Pide la clave",
      keywords: ["fuego azul", "nube"],
    });
  });

  it("reads its own G-Credits, or none to use the edition's default", () => {
    expect(parseMission("m-1", input({ credits: 15 }))?.credits).toBe(15);
    expect(parseMission("m-1", input({ credits: 0 }))?.credits).toBe(0);
    expect(parseMission("m-1", input({ credits: null }))?.credits).toBeNull();
  });

  it.each([-1, 1001, 2.5, "10"])("refuses G-Credits of %j", (credits) => {
    expect(checkMission("m-1", input({ credits }))).toEqual({ ok: false, code: "invalid-credits" });
  });

  it("defaults what is optional: no description, last in order, inactive unless marked, no mini-game unless valid", () => {
    const parsed = parseMission("m-1", input({ description: undefined, order: "x", active: "yes", minigame: "Bad Game" }));

    expect(parsed).toMatchObject({ description: "", order: Number.MAX_SAFE_INTEGER, active: false, minigame: null });
    expect(parseMission("m-1", input({ minigame: "asteroids" }))?.minigame).toBe("asteroids");
  });

  it("reads a mini-game difficulty only with a game, and only a known one", () => {
    expect(parseMission("m-1", input({ minigame: "circuits", minigameDifficulty: "hard" }))?.minigameDifficulty).toBe("hard");
    expect(parseMission("m-1", input({ minigame: "circuits", minigameDifficulty: "insane" }))?.minigameDifficulty).toBeNull();
    expect(parseMission("m-1", input({ minigame: "circuits" }))?.minigameDifficulty).toBeNull();
    expect(parseMission("m-1", input({ minigame: null, minigameDifficulty: "easy" }))?.minigameDifficulty).toBeNull();
  });

  it.each([
    ["a bad id", "Bad Id", input()],
    ["not an object", "m-1", null],
    ["a short title", "m-1", input({ title: "ab" })],
    ["a long description", "m-1", input({ description: "x".repeat(201) })],
    ["a bad quadrant", "m-1", input({ quadrantId: "" })],
    ["no XP", "m-1", input({ xp: 0 })],
    ["too much XP", "m-1", input({ xp: 501 })],
    ["fractional XP", "m-1", input({ xp: 10.5 })],
    ["an unknown type", "m-1", input({ config: { type: "dance" } })],
    ["a talk without checkpoint", "m-1", input({ config: { type: "talk" } })],
    ["a quiz with one option", "m-1", input({ config: { ...quiz, options: ["Sí"] } })],
    ["a quiz with five options", "m-1", input({ config: { ...quiz, options: ["a", "b", "c", "d", "e"] } })],
    ["a quiz with repeated options", "m-1", input({ config: { ...quiz, options: ["Sí", "sí"] } })],
    ["a quiz with an empty option", "m-1", input({ config: { ...quiz, options: ["Sí", "  "] } })],
    ["a quiz answer out of range", "m-1", input({ config: { ...quiz, answer: 2 } })],
    ["a quiz answer that is not a whole number", "m-1", input({ config: { ...quiz, answer: 0.5 } })],
    ["a short question", "m-1", input({ config: { ...quiz, question: "¿Y?" } })],
    ["a keyword mission without keywords", "m-1", input({ config: { type: "keyword", prompt: "Pide la clave", keywords: [] } })],
    ["a keyword too short", "m-1", input({ config: { type: "keyword", prompt: "Pide la clave", keywords: ["a"] } })],
    ["too many keywords", "m-1", input({ config: { type: "keyword", prompt: "Pide la clave", keywords: ["aa", "bb", "cc", "dd", "ee", "ff"] } })],
  ])("refuses %s", (_, id, data) => {
    expect(parseMission(id, data)).toBeNull();
  });
});

describe("normalizeKeyword", () => {
  it("ignores case, accents and extra spaces", () => {
    expect(normalizeKeyword("  Árbol   ESTELAR ")).toBe("arbol estelar");
    expect(normalizeKeyword("ñandú")).toBe("nandu");
  });
});

describe("publicConfig", () => {
  it("never gives away the answer or the keywords", () => {
    expect(publicConfig({ type: "quiz", question: "¿Q?", options: ["a", "b"], answer: 1 })).toEqual({ type: "quiz", question: "¿Q?", options: ["a", "b"] });
    expect(publicConfig({ type: "keyword", prompt: "Pide", keywords: ["secreto"] })).toEqual({ type: "keyword", prompt: "Pide" });
    expect(publicConfig({ type: "talk", checkpointId: "talk-keynote" })).toEqual({ type: "talk" });
    expect(publicConfig({ type: "stand", checkpointId: "stand-ai-1" })).toEqual({ type: "stand" });
  });
});
