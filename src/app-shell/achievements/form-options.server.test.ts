import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/ranks.server", () => ({ rankDeps: { marker: "ranks" } }));
const odyssey = { loadOdysseyFormOptions: vi.fn() };
vi.mock("@/app-shell/odyssey/form-options.server", () => odyssey);
const attendee = { getEditionLadder: vi.fn() };
vi.mock("@/features/attendee/server", () => attendee);

const { createRankLadder } = await import("@/features/attendee");
const { loadAchievementFormOptions, ruleNamesOf } = await import("./form-options.server");

describe("loadAchievementFormOptions", () => {
  it("offers the quadrants and missions, and the levels by the edition's names", async () => {
    odyssey.loadOdysseyFormOptions.mockResolvedValue({ quadrants: [{ id: "ai", name: "IA" }], missions: [{ id: "ai-quiz", name: "Quiz de IA" }] });
    attendee.getEditionLadder.mockResolvedValue(createRankLadder([{ id: "recruit", minXp: 0 }, { id: "ace", minXp: 50, name: "As" }]));

    const options = await loadAchievementFormOptions();

    expect(options).toEqual({
      quadrants: [{ id: "ai", name: "IA" }],
      missions: [{ id: "ai-quiz", name: "Quiz de IA" }],
      levels: [
        { level: 1, name: "Recluta" },
        { level: 2, name: "As" },
      ],
    });
    expect(attendee.getEditionLadder).toHaveBeenCalledWith({ marker: "ranks" });
    expect(ruleNamesOf(options)).toEqual({ quadrants: { ai: "IA" }, missions: { "ai-quiz": "Quiz de IA" } });
  });
});
