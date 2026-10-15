import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { CODE_LANGUAGES, MINIGAME_IDS, isDifficulty, type CodeLanguage, type Difficulty, type MinigameId } from "./catalog";

/** Which games an edition offers and how hard each one is. */
export interface MinigameSettings {
  games: Readonly<Record<MinigameId, { enabled: boolean; difficulty: Difficulty }>>;
  /** The languages "Ordena el código" uses (at least one). */
  codeLanguages: readonly CodeLanguage[];
}

/** Until the admin saves settings, every game is enabled at normal difficulty, in both languages. */
export const DEFAULT_MINIGAME_SETTINGS: MinigameSettings = {
  games: Object.fromEntries(MINIGAME_IDS.map((id) => [id, { enabled: true, difficulty: "normal" }])) as MinigameSettings["games"],
  codeLanguages: CODE_LANGUAGES,
};

/** Settings from the admin or a stored document, or `null` when they break the rules (every game, a known difficulty, a language). */
export function parseMinigameSettings(input: unknown): MinigameSettings | null {
  if (typeof input !== "object" || input === null) return null;
  const data = input as Record<string, unknown>;
  const games = typeof data.games === "object" && data.games !== null ? (data.games as Record<string, unknown>) : null;
  if (!games) return null;
  const parsed: Partial<Record<MinigameId, { enabled: boolean; difficulty: Difficulty }>> = {};
  for (const id of MINIGAME_IDS) {
    const game = games[id];
    if (typeof game !== "object" || game === null) return null;
    const { enabled, difficulty } = game as Record<string, unknown>;
    if (typeof enabled !== "boolean" || !isDifficulty(difficulty)) return null;
    parsed[id] = { enabled, difficulty };
  }
  const languages = Array.isArray(data.codeLanguages) ? data.codeLanguages : null;
  if (!languages || languages.length === 0 || !languages.every((language) => (CODE_LANGUAGES as readonly unknown[]).includes(language))) return null;
  return { games: parsed as MinigameSettings["games"], codeLanguages: CODE_LANGUAGES.filter((language) => languages.includes(language)) };
}

export interface MinigameSettingsStore {
  /** `null` when the edition has none saved, or what it saved breaks the rules. */
  read(): Promise<Result<MinigameSettings | null, { code: string }>>;
  save(settings: MinigameSettings): Promise<Result<void, { code: string }>>;
}

export interface MinigameAdminDeps {
  store: MinigameSettingsStore;
  audit: {
    append(entry: { action: "minigames.updated"; actorUid: string; targetUid: string; details: Record<string, string | null>; at: Date }): Promise<Result<void, { code: string }>>;
  };
  now: () => Date;
}

export type MinigameAdminErrorCode = "invalid-settings" | "unauthenticated" | "forbidden" | "disabled" | "unknown";

/** The edition's settings, or the defaults when none are saved or the read fails (a play never fails on them). */
export async function getMinigameSettings(deps: Pick<MinigameAdminDeps, "store">): Promise<MinigameSettings> {
  const read = await deps.store.read();
  if (!read.ok) {
    logServerError("minigames.settings.read", new Error("using the default mini-game settings"));
    return DEFAULT_MINIGAME_SETTINGS;
  }
  return read.value ?? DEFAULT_MINIGAME_SETTINGS;
}

/** The settings as the admin edits them, and whether they are still the defaults. */
export async function getMinigameSettingsForEdit(
  deps: Pick<MinigameAdminDeps, "store">,
  actor: { role: string | null },
): Promise<Result<{ settings: MinigameSettings; isDefault: boolean }, { code: MinigameAdminErrorCode }>> {
  if (actor.role !== "admin") return err({ code: "forbidden" });
  const read = await deps.store.read();
  if (!read.ok) return err({ code: "unknown" });
  return ok({ settings: read.value ?? DEFAULT_MINIGAME_SETTINGS, isDefault: read.value === null });
}

const describe = (settings: MinigameSettings) =>
  Object.fromEntries([
    ...MINIGAME_IDS.map((id) => [id, settings.games[id].enabled ? settings.games[id].difficulty : "off"]),
    ["codeLanguages", settings.codeLanguages.join(",")],
  ]) as Record<string, string>;

/** Saves which games the edition offers and their difficulty; audited. Plays already started keep their own. */
export async function saveMinigameSettings(
  deps: MinigameAdminDeps,
  actor: { uid: string; role: string | null },
  input: unknown,
): Promise<Result<MinigameSettings, { code: MinigameAdminErrorCode }>> {
  if (actor.role !== "admin") return err({ code: "forbidden" });
  const settings = parseMinigameSettings(input);
  if (!settings) return err({ code: "invalid-settings" });
  const saved = await deps.store.save(settings);
  if (!saved.ok) return err({ code: "unknown" });
  const written = await deps.audit.append({ action: "minigames.updated", actorUid: actor.uid, targetUid: "minigames", details: describe(settings), at: deps.now() });
  if (!written.ok) logServerError("minigames.audit.append", new Error("audit entry missing for minigames.updated"));
  return ok(settings);
}
