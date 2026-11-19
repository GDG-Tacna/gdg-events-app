import { describe, expect, it } from "vitest";
import { checkMission, normalizeKeyword, parseMission, publicConfig, TEAM_ROLES } from "./mission";

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

  it("accepts the ids of long talks and speakers (48 characters, like their own features), but not longer ones", () => {
    const talk = "the-agentic-software-engineer-quien-maneja-este";
    const full = "podemos-construir-jarvis-hoy-gemini-live-jev-y-c";
    expect(talk.length).toBe(47);
    expect(full.length).toBe(48);
    expect(parseMission("talk-1", input({ config: { type: "talk", checkpointId: full } }))?.config).toEqual({ type: "talk", checkpointId: full });
    expect(parseMission("stand-1", input({ config: { type: "stand", checkpointId: talk } }))?.config).toEqual({ type: "stand", checkpointId: talk });
    expect(parseMission("meet-1", input({ config: { type: "speaker", speakerIds: [full] } }))?.config).toEqual({ type: "speaker", speakerIds: [full] });
    expect(checkMission("talk-1", input({ config: { type: "talk", checkpointId: `${full}x` } }))).toEqual({ ok: false, code: "invalid-checkpoint" });
    // The mission's own id keeps its 40.
    expect(checkMission(`${"a".repeat(40)}b`, input({ config: { type: "talk", checkpointId: full } }))).toEqual({ ok: false, code: "invalid-id" });
  });

  it("reads each type's config, normalizing and de-duplicating keywords", () => {
    expect(parseMission("t", input({ config: { type: "talk", checkpointId: "talk-keynote" } }))).toBeNull(); // id too short
    expect(parseMission("talk-1", input({ config: { type: "talk", checkpointId: "talk-keynote" } }))?.config).toEqual({ type: "talk", checkpointId: "talk-keynote" });
    expect(parseMission("stand-1", input({ config: { type: "stand", checkpointId: "stand-ai-1" } }))?.config).toEqual({ type: "stand", checkpointId: "stand-ai-1" });
    expect(parseMission("meet-ana", input({ config: { type: "speaker", speakerIds: ["ana-torres"], extra: "x" } }))?.config).toEqual({ type: "speaker", speakerIds: ["ana-torres"] });
    expect(checkMission("meet-ana", input({ config: { type: "speaker", speakerIds: ["Ana Torres"] } }))).toEqual({ ok: false, code: "invalid-speaker" });
    expect(parseMission("kw-1", input({ config: { type: "keyword", prompt: "Pide la clave", keywords: ["Fuégo  Azul", "fuego azul", "Nube"] } }))?.config).toEqual({
      type: "keyword",
      prompt: "Pide la clave",
      keywords: ["fuego azul", "nube"],
    });
  });

  it("reads a speaker mission with no list as «every speaker», and one with a list as any one of them", () => {
    expect(parseMission("meet-any", input({ config: { type: "speaker", speakerIds: null } }))?.config).toEqual({ type: "speaker", speakerIds: null });
    expect(parseMission("meet-some", input({ config: { type: "speaker", speakerIds: ["ana-torres", "luis", "ana-torres"] } }))?.config).toEqual({
      type: "speaker",
      speakerIds: ["ana-torres", "luis"],
    });
  });

  it("never reads a missing, empty or malformed speaker list as «every speaker»", () => {
    for (const config of [
      { type: "speaker" },
      { type: "speaker", speakerIds: [] },
      { type: "speaker", speakerIds: "ana-torres" },
      { type: "speaker", speakerIds: ["ana-torres", ""] },
      { type: "speaker", speakerIds: ["ana-torres", 7] },
      { type: "speaker", speakerIds: Array.from({ length: 51 }, (_, index) => `speaker-${index}`) },
    ]) {
      expect(checkMission("meet-bad", input({ config }))).toEqual({ ok: false, code: "invalid-speaker" });
    }
    expect(parseMission("meet-50", input({ config: { type: "speaker", speakerIds: Array.from({ length: 50 }, (_, index) => `speaker-${index}`) } }))).not.toBeNull();
  });

  it("still reads a speaker mission saved before the choice of several, with one speakerId (or null for any)", () => {
    expect(parseMission("meet-old", input({ config: { type: "speaker", speakerId: "ana-torres" } }))?.config).toEqual({ type: "speaker", speakerIds: ["ana-torres"] });
    expect(parseMission("meet-old", input({ config: { type: "speaker", speakerId: null } }))?.config).toEqual({ type: "speaker", speakerIds: null });
    // The old field is still refused when it is not a speaker's id, and a missing one is never «any».
    expect(checkMission("meet-old", input({ config: { type: "speaker", speakerId: "" } }))).toEqual({ ok: false, code: "invalid-speaker" });
    expect(checkMission("meet-old", input({ config: { type: "speaker", speakerId: 3 } }))).toEqual({ ok: false, code: "invalid-speaker" });
    // The new field wins when both are there.
    expect(parseMission("meet-old", input({ config: { type: "speaker", speakerId: "ana-torres", speakerIds: ["luis"] } }))?.config).toEqual({ type: "speaker", speakerIds: ["luis"] });
  });

  it("reads team missions by the role they ask to meet, and squads missions without fields", () => {
    for (const role of TEAM_ROLES) expect(parseMission("meet-team", input({ config: { type: "team", role, memberUids: null } }))?.config).toEqual({ type: "team", role, memberUids: null });
    expect(checkMission("meet-team", input({ config: { type: "team", role: "admin", memberUids: null } }))).toEqual({ ok: false, code: "invalid-team-role" });
    expect(checkMission("meet-team", input({ config: { type: "team" } }))).toEqual({ ok: false, code: "invalid-team-role" });
    expect(parseMission("meet-squads", input({ config: { type: "squads", extra: "x" } }))?.config).toEqual({ type: "squads" });
  });

  it("reads a team mission with a list of members as any one of them, and one saved before the list as «every member»", () => {
    expect(parseMission("meet-team", input({ config: { type: "team", role: "volunteer", memberUids: ["uid-ana-123", "uid-bruno-1", "uid-ana-123"] } }))?.config).toEqual({
      type: "team",
      role: "volunteer",
      memberUids: ["uid-ana-123", "uid-bruno-1"],
    });
    expect(parseMission("meet-team", input({ config: { type: "team", role: "organizer" } }))?.config).toEqual({ type: "team", role: "organizer", memberUids: null });
  });

  it("refuses an empty, oversized or malformed list of team members", () => {
    for (const memberUids of [[], "uid-ana-123", ["uid-ana-123", ""], ["short"], ["uid with spaces"], [12345678], Array.from({ length: 51 }, (_, index) => `member-uid-${index}`)]) {
      expect(checkMission("meet-team", input({ config: { type: "team", role: "volunteer", memberUids } }))).toEqual({ ok: false, code: "invalid-team-members" });
    }
    expect(parseMission("meet-team", input({ config: { type: "team", role: "volunteer", memberUids: Array.from({ length: 50 }, (_, index) => `member-uid-${index}`) } }))).not.toBeNull();
  });

  it("shows attendees whom a speaker or team mission names, and nothing but the type of a squads one", () => {
    expect(publicConfig({ type: "team", role: "volunteer", memberUids: ["uid-ana-123"] })).toEqual({ type: "team", role: "volunteer", memberUids: ["uid-ana-123"] });
    expect(publicConfig({ type: "team", role: "organizer", memberUids: null })).toEqual({ type: "team", role: "organizer", memberUids: null });
    expect(publicConfig({ type: "squads" })).toEqual({ type: "squads" });
    expect(publicConfig({ type: "speaker", speakerIds: null })).toEqual({ type: "speaker", speakerIds: null });
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
    expect(publicConfig({ type: "speaker", speakerIds: ["ana-torres"] })).toEqual({ type: "speaker", speakerIds: ["ana-torres"] });
    expect(publicConfig({ type: "talk", checkpointId: "talk-keynote" })).toEqual({ type: "talk" });
    expect(publicConfig({ type: "stand", checkpointId: "stand-ai-1" })).toEqual({ type: "stand" });
  });
});
