import { logServerError } from "@/shared/lib/log";
import type { Result } from "@/shared/lib/result";

/**
 * The title of the edition's story, what cadets read on their log and on the missions board ("Odisea de
 * Código" in 2026, something else in a pirate edition). Optional: without one the app says "Historia".
 */
export const STORY_TITLE_MIN = 3;
export const STORY_TITLE_MAX = 40;

export interface StoryTitleSource {
  readTitle(): Promise<Result<string | null, { code: string }>>;
}

export interface StoryTitleStore extends StoryTitleSource {
  saveTitle(title: string | null): Promise<Result<void, { code: string }>>;
}

/** A blank title clears it; otherwise it is trimmed, with single spaces, and must fit the limits. */
export function checkStoryTitle(input: unknown): { ok: true; value: string | null } | { ok: false } {
  if (typeof input !== "string") return { ok: false };
  const title = input.trim().replace(/\s+/g, " ");
  if (title.length === 0) return { ok: true, value: null };
  return title.length >= STORY_TITLE_MIN && title.length <= STORY_TITLE_MAX ? { ok: true, value: title } : { ok: false };
}

/** A stored title, or `null` when there is none or it breaks the rules. */
export function parseStoryTitle(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const checked = checkStoryTitle((data as { title?: unknown }).title);
  return checked.ok ? checked.value : null;
}

/** The title cadets see, or `null` for the generic name. It only names the story: a failed read is logged and shows the generic name. */
export async function getStoryTitle(source: StoryTitleSource): Promise<string | null> {
  const read = await source.readTitle();
  if (read.ok) return read.value;
  logServerError("odyssey.story.title", new Error(`story title unreadable: ${read.error.code}`));
  return null;
}
