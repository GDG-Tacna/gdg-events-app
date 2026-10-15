import "server-only";
import { missionCreditsFor } from "@/features/economy/server";
import {
  CachedMissionSource,
  DEFAULT_MISSIONS,
  FirestoreCompletionStore,
  FirestoreMissionSource,
  type SubmitProofDeps,
} from "@/features/missions/server";
import { InMemoryAttemptLimiter } from "@/features/checkins/server";
import { currentEconomy, rewardLedger } from "./economy.server";
import { perEdition } from "./per-edition";

/** The edition's missions, kept for a minute. Admin changes invalidate it. */
export const missionSource = perEdition(() => new CachedMissionSource(new FirestoreMissionSource()));

/**
 * Composition root for missions: stored missions (or the bundled set until the edition has its own),
 * completions, the reward ledger (XP and G-Credits), the edition's economy for each mission's credits,
 * and a limiter of 20 typed answers a minute per attendee.
 */
export const missionDeps: SubmitProofDeps = {
  source: missionSource,
  completions: new FirestoreCompletionStore(),
  defaults: DEFAULT_MISSIONS,
  xp: rewardLedger,
  credits: { creditsFor: async (type, own) => missionCreditsFor(await currentEconomy(), type, own) },
  limiter: new InMemoryAttemptLimiter({ maxAttempts: 20, windowMs: 60_000 }),
};
