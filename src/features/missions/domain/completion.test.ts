import { describe, expect, it } from "vitest";
import { attemptsLeft, evaluate, type MissionCompletion } from "./completion";
import type { Mission, MissionConfig } from "./mission";

const mission = (config: MissionConfig, xp = 40): Mission => ({
  id: "m-1",
  title: "Misión",
  description: "",
  quadrantId: "ai",
  xp,
  order: 0,
  active: true,
  credits: null,
  minigame: null,
  minigameDifficulty: null,
  config,
});
const QUIZ = mission({ type: "quiz", question: "¿Q?", options: ["a", "b", "c"], answer: 2 });
const KEYWORD = mission({ type: "keyword", prompt: "Pide", keywords: ["red neuronal"] });
const STAND = mission({ type: "stand", checkpointId: "stand-ai-1" }, 30);
const TALK = mission({ type: "talk", checkpointId: "talk-keynote" }, 50);

const done = (status: MissionCompletion["status"], attempts = 0, xpEarned = 0): MissionCompletion => ({
  uid: "u1",
  missionId: "m-1",
  status,
  attempts,
  xpEarned,
  creditsEarned: 0,
  at: new Date(0),
});

describe("evaluate: quiz", () => {
  it("pays the full XP for a right first answer", () => {
    expect(evaluate(QUIZ, { kind: "choice", option: 2 }, null)).toEqual({ kind: "next", status: "completed", attempts: 0, xpEarned: 40, creditsEarned: 0 });
  });

  it("gives a second try after a wrong answer, and half the XP if it is right", () => {
    expect(evaluate(QUIZ, { kind: "choice", option: 0 }, null)).toEqual({ kind: "next", status: "in-progress", attempts: 1, xpEarned: 0, creditsEarned: 0 });
    expect(evaluate(QUIZ, { kind: "choice", option: 2 }, done("in-progress", 1))).toEqual({ kind: "next", status: "completed", attempts: 1, xpEarned: 20, creditsEarned: 0 });
  });

  it("rounds half the XP down", () => {
    expect(evaluate({ ...QUIZ, xp: 45 }, { kind: "choice", option: 2 }, done("in-progress", 1))).toMatchObject({ xpEarned: 22, creditsEarned: 0 });
  });

  it("fails the mission for good after two wrong answers", () => {
    expect(evaluate(QUIZ, { kind: "choice", option: 1 }, done("in-progress", 1))).toEqual({ kind: "next", status: "failed", attempts: 2, xpEarned: 0, creditsEarned: 0 });
  });

  it.each([
    ["an option out of range", { kind: "choice", option: 3 }],
    ["a negative option", { kind: "choice", option: -1 }],
    ["a fractional option", { kind: "choice", option: 1.5 }],
    ["a keyword", { kind: "keyword", value: "c" }],
    ["a scan", { kind: "checkpoint", checkpointId: "x" }],
  ] as const)("does not count %s as an attempt", (_, proof) => {
    expect(evaluate(QUIZ, proof, null)).toEqual({ kind: "wrong-proof" });
  });
});

describe("evaluate: credits", () => {
  it("shares the credits like the XP: all on a first right answer, half on a second, none on a wrong one", () => {
    expect(evaluate(QUIZ, { kind: "choice", option: 2 }, null, 5)).toMatchObject({ xpEarned: 40, creditsEarned: 5 });
    expect(evaluate(QUIZ, { kind: "choice", option: 2 }, done("in-progress", 1), 5)).toMatchObject({ xpEarned: 20, creditsEarned: 2 });
    expect(evaluate(QUIZ, { kind: "choice", option: 0 }, null, 5)).toMatchObject({ creditsEarned: 0 });
    expect(evaluate(STAND, { kind: "checkpoint", checkpointId: "stand-ai-1" }, null, 10)).toMatchObject({ creditsEarned: 10 });
    expect(evaluate(KEYWORD, { kind: "keyword", value: "red neuronal" }, null)).toMatchObject({ creditsEarned: 0 });
  });
});

describe("evaluate: keyword", () => {
  it("accepts the keyword whatever the case, accents or spaces", () => {
    expect(evaluate(KEYWORD, { kind: "keyword", value: "  Red  Neurónal " }, null)).toEqual({ kind: "next", status: "completed", attempts: 0, xpEarned: 40, creditsEarned: 0 });
  });

  it("never closes the mission on a wrong word, and pays the full XP when it comes", () => {
    let previous: MissionCompletion | null = null;
    for (let tries = 1; tries <= 5; tries += 1) {
      const next = evaluate(KEYWORD, { kind: "keyword", value: "otra" }, previous);
      expect(next).toEqual({ kind: "next", status: "in-progress", attempts: tries, xpEarned: 0, creditsEarned: 0 });
      previous = done("in-progress", tries);
    }
    expect(evaluate(KEYWORD, { kind: "keyword", value: "red neuronal" }, previous)).toEqual({ kind: "next", status: "completed", attempts: 5, xpEarned: 40, creditsEarned: 0 });
  });

  it("refuses a choice", () => {
    expect(evaluate(KEYWORD, { kind: "choice", option: 0 }, null)).toEqual({ kind: "wrong-proof" });
  });
});

describe("evaluate: talk and stand", () => {
  it("completes with the scan of its own checkpoint", () => {
    expect(evaluate(STAND, { kind: "checkpoint", checkpointId: "stand-ai-1" }, null)).toEqual({ kind: "next", status: "completed", attempts: 0, xpEarned: 30, creditsEarned: 0 });
    expect(evaluate(TALK, { kind: "checkpoint", checkpointId: "talk-keynote" }, null)).toMatchObject({ status: "completed", xpEarned: 50, creditsEarned: 0 });
  });

  it("refuses another checkpoint or a typed answer", () => {
    expect(evaluate(STAND, { kind: "checkpoint", checkpointId: "stand-ai-2" }, null)).toEqual({ kind: "wrong-proof" });
    expect(evaluate(TALK, { kind: "keyword", value: "talk-keynote" }, null)).toEqual({ kind: "wrong-proof" });
  });
});

describe("evaluate: closed missions", () => {
  it.each([QUIZ, KEYWORD, STAND])("changes nothing once completed or failed", (target) => {
    const proof = { kind: "choice", option: 2 } as const;
    expect(evaluate(target, proof, done("completed", 0, 40))).toEqual({ kind: "closed" });
    expect(evaluate(target, proof, done("failed", 2))).toEqual({ kind: "closed" });
  });
});

describe("attemptsLeft", () => {
  it("counts down for a quiz and is unlimited for other types", () => {
    expect(attemptsLeft(QUIZ, null)).toBe(2);
    expect(attemptsLeft(QUIZ, done("in-progress", 1))).toBe(1);
    expect(attemptsLeft(QUIZ, done("completed", 1, 20))).toBe(0);
    expect(attemptsLeft(QUIZ, done("failed", 2))).toBe(0);
    expect(attemptsLeft(KEYWORD, done("in-progress", 7))).toBeNull();
  });
});
