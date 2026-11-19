import "server-only";
import { missionCreditsFor } from "@/features/economy/server";
import {
  CachedMissionSource,
  FirestoreCompletionStore,
  FirestoreMissionSource,
  type SubmitProofDeps,
} from "@/features/missions/server";
import { FirestoreAttemptLimiter } from "@/features/checkins/server";
import { currentEconomy, rewardLedger } from "./economy.server";
import { perEdition } from "./per-edition";
import { squadProgress } from "./squad-progress.server";

/** The edition's missions, kept for a minute. Admin changes invalidate it. */
export const missionSource = perEdition(() => new CachedMissionSource(new FirestoreMissionSource()));

/**
 * Composition root for missions: stored missions (or the bundled set until the edition has its own),
 * completions, the reward ledger (XP and G-Credits), the edition's economy for each mission's credits,
 * the squads a cadet has met (for the cumulative squads mission), and a limiter of 20 typed answers a minute per
 * attendee, shared by every server instance (it is what stops a script from guessing keywords; one kept in memory
 * would allow 20 per instance).
 */
export const missionDeps: SubmitProofDeps = {
  source: missionSource,
  completions: new FirestoreCompletionStore(),
  xp: rewardLedger,
  credits: { creditsFor: async (type, own) => missionCreditsFor(await currentEconomy(), type, own) },
  squadProgress,
  limiter: new FirestoreAttemptLimiter({ scope: "mission-answer", maxAttempts: 20, windowMs: 60_000 }),
};
