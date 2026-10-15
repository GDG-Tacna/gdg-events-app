import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { suggestMissions, type SuggestDeps, type SuggesterErrorCode } from "./suggest";

const ADMIN = { uid: "a1", role: "admin" } as const;
const QUIZ = { type: "quiz", title: "Desafío Gemini", description: "Responde", question: "¿Qué es Gemini?", options: ["Un modelo", "Un lenguaje", "Un editor", "Una base"], answer: 0 };
const KEYWORD = { type: "keyword", title: "Clave estelar", description: "Pide la clave", prompt: "Pide la palabra en el stand", keywords: ["Red Neuronal"] };
const INPUT = { topic: "Charla sobre Gemini y agentes de IA", quadrantId: "ai", types: ["quiz", "keyword"], count: 3 };

function setup(items: unknown[] = [QUIZ, KEYWORD]) {
  const deps = {
    suggester: { suggest: vi.fn(async (): Promise<Result<readonly unknown[], { code: SuggesterErrorCode }>> => ok(items)) },
    quadrants: { list: vi.fn(async () => ok([{ id: "ai", name: "AI" }])) },
    limiter: { consume: vi.fn(async () => true) },
  } satisfies SuggestDeps;
  return deps;
}

describe("suggestMissions", () => {
  let deps: ReturnType<typeof setup>;
  beforeEach(() => {
    deps = setup();
  });

  it("asks for drafts about the topic and quadrant, and returns them checked, with ids and default XP", async () => {
    const result = await suggestMissions(deps, ADMIN, INPUT);

    expect(deps.suggester.suggest).toHaveBeenCalledWith({ topic: "Charla sobre Gemini y agentes de IA", quadrantName: "AI", types: ["quiz", "keyword"], count: 3 });
    expect(result).toEqual(
      ok([
        { id: "ai-desafio-gemini", draft: { title: "Desafío Gemini", description: "Responde", quadrantId: "ai", xp: 40, config: { type: "quiz", question: "¿Qué es Gemini?", options: QUIZ.options, answer: 0 } } },
        { id: "ai-clave-estelar", draft: { title: "Clave estelar", description: "Pide la clave", quadrantId: "ai", xp: 40, config: { type: "keyword", prompt: "Pide la palabra en el stand", keywords: ["red neuronal"] } } },
      ]),
    );
  });

  it("drops drafts that break the rules, are of another type, or were not asked for", async () => {
    const bad = setup([
      QUIZ,
      { ...QUIZ, answer: 7 },
      { ...QUIZ, options: ["Solo una"] },
      { type: "talk", title: "Charla", description: "x", checkpointId: "talk-1" },
      KEYWORD,
      "texto suelto",
      { ...KEYWORD, keywords: [] },
    ]);

    const result = await suggestMissions(bad, ADMIN, { ...INPUT, types: ["keyword"] });

    expect(result.ok && result.value.map((s) => s.id)).toEqual(["ai-clave-estelar"]);
    expect(bad.suggester.suggest).toHaveBeenCalledWith(expect.objectContaining({ types: ["keyword"] }));
  });

  it("keeps ids unique and returns at most the count asked for", async () => {
    const many = setup([QUIZ, QUIZ, QUIZ]);

    const result = await suggestMissions(many, ADMIN, { ...INPUT, count: 2 });

    expect(result.ok && result.value.map((s) => s.id)).toEqual(["ai-desafio-gemini", "ai-desafio-gemini-2"]);
  });

  it("says when nothing usable came back", async () => {
    expect(await suggestMissions(setup([{ type: "quiz" }]), ADMIN, INPUT)).toEqual(err({ code: "empty" }));
  });

  it.each([
    ["a short topic", { topic: "  corto " }, "invalid-topic"],
    ["a long topic", { topic: "x".repeat(1501) }, "invalid-topic"],
    ["no types it can draft", { types: ["talk"] }, "invalid-types"],
    ["an inactive quadrant", { quadrantId: "android" }, "unknown-quadrant"],
  ])("refuses %s before asking the model", async (_, change, code) => {
    expect(await suggestMissions(deps, ADMIN, { ...INPUT, ...change })).toEqual(err({ code }));
    expect(deps.suggester.suggest).not.toHaveBeenCalled();
  });

  it("clamps the count between 1 and 5", async () => {
    await suggestMissions(deps, ADMIN, { ...INPUT, count: 50 });
    await suggestMissions(deps, ADMIN, { ...INPUT, count: 0 });

    expect(vi.mocked(deps.suggester.suggest).mock.calls.map((call) => (call as unknown as [{ count: number }])[0].count)).toEqual([5, 1]);
  });

  it("is only for admins, and limited per admin", async () => {
    expect(await suggestMissions(deps, { uid: "s1", role: "staff" }, INPUT)).toEqual(err({ code: "forbidden" }));
    deps.limiter.consume.mockResolvedValueOnce(false);
    expect(await suggestMissions(deps, ADMIN, INPUT)).toEqual(err({ code: "rate-limited" }));
    expect(deps.limiter.consume).toHaveBeenCalledWith("a1");
    expect(deps.suggester.suggest).not.toHaveBeenCalled();
  });

  it("passes the model's failures on by kind, and a failed quadrant read", async () => {
    deps.suggester.suggest.mockResolvedValueOnce(err({ code: "quota" }));
    expect(await suggestMissions(deps, ADMIN, INPUT)).toEqual(err({ code: "quota" }));

    deps.quadrants.list.mockResolvedValueOnce(err({ code: "x" }) as never);
    expect(await suggestMissions(deps, ADMIN, INPUT)).toEqual(err({ code: "unknown" }));
  });
});
