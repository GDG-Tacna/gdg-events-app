import "server-only";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { imageRefOf } from "@/features/media/server";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { POLLS_COLLECTION, POLL_VOTES_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { PollContent, PollStore } from "../../domain/manage";
import { POLL_STATUSES, checkReward, isOptionId, isPollId, type Poll, type PollOption, type PollStatus, type PollTally } from "../../domain/poll";
import type { VoteStore } from "../../domain/vote";

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate: () => Date }).toDate();
  return null;
}

const isStatus = (value: unknown): value is PollStatus => typeof value === "string" && (POLL_STATUSES as readonly string[]).includes(value);

/** A stored poll, or `null` when it cannot be shown (a poll with a broken option is left out rather than half drawn). */
export function toPoll(id: string, data: DocumentData | undefined): Poll | null {
  if (!isPollId(id) || !data || typeof data.question !== "string" || !Array.isArray(data.options) || !isStatus(data.status)) return null;
  const options: PollOption[] = [];
  for (const raw of data.options as unknown[]) {
    const option = raw as Record<string, unknown> | null;
    if (!option || !isOptionId(option.id) || typeof option.text !== "string") return null;
    options.push({ id: option.id, text: option.text, image: typeof option.imagePath === "string" ? imageRefOf(option.imagePath, "poll-option") : null });
  }
  const rawReward = (data.reward ?? {}) as { kind?: unknown; amount?: unknown };
  const reward = checkReward({ kind: String(rawReward.kind ?? "none"), amount: Number(rawReward.amount ?? 0) });
  return {
    id,
    question: data.question,
    options,
    changeable: data.changeable === true,
    reward: reward.ok ? reward.value : { kind: "none" },
    status: data.status,
    createdAt: asDate(data.createdAt) ?? new Date(0),
    openedAt: asDate(data.openedAt),
    closedAt: asDate(data.closedAt),
  };
}

/** The stored fields of a poll's content: the options' pictures by their path only. */
function contentFields(content: PollContent): DocumentData {
  return {
    question: content.question,
    options: content.options.map((option) => ({ id: option.id, text: option.text, imagePath: option.image?.path ?? null })),
    changeable: content.changeable,
    reward: content.reward.kind === "none" ? { kind: "none", amount: 0 } : { ...content.reward },
  };
}

/**
 * Firestore adapter (Admin SDK) over `events/{eventId}/polls`, each with its votes in `votes/{uid}` (one per cadet, so a
 * vote is the cadet's document and a change overwrites it). Changes of state are transactions, so only one poll is
 * ever open and no vote lands after a poll closed. The tally counts the votes per option with aggregation queries.
 */
export class FirestorePollStore implements PollStore, VoteStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async polls() {
    const db = this.getDb();
    return { db, polls: eventCollection(db, await this.getEventId(), POLLS_COLLECTION) };
  }

  async list(): Promise<Result<readonly Poll[], { code: string }>> {
    try {
      const { polls } = await this.polls();
      const snapshot = await polls.get();
      return ok(snapshot.docs.flatMap((doc) => toPoll(doc.id, doc.data()) ?? []));
    } catch (cause) {
      logServerError("polls.store.list", cause);
      return err({ code: "unknown" });
    }
  }

  async create(poll: Poll): Promise<Result<void, { code: string }>> {
    try {
      const { polls } = await this.polls();
      await polls.doc(poll.id).create({ ...contentFields(poll), status: poll.status, createdAt: poll.createdAt, openedAt: null, closedAt: null });
      return ok(undefined);
    } catch (cause) {
      logServerError("polls.store.create", cause);
      return err({ code: "unknown" });
    }
  }

  async updateDraft(id: string, content: PollContent): Promise<Result<{ before: Poll; after: Poll } | "wrong-status" | null, { code: string }>> {
    try {
      const { db, polls } = await this.polls();
      const ref = polls.doc(id);
      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const before = snapshot.exists ? toPoll(id, snapshot.data()) : null;
        if (!before) return ok(null);
        if (before.status !== "draft") return ok("wrong-status" as const);
        tx.update(ref, { ...contentFields(content), updatedAt: new Date() });
        return ok({ before, after: { ...before, ...content } });
      });
    } catch (cause) {
      logServerError("polls.store.update", cause);
      return err({ code: "unknown" });
    }
  }

  async open(id: string, at: Date): Promise<Result<Poll | "wrong-status" | "another-open" | null, { code: string }>> {
    try {
      const { db, polls } = await this.polls();
      const ref = polls.doc(id);
      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const poll = snapshot.exists ? toPoll(id, snapshot.data()) : null;
        if (!poll) return ok(null);
        if (poll.status !== "draft") return ok("wrong-status" as const);
        const open = await tx.get(polls.where("status", "==", "open").limit(1));
        if (!open.empty) return ok("another-open" as const);
        tx.update(ref, { status: "open", openedAt: at });
        return ok({ ...poll, status: "open" as const, openedAt: at });
      });
    } catch (cause) {
      logServerError("polls.store.open", cause);
      return err({ code: "unknown" });
    }
  }

  async close(id: string, at: Date): Promise<Result<Poll | "wrong-status" | null, { code: string }>> {
    try {
      const { db, polls } = await this.polls();
      const ref = polls.doc(id);
      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const poll = snapshot.exists ? toPoll(id, snapshot.data()) : null;
        if (!poll) return ok(null);
        if (poll.status !== "open") return ok("wrong-status" as const);
        tx.update(ref, { status: "closed", closedAt: at });
        return ok({ ...poll, status: "closed" as const, closedAt: at });
      });
    } catch (cause) {
      logServerError("polls.store.close", cause);
      return err({ code: "unknown" });
    }
  }

  async removeDraft(id: string): Promise<Result<Poll | "wrong-status" | null, { code: string }>> {
    try {
      const { db, polls } = await this.polls();
      const ref = polls.doc(id);
      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const poll = snapshot.exists ? toPoll(id, snapshot.data()) : null;
        if (!poll) return ok(null);
        if (poll.status !== "draft") return ok("wrong-status" as const);
        tx.delete(ref);
        return ok(poll);
      });
    } catch (cause) {
      logServerError("polls.store.remove", cause);
      return err({ code: "unknown" });
    }
  }

  async tally(id: string): Promise<Result<PollTally, { code: string }>> {
    try {
      const { polls } = await this.polls();
      const ref = polls.doc(id);
      const poll = toPoll(id, (await ref.get()).data());
      if (!poll) return ok({ counts: {}, total: 0 });
      const votes = ref.collection(POLL_VOTES_COLLECTION);
      // One aggregation per option: a count costs a read per thousand votes, never the votes themselves.
      const counted = await Promise.all(poll.options.map(async (option) => [option.id, (await votes.where("optionId", "==", option.id).count().get()).data().count] as const));
      const counts = Object.fromEntries(counted);
      return ok({ counts, total: counted.reduce((sum, [, count]) => sum + count, 0) });
    } catch (cause) {
      logServerError("polls.store.tally", cause);
      return err({ code: "unknown" });
    }
  }

  async openPoll(): Promise<Result<Poll | null, { code: string }>> {
    try {
      const { polls } = await this.polls();
      const snapshot = await polls.where("status", "==", "open").limit(1).get();
      const doc = snapshot.docs[0];
      return ok(doc ? toPoll(doc.id, doc.data()) : null);
    } catch (cause) {
      logServerError("polls.store.openPoll", cause);
      return err({ code: "unknown" });
    }
  }

  async myVote(pollId: string, uid: string): Promise<Result<string | null, { code: string }>> {
    try {
      const { polls } = await this.polls();
      const vote = (await polls.doc(pollId).collection(POLL_VOTES_COLLECTION).doc(uid).get()).data();
      return ok(vote && isOptionId(vote.optionId) ? vote.optionId : null);
    } catch (cause) {
      logServerError("polls.store.myVote", cause);
      return err({ code: "unknown" });
    }
  }

  async cast(pollId: string, uid: string, optionId: string, at: Date): Promise<Result<{ first: boolean; poll: Poll } | "closed" | "invalid-option" | "already-voted" | null, { code: string }>> {
    try {
      const { db, polls } = await this.polls();
      const pollRef = polls.doc(pollId);
      const voteRef = pollRef.collection(POLL_VOTES_COLLECTION).doc(uid);
      return await db.runTransaction(async (tx) => {
        const [pollSnapshot, voteSnapshot] = await Promise.all([tx.get(pollRef), tx.get(voteRef)]);
        const poll = pollSnapshot.exists ? toPoll(pollId, pollSnapshot.data()) : null;
        if (!poll) return ok(null);
        if (poll.status !== "open") return ok("closed" as const);
        if (!poll.options.some((option) => option.id === optionId)) return ok("invalid-option" as const);
        const first = !voteSnapshot.exists;
        if (!first && !poll.changeable) return ok("already-voted" as const);
        tx.set(voteRef, first ? { uid, optionId, at, changedAt: null } : { uid, optionId, at: voteSnapshot.data()?.at ?? at, changedAt: at });
        return ok({ first, poll });
      });
    } catch (cause) {
      logServerError("polls.store.cast", cause);
      return err({ code: "unknown" });
    }
  }
}
