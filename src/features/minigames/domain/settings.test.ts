import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { MINIGAMES, MINIGAME_IDS, ticketSeconds } from "./catalog";
import { DEFAULT_MINIGAME_SETTINGS, getMinigameSettings, getMinigameSettingsForEdit, parseMinigameSettings, saveMinigameSettings, type MinigameAdminDeps } from "./settings";

const NOW = new Date("2026-10-24T15:00:00Z");
const valid = () => ({
  games: Object.fromEntries(MINIGAME_IDS.map((id) => [id, { enabled: true, difficulty: "normal" }])),
  codeLanguages: ["javascript", "python"],
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("catalog", () => {
  it("has the five planned games, each with a minimum below every time limit", () => {
    expect(MINIGAME_IDS).toEqual(["bug-kong", "bug-invaders", "circuits", "code-order", "warp-timing"]);
    for (const id of MINIGAME_IDS) {
      for (const limit of Object.values(MINIGAMES[id].maxSeconds)) {
        expect(MINIGAMES[id].minSeconds).toBeLessThan(limit);
        expect(limit).toBeLessThanOrEqual(90);
      }
    }
  });

  it("gives a ticket the game's time limit plus two minutes", () => {
    expect(ticketSeconds("bug-kong", "easy")).toBe(195);
    expect(ticketSeconds("code-order", "hard")).toBe(155);
  });
});

describe("parseMinigameSettings", () => {
  it("reads every game with its state and difficulty, and the languages in a fixed order", () => {
    const input = valid();
    input.games["bug-kong"] = { enabled: false, difficulty: "hard" };
    input.codeLanguages = ["python", "javascript"];

    expect(parseMinigameSettings(input)).toEqual({ games: { ...valid().games, "bug-kong": { enabled: false, difficulty: "hard" } }, codeLanguages: ["javascript", "python"] });
  });

  it.each([
    ["not an object", null],
    ["no games", { codeLanguages: ["python"] }],
    ["a game missing", { ...valid(), games: { ...valid().games, circuits: undefined } }],
    ["an unknown difficulty", { ...valid(), games: { ...valid().games, circuits: { enabled: true, difficulty: "insane" } } }],
    ["a state that is not a boolean", { ...valid(), games: { ...valid().games, circuits: { enabled: "yes", difficulty: "easy" } } }],
    ["no language", { ...valid(), codeLanguages: [] }],
    ["an unknown language", { ...valid(), codeLanguages: ["cobol"] }],
    ["languages that are not a list", { ...valid(), codeLanguages: "python" }],
  ])("refuses %s", (_case, input) => {
    expect(parseMinigameSettings(input)).toBeNull();
  });

  it("starts with every game enabled at normal, in both languages", () => {
    expect(parseMinigameSettings(DEFAULT_MINIGAME_SETTINGS)).toEqual(DEFAULT_MINIGAME_SETTINGS);
    expect(Object.values(DEFAULT_MINIGAME_SETTINGS.games).every((game) => game.enabled && game.difficulty === "normal")).toBe(true);
  });
});

describe("settings use cases", () => {
  const setup = (read = ok(null) as Awaited<ReturnType<MinigameAdminDeps["store"]["read"]>>, save = ok(undefined) as Awaited<ReturnType<MinigameAdminDeps["store"]["save"]>>) => {
    const deps: MinigameAdminDeps = {
      store: { read: vi.fn(async () => read), save: vi.fn(async () => save) },
      audit: { append: vi.fn(async () => ok(undefined)) },
      now: () => NOW,
    };
    return deps;
  };

  it("serves the saved settings, or the defaults when none are saved or the read fails", async () => {
    const saved = parseMinigameSettings({ ...valid(), codeLanguages: ["python"] })!;
    expect(await getMinigameSettings(setup(ok(saved)))).toEqual(saved);
    expect(await getMinigameSettings(setup())).toEqual(DEFAULT_MINIGAME_SETTINGS);
    expect(await getMinigameSettings(setup(err({ code: "unknown" })))).toEqual(DEFAULT_MINIGAME_SETTINGS);
  });

  it("shows the admin the settings and whether they are still the defaults", async () => {
    expect(await getMinigameSettingsForEdit(setup(), { role: "admin" })).toEqual(ok({ settings: DEFAULT_MINIGAME_SETTINGS, isDefault: true }));
    expect(await getMinigameSettingsForEdit(setup(ok(DEFAULT_MINIGAME_SETTINGS)), { role: "admin" })).toEqual(ok({ settings: DEFAULT_MINIGAME_SETTINGS, isDefault: false }));
    expect(await getMinigameSettingsForEdit(setup(), { role: "staff" })).toEqual(err({ code: "forbidden" }));
    expect(await getMinigameSettingsForEdit(setup(err({ code: "unknown" })), { role: "admin" })).toEqual(err({ code: "unknown" }));
  });

  it("saves valid settings and audits each game's difficulty or off", async () => {
    const deps = setup();
    const input = valid();
    input.games.circuits = { enabled: false, difficulty: "easy" };
    input.games["bug-kong"] = { enabled: true, difficulty: "hard" };

    expect(await saveMinigameSettings(deps, { uid: "a1", role: "admin" }, input)).toMatchObject({ ok: true });
    expect(deps.store.save).toHaveBeenCalledWith(parseMinigameSettings(input));
    expect(deps.audit.append).toHaveBeenCalledWith({
      action: "minigames.updated",
      actorUid: "a1",
      targetUid: "minigames",
      details: { "bug-kong": "hard", "bug-invaders": "normal", circuits: "off", "code-order": "normal", "warp-timing": "normal", codeLanguages: "javascript,python" },
      at: NOW,
    });
  });

  it("refuses non-admins and invalid settings, and reports a failed save without auditing", async () => {
    const deps = setup(undefined, err({ code: "unknown" }));

    expect(await saveMinigameSettings(deps, { uid: "s1", role: "staff" }, valid())).toEqual(err({ code: "forbidden" }));
    expect(await saveMinigameSettings(deps, { uid: "a1", role: "admin" }, { games: {} })).toEqual(err({ code: "invalid-settings" }));
    expect(await saveMinigameSettings(deps, { uid: "a1", role: "admin" }, valid())).toEqual(err({ code: "unknown" }));
    expect(deps.audit.append).not.toHaveBeenCalled();
  });
});
