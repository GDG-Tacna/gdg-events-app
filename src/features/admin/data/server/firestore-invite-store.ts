import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { INVITES_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { Invite, InviteStore } from "../../domain/invites";
import { isManagedRole } from "../../domain/team";

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate: () => Date }).toDate();
  return null;
};

function toInvite(id: string, data: Record<string, unknown> | undefined): Invite | null {
  if (!data || typeof data.email !== "string" || !isManagedRole(data.role) || typeof data.invitedBy !== "string") return null;
  const createdAt = toDate(data.createdAt);
  const expiresAt = toDate(data.expiresAt);
  if (!createdAt || !expiresAt) return null;
  return {
    id,
    email: data.email,
    role: data.role,
    invitedBy: data.invitedBy,
    createdAt,
    expiresAt,
    acceptedAt: toDate(data.acceptedAt),
    acceptedBy: typeof data.acceptedBy === "string" ? data.acceptedBy : null,
    revokedAt: toDate(data.revokedAt),
  };
}

/** Firestore adapter (Admin SDK) over `events/{eventId}/invites/{hash}`; clients are denied by the rules. */
export class FirestoreInviteStore implements InviteStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async collection() {
    return eventCollection(this.getDb(), await this.getEventId(), INVITES_COLLECTION);
  }

  async list(): Promise<Result<readonly Invite[], { code: string }>> {
    try {
      const snapshot = await (await this.collection()).get();
      const invites = snapshot.docs.flatMap((doc) => toInvite(doc.id, doc.data()) ?? []);
      return ok(invites.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
    } catch (cause) {
      logServerError("admin.invites.list", cause);
      return err({ code: "unknown" });
    }
  }

  async create(invite: Invite): Promise<Result<void, { code: string }>> {
    try {
      const { id, ...data } = invite;
      await (await this.collection()).doc(id).create(data);
      return ok(undefined);
    } catch (cause) {
      logServerError("admin.invites.create", cause);
      return err({ code: "unknown" });
    }
  }

  async get(id: string): Promise<Result<Invite | null, { code: string }>> {
    try {
      const snapshot = await (await this.collection()).doc(id).get();
      return ok(snapshot.exists ? toInvite(id, snapshot.data()) : null);
    } catch (cause) {
      logServerError("admin.invites.get", cause);
      return err({ code: "unknown" });
    }
  }

  async accept(id: string, uid: string, at: Date): Promise<Result<boolean, { code: string }>> {
    try {
      const db = this.getDb();
      const ref = (await this.collection()).doc(id);
      return await db.runTransaction(async (tx) => {
        const invite = toInvite(id, (await tx.get(ref)).data());
        if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt.getTime() <= at.getTime()) return ok(false);
        tx.update(ref, { acceptedAt: at, acceptedBy: uid });
        return ok(true);
      });
    } catch (cause) {
      logServerError("admin.invites.accept", cause);
      return err({ code: "unknown" });
    }
  }

  async undoAccept(id: string): Promise<Result<void, { code: string }>> {
    try {
      await (await this.collection()).doc(id).update({ acceptedAt: null, acceptedBy: null });
      return ok(undefined);
    } catch (cause) {
      logServerError("admin.invites.undoAccept", cause);
      return err({ code: "unknown" });
    }
  }

  async revoke(id: string, at: Date): Promise<Result<Invite | null, { code: string }>> {
    try {
      const db = this.getDb();
      const ref = (await this.collection()).doc(id);
      return await db.runTransaction(async (tx) => {
        const invite = toInvite(id, (await tx.get(ref)).data());
        if (!invite) return ok(null);
        tx.update(ref, { revokedAt: at });
        return ok({ ...invite, revokedAt: at });
      });
    } catch (cause) {
      logServerError("admin.invites.revoke", cause);
      return err({ code: "unknown" });
    }
  }
}
