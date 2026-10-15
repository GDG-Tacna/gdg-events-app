import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/minigames.server", () => ({ minigameAdminDeps: { marker: "minigames" } }));
const cache = { revalidatePath: vi.fn() };
vi.mock("next/cache", () => cache);

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { saveMinigameSettings: vi.fn() };
vi.mock("@/features/minigames/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { admin: true, minigames: true } }));
vi.mock("@/shared/config/features", () => features);

const { saveMinigameSettingsAction } = await import("./settings.actions");
const { DEFAULT_MINIGAME_SETTINGS } = await import("@/features/minigames/domain/settings");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });
const SETTINGS = { games: { ...DEFAULT_MINIGAME_SETTINGS.games }, codeLanguages: ["python"] };

describe("saveMinigameSettingsAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.minigames = true;
    guards.getSession.mockResolvedValue(session("admin"));
    server.saveMinigameSettings.mockResolvedValue({ ok: true, value: SETTINGS });
  });

  it("is off with the admin or the mini-games switched off", async () => {
    features.FEATURES.minigames = false;
    expect(await saveMinigameSettingsAction(SETTINGS)).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.minigames = true;
    features.FEATURES.admin = false;
    expect(await saveMinigameSettingsAction(SETTINGS)).toEqual({ ok: false, code: "disabled" });
    expect(guards.getSession).not.toHaveBeenCalled();
  });

  it("is only for admins", async () => {
    guards.getSession.mockResolvedValue(null);
    expect(await saveMinigameSettingsAction(SETTINGS)).toEqual({ ok: false, code: "unauthenticated" });
    guards.getSession.mockResolvedValue(session("staff"));
    expect(await saveMinigameSettingsAction(SETTINGS)).toEqual({ ok: false, code: "forbidden" });
    expect(server.saveMinigameSettings).not.toHaveBeenCalled();
  });

  it("saves with the actor of the session and drops the cached mission pages", async () => {
    expect(await saveMinigameSettingsAction(SETTINGS)).toEqual({ ok: true });

    expect(server.saveMinigameSettings).toHaveBeenCalledWith({ marker: "minigames" }, { uid: "a1", role: "admin" }, SETTINGS);
    expect(cache.revalidatePath).toHaveBeenCalledWith("/missions", "layout");
  });

  it.each([
    ["no games", { codeLanguages: ["python"] }],
    ["a game that is not an object", { games: { circuits: "on" }, codeLanguages: ["python"] }],
    ["languages that are not a list", { games: {}, codeLanguages: "python" }],
  ])("rejects %s before touching the use case", async (_, input) => {
    expect(await saveMinigameSettingsAction(input as never)).toEqual({ ok: false, code: "invalid-settings" });
    expect(server.saveMinigameSettings).not.toHaveBeenCalled();
  });

  it("passes a refusal through and keeps the cache", async () => {
    server.saveMinigameSettings.mockResolvedValue({ ok: false, error: { code: "invalid-settings" } });

    expect(await saveMinigameSettingsAction(SETTINGS)).toEqual({ ok: false, code: "invalid-settings" });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
