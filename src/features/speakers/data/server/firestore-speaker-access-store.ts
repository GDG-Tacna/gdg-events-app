import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { SPEAKERS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { SpeakerAccessRow, SpeakerAccessStore, SpeakerInvite } from "../../domain/access";
import { toSpeaker } from "./firestore-speaker-store";

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate: () => Date }).toDate();
  return null;
}

/** A stored invitation, or `null` when it is missing or broken (a broken one simply stops working). */
export function toInvite(value: unknown): SpeakerInvite | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as Record<string, unknown>;
  const expiresAt = asDate(data.expiresAt);
  if (typeof data.hash !== "string" || typeof data.email !== "string" || typeof data.invitedBy !== "string" || !expiresAt) return null;
  return { hash: data.hash, email: data.email, invitedBy: data.invitedBy, expiresAt, acceptedAt: asDate(data.acceptedAt) };
}

/** A stored speaker's access, or `null` when the speaker cannot be shown. */
export function toAccessRow(id: string, data: Record<string, unknown> | undefined): SpeakerAccessRow | null {
  const speaker = toSpeaker(id, data);
  if (!speaker || !data) return null;
  return { speakerId: id, name: speaker.name, active: speaker.active, accountUid: typeof data.accountUid === "string" ? data.accountUid : null, invite: toInvite(data.invite) };
}

/**
 * Firestore adapter (Admin SDK) for speakers' access, kept on each speaker's document in `events/{eventId}/speakers`
 * (`accountUid` and `invite`). Changes are transactions on that one document, so a link is claimed only once.
 */
export class FirestoreSpeakerAccessStore implements SpeakerAccessStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async collection() {
    const db = this.getDb();
    return { db, collection: eventCollection(db, await this.getEventId(), SPEAKERS_COLLECTION) };
  }

  async rows(): Promise<Result<readonly SpeakerAccessRow[], { code: string }>> {
    try {
      const { collection } = await this.collection();
      const snapshot = await collection.get();
      return ok(snapshot.docs.flatMap((doc) => toAccessRow(doc.id, doc.data()) ?? []));
    } catch (cause) {
      logServerError("speakers.access.rows", cause);
      return err({ code: "unknown" });
    }
  }

  /** Runs `change` on the speaker's document in a transaction; `null` when there is no such speaker. */
  private async change<T>(speakerId: string, change: (row: SpeakerAccessRow) => { fields: Record<string, unknown> | null; answer: T }, where: string): Promise<Result<T | null, { code: string }>> {
    try {
      const { db, collection } = await this.collection();
      const ref = collection.doc(speakerId);
      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const row = snapshot.exists ? toAccessRow(speakerId, snapshot.data()) : null;
        if (!row) return ok(null);
        const { fields, answer } = change(row);
        if (fields) tx.update(ref, { ...fields, updatedAt: new Date() });
        return ok(answer);
      });
    } catch (cause) {
      logServerError(where, cause);
      return err({ code: "unknown" });
    }
  }

  async invite(speakerId: string, invite: SpeakerInvite): Promise<Result<boolean, { code: string }>> {
    const done = await this.change(speakerId, () => ({ fields: { invite: { ...invite }, accountUid: null }, answer: true }), "speakers.access.invite");
    return done.ok ? ok(done.value === true) : done;
  }

  async claim(speakerId: string, hash: string, uid: string, at: Date): Promise<Result<"linked" | "gone", { code: string }>> {
    const done = await this.change(
      speakerId,
      (row): { fields: Record<string, unknown> | null; answer: "linked" | "gone" } => {
        const invite = row.invite;
        if (!invite || invite.hash !== hash) return { fields: null, answer: "gone" };
        if (invite.acceptedAt) return { fields: null, answer: row.accountUid === uid ? "linked" : "gone" };
        if (invite.expiresAt.getTime() <= at.getTime()) return { fields: null, answer: "gone" };
        return { fields: { accountUid: uid, "invite.acceptedAt": at }, answer: "linked" };
      },
      "speakers.access.claim",
    );
    return done.ok ? ok(done.value ?? "gone") : done;
  }

  async unlink(speakerId: string): Promise<Result<boolean, { code: string }>> {
    const done = await this.change(speakerId, () => ({ fields: { accountUid: null, invite: null }, answer: true }), "speakers.access.unlink");
    return done.ok ? ok(done.value === true) : done;
  }
}
