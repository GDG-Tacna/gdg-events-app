import "server-only";
import { InMemoryAttemptLimiter } from "@/features/checkins/server";
import { GeminiMissionSuggester, type SuggestDeps } from "@/features/missions/server";
import { getGalaxyMap } from "@/features/quadrants/server";
import { err, ok } from "@/shared/lib/result";
import { galaxyDeps } from "./quadrants.server";

/** The model when `GEMINI_MODEL` is not set: on the free tier, with structured output (checked 2026-10-09). */
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

/**
 * Composition root for AI mission suggestions. The key is read on the server only (never a public
 * variable); the quadrants come from the galaxy map; each admin may ask 5 times a minute, which keeps the
 * free tier's per-minute quota for everyone.
 */
export const missionSuggestDeps: SuggestDeps = {
  suggester: new GeminiMissionSuggester({
    get apiKey() {
      return process.env.GEMINI_API_KEY || undefined;
    },
    model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
  }),
  quadrants: {
    list: async () => {
      const galaxy = await getGalaxyMap(galaxyDeps);
      return galaxy.ok ? ok(galaxy.value.quadrants.map(({ id, name }) => ({ id, name }))) : err({ code: "unknown" });
    },
  },
  limiter: new InMemoryAttemptLimiter({ maxAttempts: 5, windowMs: 60_000 }),
};
