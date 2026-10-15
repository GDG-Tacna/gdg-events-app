import { err, ok, type Result } from "@/shared/lib/result";
import type { MissionDraft } from "./manage";
import { checkMission, DEFAULT_XP, isMissionId } from "./mission";

/** The types an AI can draft: their proof is text. Talk and stand missions need a real checkpoint. */
export const SUGGESTABLE_TYPES = ["quiz", "keyword"] as const;
export type SuggestableType = (typeof SUGGESTABLE_TYPES)[number];

export const SUGGEST_TOPIC_MIN = 10;
export const SUGGEST_TOPIC_MAX = 1500;
export const SUGGEST_COUNT_MAX = 5;

export interface SuggestionRequest {
  /** What the talk or stand is about, written by the admin. Treated as data by the suggester. */
  topic: string;
  quadrantName: string;
  types: readonly SuggestableType[];
  count: number;
}

export type SuggesterErrorCode = "not-configured" | "quota" | "unavailable" | "unknown";

/** Drafts mission ideas from a description (an AI model). Returns raw items: they are checked here, never trusted. */
export interface MissionSuggester {
  suggest(request: SuggestionRequest): Promise<Result<readonly unknown[], { code: SuggesterErrorCode }>>;
}

/** The edition's active quadrants, with names (to tell the model what the quadrant is). */
export interface QuadrantList {
  list(): Promise<Result<ReadonlyArray<{ id: string; name: string }>, { code: string }>>;
}

export interface SuggestDeps {
  suggester: MissionSuggester;
  quadrants: QuadrantList;
  /** Limits how often one admin asks (the free tier allows few requests a minute). */
  limiter: { consume(uid: string): Promise<boolean> };
}

export type SuggestErrorCode =
  | "invalid-topic"
  | "invalid-types"
  | "unknown-quadrant"
  | "rate-limited"
  | "empty"
  | SuggesterErrorCode
  | "unauthenticated"
  | "forbidden"
  | "disabled";

/** A drafted mission, checked like one the admin typed. Nothing is saved: the admin reviews and saves it. */
export interface SuggestedMission {
  id: string;
  draft: MissionDraft & { config: unknown };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const slug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36)
    .replace(/-+$/g, "");

/** One raw item to a draft of its type, or `null` when it is not a quiz or keyword mission. */
function toDraft(item: unknown, quadrantId: string, types: readonly SuggestableType[]): { type: SuggestableType; draft: MissionDraft } | null {
  if (!isRecord(item) || !types.includes(item.type as SuggestableType)) return null;
  const type = item.type as SuggestableType;
  const base = {
    title: typeof item.title === "string" ? item.title : "",
    description: typeof item.description === "string" ? item.description : "",
    quadrantId,
    xp: DEFAULT_XP[type],
  };
  const config =
    type === "quiz"
      ? { type, question: item.question, options: item.options, answer: item.answer }
      : { type, prompt: item.prompt, keywords: item.keywords };
  return { type, draft: { ...base, config } };
}

/**
 * Asks the suggester for mission drafts about a talk or stand and keeps only those that pass the same checks
 * as a mission the admin types (a wrong one is dropped, never fixed up). Each gets an id from its title,
 * unique among the drafts. Admin only, and limited per admin.
 */
export async function suggestMissions(
  deps: SuggestDeps,
  actor: { uid: string; role: "attendee" | "staff" | "admin" | null },
  input: { topic: string; quadrantId: string; types: readonly string[]; count: number },
): Promise<Result<readonly SuggestedMission[], { code: SuggestErrorCode }>> {
  if (actor.role !== "admin") return err({ code: "forbidden" });

  const topic = input.topic.trim();
  if (topic.length < SUGGEST_TOPIC_MIN || topic.length > SUGGEST_TOPIC_MAX) return err({ code: "invalid-topic" });
  const types = SUGGESTABLE_TYPES.filter((type) => input.types.includes(type));
  if (types.length === 0) return err({ code: "invalid-types" });
  const count = Math.min(Math.max(Math.trunc(input.count) || 1, 1), SUGGEST_COUNT_MAX);

  const quadrants = await deps.quadrants.list();
  if (!quadrants.ok) return err({ code: "unknown" });
  const quadrant = quadrants.value.find((candidate) => candidate.id === input.quadrantId);
  if (!quadrant) return err({ code: "unknown-quadrant" });

  if (!(await deps.limiter.consume(actor.uid))) return err({ code: "rate-limited" });

  const raw = await deps.suggester.suggest({ topic, quadrantName: quadrant.name, types, count });
  if (!raw.ok) return err({ code: raw.error.code });

  const taken = new Set<string>();
  const suggestions: SuggestedMission[] = [];
  for (const item of raw.value) {
    const drafted = toDraft(item, quadrant.id, types);
    if (!drafted) continue;
    let id = slug(`${quadrant.id}-${drafted.draft.title}`);
    if (!isMissionId(id)) continue;
    for (let n = 2; taken.has(id); n += 1) id = `${slug(`${quadrant.id}-${drafted.draft.title}`).slice(0, 36)}-${n}`;
    const checked = checkMission(id, { ...drafted.draft, active: true });
    if (!checked.ok) continue;
    taken.add(id);
    const { title, description, quadrantId, xp, config } = checked.value;
    suggestions.push({ id, draft: { title, description, quadrantId, xp, config } });
    if (suggestions.length === count) break;
  }
  return suggestions.length > 0 ? ok(suggestions) : err({ code: "empty" });
}
