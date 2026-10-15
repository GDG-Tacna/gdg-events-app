import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { MISSION_COMPLETIONS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { completionId, type CompletionStatus, type Evaluation, type MissionCompletion } from "../../domain/completion";
import type { CompletionStore } from "../../domain/ports";

const STATUSES: readonly CompletionStatus[] = ["in-progress", "completed", "failed"];

const toDate = (value: unknown): Date => {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date(0);
};

function toCompletion(data: Record<string, unknown> | undefined): MissionCompletion | null {
  if (!data || typeof data.uid !== "string" || typeof data.missionId !== "string") return null;
  if (!STATUSES.includes(data.status as CompletionStatus)) return null;
  const attempts = typeof data.attempts === "number" && Number.isInteger(data.attempts) && data.attempts >= 0 ? data.attempts : 0;
  const xpEarned = typeof data.xpEarned === "number" && Number.isInteger(data.xpEarned) && data.xpEarned >= 0 ? data.xpEarned : 0;
  const creditsEarned = typeof data.creditsEarned === "number" && Number.isInteger(data.creditsEarned) && data.creditsEarned >= 0 ? data.creditsEarned : 0;
  return { uid: data.uid, missionId: data.missionId, status: data.status as CompletionStatus, attempts, xpEarned, creditsEarned, at: toDate(data.at) };
}

/**
 * Firestore adapter (Admin SDK) over `events/{eventId}/missionCompletions/{uid}_{missionId}`. The decision
 * runs inside the transaction on the stored state, so two answers sent at once are applied one after the
 * other and cannot both use the same attempt.
 */
export class FirestoreCompletionStore implements CompletionStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listFor(uid: string): Promise<Result<readonly MissionCompletion[], { code: string }>> {
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, MISSION_COMPLETIONS_COLLECTION).where("uid", "==", uid).get();
      const completions: MissionCompletion[] = [];
      for (const doc of snapshot.docs) {
        const completion = toCompletion(doc.data());
        if (completion && completion.uid === uid) completions.push(completion);
      }
      return ok(completions);
    } catch (cause) {
      logServerError("missions.completions.list", cause);
      return err({ code: "unknown" });
    }
  }

  async apply(
    uid: string,
    missionId: string,
    decide: (previous: MissionCompletion | null) => Evaluation,
  ): Promise<Result<{ before: MissionCompletion | null; evaluation: Evaluation; after: MissionCompletion | null }, { code: string }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const ref = eventCollection(db, eventId, MISSION_COMPLETIONS_COLLECTION).doc(completionId(uid, missionId));

      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const before = snapshot.exists ? toCompletion(snapshot.data()) : null;
        const evaluation = decide(before);
        if (evaluation.kind !== "next") return ok({ before, evaluation, after: before });

        const after: MissionCompletion = {
          uid,
          missionId,
          status: evaluation.status,
          attempts: evaluation.attempts,
          xpEarned: evaluation.xpEarned,
          creditsEarned: evaluation.creditsEarned,
          at: this.now(),
        };
        tx.set(ref, after);
        return ok({ before, evaluation, after });
      });
    } catch (cause) {
      logServerError("missions.completions.apply", cause);
      return err({ code: "unknown" });
    }
  }
}
