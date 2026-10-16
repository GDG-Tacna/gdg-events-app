import "server-only";
import { randomBytes } from "node:crypto";
import { FirestoreAuditLog } from "@/features/admin/server";
import { InMemoryAttemptLimiter } from "@/features/checkins/server";
import { currentEditionOf } from "@/features/event/server";
import { FirestorePollStore, type PollAdminDeps, type VoteDeps } from "@/features/polls/server";
import { ttlCached } from "@/shared/lib/ttl-cache";
import { currentEconomy, rewardLedger } from "./economy.server";
import { recordImages } from "./media.server";

/** The edition's polls and their votes. */
export const pollStore = new FirestorePollStore();

/** Composition root for the admin "Encuestas" screen. Option pictures go through the media feature. */
export const pollAdminDeps: PollAdminDeps = {
  store: pollStore,
  images: recordImages,
  audit: new FirestoreAuditLog(),
  newId: () => `poll-${randomBytes(6).toString("hex")}`,
  now: () => new Date(),
};

/**
 * The open poll, kept a few seconds per edition: every cadet's dashboard asks for it, so a burst of visits shares one
 * read. Opening or closing a poll clears it; the vote itself always reads the poll inside its transaction.
 */
export const keptOpenPoll = ttlCached(() => pollStore.openPoll(), { ttlMs: 5_000, key: currentEditionOf });

/** Composition root for voting: prizes go through the XP ledger, and votes share a per-cadet limiter. */
export const voteDeps: VoteDeps = {
  votes: { openPoll: () => keptOpenPoll(), myVote: (pollId, uid) => pollStore.myVote(pollId, uid), cast: (...args) => pollStore.cast(...args) },
  ledger: rewardLedger,
  creditsOn: async () => (await currentEconomy()).creditsEnabled,
  limiter: new InMemoryAttemptLimiter({ maxAttempts: 10, windowMs: 60_000 }),
  now: () => new Date(),
};
