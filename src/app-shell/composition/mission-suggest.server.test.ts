import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./quadrants.server", () => ({ galaxyDeps: {} }));
const quadrants = { getGalaxyMap: vi.fn() };
vi.mock("@/features/quadrants/server", () => quadrants);

const { DEFAULT_GEMINI_MODEL, missionSuggestDeps } = await import("./mission-suggest.server");

describe("mission suggestion composition", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses a free-tier model with structured output by default", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.1-flash-lite");
  });

  it("without a key on the server answers not-configured and calls no one", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const send = vi.fn();
    vi.stubGlobal("fetch", send);

    const result = await missionSuggestDeps.suggester.suggest({ topic: "Charla sobre IA", quadrantName: "AI", types: ["quiz"], count: 1 });

    expect(result).toEqual({ ok: false, error: { code: "not-configured" } });
    expect(send).not.toHaveBeenCalled();
  });

  it("lists the edition's active quadrants by name", async () => {
    quadrants.getGalaxyMap.mockResolvedValueOnce({ ok: true, value: { quadrants: [{ id: "ai", name: "AI", planet: "ai" }] } });
    expect(await missionSuggestDeps.quadrants.list()).toEqual({ ok: true, value: [{ id: "ai", name: "AI" }] });

    quadrants.getGalaxyMap.mockResolvedValueOnce({ ok: false, error: { code: "unknown" } });
    expect(await missionSuggestDeps.quadrants.list()).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
