import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/checkpoint-admin.server", () => ({ checkpointAdminDeps: { marker: "checkpoints" } }));
vi.mock("@/app-shell/composition/quadrants.server", () => ({ galaxyDeps: { marker: "galaxy" } }));
const economy = { currentEconomy: vi.fn() };
vi.mock("@/app-shell/composition/economy.server", () => economy);
const minigames = { currentMinigameSettings: vi.fn() };
vi.mock("@/app-shell/composition/minigames.server", () => minigames);
const features = vi.hoisted(() => ({ FEATURES: { minigames: true } }));
vi.mock("@/shared/config/features", () => features);

const checkpointsServer = { listCheckpoints: vi.fn() };
vi.mock("@/features/checkpoints/server", () => checkpointsServer);
const quadrantsServer = { getGalaxyMap: vi.fn() };
vi.mock("@/features/quadrants/server", () => quadrantsServer);

const { loadMissionFormOptions } = await import("./form-options.server");
const { DEFAULT_MINIGAME_SETTINGS } = await import("@/features/minigames");

const ADMIN = { uid: "a1", role: "admin" } as const;
const checkpoint = (id: string, kind: string, active = true) => ({ id, kind, name: `Puesto ${id}`, active });

describe("loadMissionFormOptions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.minigames = true;
    minigames.currentMinigameSettings.mockResolvedValue({
      ...DEFAULT_MINIGAME_SETTINGS,
      games: { ...DEFAULT_MINIGAME_SETTINGS.games, circuits: { enabled: false, difficulty: "hard" } },
    });
    economy.currentEconomy.mockResolvedValue({ creditsEnabled: true, missionCredits: { talk: 10, stand: 10, quiz: 5, keyword: 5 } });
    quadrantsServer.getGalaxyMap.mockResolvedValue({ ok: true, value: { quadrants: [{ id: "ai", name: "AI", planet: "ai" }] } });
    checkpointsServer.listCheckpoints.mockResolvedValue({
      ok: true,
      value: [checkpoint("talk-1", "talk"), checkpoint("talk-off", "talk", false), checkpoint("stand-1", "stand"), checkpoint("lunch", "catering"), checkpoint("door", "entrance")],
    });
  });

  it("offers the active quadrants and the open talks and stands, as plain options", async () => {
    expect(await loadMissionFormOptions(ADMIN)).toEqual({
      quadrants: [{ id: "ai", name: "AI" }],
      checkpoints: { talk: [{ id: "talk-1", name: "Puesto talk-1" }], stand: [{ id: "stand-1", name: "Puesto stand-1" }] },
      creditDefaults: { talk: 10, stand: 10, quiz: 5, keyword: 5 },
      minigames: [
        { id: "bug-kong", name: "Bug Kong", enabled: true, difficulty: "normal" },
        { id: "bug-invaders", name: "Invasores de bugs", enabled: true, difficulty: "normal" },
        { id: "circuits", name: "Conecta los circuitos", enabled: false, difficulty: "hard" },
        { id: "code-order", name: "Ordena el código", enabled: true, difficulty: "normal" },
        { id: "warp-timing", name: "Salto en el momento justo", enabled: true, difficulty: "normal" },
      ],
    });
    expect(checkpointsServer.listCheckpoints).toHaveBeenCalledWith({ marker: "checkpoints" }, ADMIN);
  });

  it("offers no G-Credit defaults when the edition gives none", async () => {
    economy.currentEconomy.mockResolvedValue({ creditsEnabled: false, missionCredits: { talk: 10, stand: 10, quiz: 5, keyword: 5 } });

    expect(await loadMissionFormOptions(ADMIN)).not.toHaveProperty("creditDefaults");
  });

  it("offers no mini-games when they are switched off", async () => {
    features.FEATURES.minigames = false;

    expect(await loadMissionFormOptions(ADMIN)).not.toHaveProperty("minigames");
    expect(minigames.currentMinigameSettings).not.toHaveBeenCalled();
  });

  it("fails loudly instead of offering an empty form", async () => {
    quadrantsServer.getGalaxyMap.mockResolvedValueOnce({ ok: false, error: { code: "unknown" } });
    await expect(loadMissionFormOptions(ADMIN)).rejects.toThrow("Could not read the quadrants");

    checkpointsServer.listCheckpoints.mockResolvedValueOnce({ ok: false, error: { code: "unknown" } });
    await expect(loadMissionFormOptions(ADMIN)).rejects.toThrow("Could not read the checkpoints");
  });
});
