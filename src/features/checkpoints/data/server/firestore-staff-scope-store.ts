import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { STAFF_SCOPES_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { StaffScopeStore } from "../../domain/staff-scope";

/** The stored checkpoint ids, keeping only strings. A document without a list limits to nothing rather than to everything. */
const idsOf = (data: Record<string, unknown> | undefined): readonly string[] =>
  Array.isArray(data?.checkpointIds) ? data.checkpointIds.filter((id): id is string => typeof id === "string") : [];

/**
 * Firestore adapter (Admin SDK) over `events/{eventId}/staffScopes/{uid}`: `{ checkpointIds, updatedAt, updatedBy }`.
 * No document means the person is not limited; lifting a limit deletes the document. The rules keep clients out.
 */
export class FirestoreStaffScopeStore implements StaffScopeStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async collection() {
    return eventCollection(this.getDb(), await this.getEventId(), STAFF_SCOPES_COLLECTION);
  }

  async read(uid: string): Promise<Result<readonly string[] | null, { code: string }>> {
    try {
      const snapshot = await (await this.collection()).doc(uid).get();
      return ok(snapshot.exists ? idsOf(snapshot.data()) : null);
    } catch (cause) {
      logServerError("checkpoints.staff-scope.read", cause);
      return err({ code: "unknown" });
    }
  }

  async list(): Promise<Result<Readonly<Record<string, readonly string[]>>, { code: string }>> {
    try {
      const snapshot = await (await this.collection()).get();
      return ok(Object.fromEntries(snapshot.docs.map((doc) => [doc.id, idsOf(doc.data())])));
    } catch (cause) {
      logServerError("checkpoints.staff-scope.list", cause);
      return err({ code: "unknown" });
    }
  }

  async save(uid: string, checkpointIds: readonly string[] | null, change: { by: string; at: Date }): Promise<Result<void, { code: string }>> {
    try {
      const ref = (await this.collection()).doc(uid);
      if (checkpointIds === null) await ref.delete();
      else await ref.set({ checkpointIds: [...checkpointIds], updatedAt: change.at, updatedBy: change.by });
      return ok(undefined);
    } catch (cause) {
      logServerError("checkpoints.staff-scope.save", cause);
      return err({ code: "unknown" });
    }
  }
}
