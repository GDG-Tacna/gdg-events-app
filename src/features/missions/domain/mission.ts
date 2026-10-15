import type { ImageRef } from "@/features/media/constants";
/** Mission types: a closed set, because each one's proof is checked by code on the server. */
export const MISSION_TYPES = ["talk", "stand", "quiz", "keyword"] as const;
export type MissionType = (typeof MISSION_TYPES)[number];

/** XP a new mission of each type starts with; the admin can change it per mission. */
export const DEFAULT_XP: Record<MissionType, number> = { talk: 50, stand: 30, quiz: 40, keyword: 40 };

export const MISSION_XP_MAX = 500;
export const MISSION_CREDITS_MAX = 1000;
export const QUIZ_ATTEMPTS = 2;
export const QUIZ_OPTIONS_MIN = 2;
export const QUIZ_OPTIONS_MAX = 4;
export const KEYWORDS_MAX = 5;

/** The difficulties a mission may set for its mini-game (the same set as the mini-games catalog). */
export const MINIGAME_DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type MinigameDifficulty = (typeof MINIGAME_DIFFICULTIES)[number];
export const isMinigameDifficulty = (value: unknown): value is MinigameDifficulty =>
  typeof value === "string" && (MINIGAME_DIFFICULTIES as readonly string[]).includes(value);

/** What proves each type, and only the server ever sees it (answers and keywords never reach the client). */
export type MissionConfig =
  /** Completed by scanning the ephemeral QR of this talk. */
  | { type: "talk"; checkpointId: string }
  /** Completed by scanning the printed QR of this stand. */
  | { type: "stand"; checkpointId: string }
  /** Two attempts; a right second answer earns half the XP. `answer` is the index of the right option. */
  | { type: "quiz"; question: string; options: readonly string[]; answer: number }
  /** A word given at a stand or by a speaker. Stored normalized (`normalizeKeyword`). */
  | { type: "keyword"; prompt: string; keywords: readonly string[] };

/** A mission of one edition. Stable slug id; deactivated, never deleted. */
export interface Mission {
  id: string;
  title: string;
  description: string;
  quadrantId: string;
  xp: number;
  /** G-Credits it gives; `null` uses the edition's default for its type (Economía). */
  credits: number | null;
  order: number;
  active: boolean;
  /** The mini-game offered as a bonus once the mission is done (phase 5); `null` for none. */
  minigame: string | null;
  /** The mini-game's difficulty for this mission; `null` uses the edition's for that game. Always `null` without a game. */
  minigameDifficulty: MinigameDifficulty | null;
  config: MissionConfig;
  /** An uploaded picture shown instead of the type's icon; absent when there is none. */
  image?: ImageRef | null;
}

/** What an attendee may know about a mission: the question and its options, never the answer or the keywords. */
export type PublicMissionConfig =
  | { type: "talk" }
  | { type: "stand" }
  | { type: "quiz"; question: string; options: readonly string[] }
  | { type: "keyword"; prompt: string };

export function publicConfig(config: MissionConfig): PublicMissionConfig {
  switch (config.type) {
    case "talk":
    case "stand":
      return { type: config.type };
    case "quiz":
      return { type: "quiz", question: config.question, options: config.options };
    case "keyword":
      return { type: "keyword", prompt: config.prompt };
  }
}

/** A keyword as compared: trimmed, lowercase, without accents, inner spaces collapsed ("  Fuégo  Azul" → "fuego azul"). */
export function normalizeKeyword(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const isMissionId = (value: unknown): value is string => typeof value === "string" && SLUG.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, min: number, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
};

/** Why a mission cannot be offered, field by field, so the admin form can say what to fix. */
export type MissionDataErrorCode =
  | "invalid-id"
  | "invalid-title"
  | "invalid-description"
  | "invalid-quadrant"
  | "invalid-xp"
  | "invalid-type"
  | "invalid-checkpoint"
  | "invalid-question"
  | "invalid-options"
  | "invalid-answer"
  | "invalid-prompt"
  | "invalid-keywords"
  | "invalid-credits";

type Checked<T> = { ok: true; value: T } | { ok: false; code: MissionDataErrorCode };
const fail = (code: MissionDataErrorCode) => ({ ok: false, code }) as const;

function checkConfig(input: unknown): Checked<MissionConfig> {
  if (!isRecord(input)) return fail("invalid-type");
  switch (input.type) {
    case "talk":
    case "stand":
      return isMissionId(input.checkpointId) ? { ok: true, value: { type: input.type, checkpointId: input.checkpointId } } : fail("invalid-checkpoint");
    case "quiz": {
      const question = text(input.question, 5, 160);
      if (!question) return fail("invalid-question");
      if (!Array.isArray(input.options)) return fail("invalid-options");
      const options = input.options.map((option) => text(option, 1, 80));
      if (options.length < QUIZ_OPTIONS_MIN || options.length > QUIZ_OPTIONS_MAX || options.some((option) => option === null)) return fail("invalid-options");
      if (new Set(options.map((option) => option!.toLowerCase())).size !== options.length) return fail("invalid-options");
      const answer = input.answer;
      if (typeof answer !== "number" || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return fail("invalid-answer");
      return { ok: true, value: { type: "quiz", question, options: options as string[], answer } };
    }
    case "keyword": {
      const prompt = text(input.prompt, 5, 160);
      if (!prompt) return fail("invalid-prompt");
      if (!Array.isArray(input.keywords)) return fail("invalid-keywords");
      const keywords = input.keywords.map((keyword) => (typeof keyword === "string" ? normalizeKeyword(keyword) : ""));
      if (keywords.length === 0 || keywords.length > KEYWORDS_MAX || keywords.some((keyword) => keyword.length < 2 || keyword.length > 30)) return fail("invalid-keywords");
      return { ok: true, value: { type: "keyword", prompt, keywords: [...new Set(keywords)] } };
    }
    default:
      return fail("invalid-type");
  }
}

/**
 * Checks a mission from stored or admin-submitted data (the id comes from the document) and says which
 * field is wrong: bad id, title (3..60), description (up to 200), quadrant, XP out of 1..500, or a config
 * its type cannot check.
 */
export function checkMission(id: string, input: unknown): Checked<Mission> {
  if (!isMissionId(id)) return fail("invalid-id");
  if (!isRecord(input)) return fail("invalid-title");
  const title = text(input.title, 3, 60);
  if (!title) return fail("invalid-title");
  const description = input.description === undefined ? "" : text(input.description, 0, 200);
  if (description === null) return fail("invalid-description");
  if (!isMissionId(input.quadrantId)) return fail("invalid-quadrant");
  const { xp } = input;
  if (typeof xp !== "number" || !Number.isInteger(xp) || xp < 1 || xp > MISSION_XP_MAX) return fail("invalid-xp");
  const { credits } = input;
  if (credits !== undefined && credits !== null && (typeof credits !== "number" || !Number.isInteger(credits) || credits < 0 || credits > MISSION_CREDITS_MAX)) {
    return fail("invalid-credits");
  }
  const config = checkConfig(input.config);
  if (!config.ok) return config;
  const minigame = isMissionId(input.minigame) ? input.minigame : null;
  return {
    ok: true,
    value: {
      id,
      title,
      description,
      quadrantId: input.quadrantId,
      xp,
      credits: typeof credits === "number" ? credits : null,
      order: typeof input.order === "number" && Number.isFinite(input.order) ? input.order : Number.MAX_SAFE_INTEGER,
      active: input.active === true,
      minigame,
      minigameDifficulty: minigame !== null && isMinigameDifficulty(input.minigameDifficulty) ? input.minigameDifficulty : null,
      config: config.value,
    },
  };
}

/** `checkMission` for readers that only need to know whether a mission can be offered. */
export function parseMission(id: string, input: unknown): Mission | null {
  const checked = checkMission(id, input);
  return checked.ok ? checked.value : null;
}
