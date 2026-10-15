import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";

vi.mock("server-only", () => ({}));
const missions = { missionSource: { list: vi.fn() } };
vi.mock("@/app-shell/composition/missions.server", () => missions);
vi.mock("@/app-shell/composition/quadrants.server", () => ({ galaxyDeps: {} }));
vi.mock("@/features/missions/server", () => ({ DEFAULT_MISSIONS: [{ id: "keynote", title: "Charla inaugural", order: 0 }] }));
const quadrants = { getGalaxyMap: vi.fn() };
vi.mock("@/features/quadrants/server", () => quadrants);

const { loadOdysseyFormOptions } = await import("./form-options.server");

describe("loadOdysseyFormOptions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    quadrants.getGalaxyMap.mockResolvedValue(ok({ quadrants: [{ id: "ai", name: "AI", planet: "ai" }] }));
  });

  it("offers the active quadrants and the edition's missions in order", async () => {
    missions.missionSource.list.mockResolvedValue(ok([{ id: "b-one", title: "Segunda", order: 2 }, { id: "a-one", title: "Primera", order: 1 }]));

    expect(await loadOdysseyFormOptions()).toEqual({
      quadrants: [{ id: "ai", name: "AI" }],
      missions: [
        { id: "a-one", name: "Primera" },
        { id: "b-one", name: "Segunda" },
      ],
    });
  });

  it("offers the bundled missions while the edition has none, and fails loudly on a failed read", async () => {
    missions.missionSource.list.mockResolvedValue(ok([]));
    expect((await loadOdysseyFormOptions()).missions).toEqual([{ id: "keynote", name: "Charla inaugural" }]);

    missions.missionSource.list.mockResolvedValue(err({ code: "x" }));
    await expect(loadOdysseyFormOptions()).rejects.toThrow("Could not read the missions");
    quadrants.getGalaxyMap.mockResolvedValue(err({ code: "x" }));
    await expect(loadOdysseyFormOptions()).rejects.toThrow("Could not read the quadrants");
  });
});
