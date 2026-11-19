import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { EVENT_CONFIG_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { RundownStore, StoredCues } from "../../domain/manage";
import { parseCues, type MediaCue } from "../../domain/rundown";

export const RUNDOWN_DOC = "rundown";

/**
 * Firestore adapter (Admin SDK) for the running order: one document per edition, `config/rundown`, with the pieces of each
 * point of the agenda under `items.<id>`. Only paths and names are stored: the files stay on the operator's computer. A
 * point whose stored pieces break the rules reads as having none instead of breaking the whole order.
 */
export class FirestoreRundownStore implements RundownStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async ref() {
    return eventCollection(this.getDb(), await this.getEventId(), EVENT_CONFIG_COLLECTION).doc(RUNDOWN_DOC);
  }

  async read(): Promise<Result<StoredCues, { code: string }>> {
    try {
      const snapshot = await (await this.ref()).get();
      const items: unknown = snapshot.exists ? snapshot.data()?.items : undefined;
      if (typeof items !== "object" || items === null) return ok({});
      const stored: Record<string, readonly MediaCue[]> = {};
      for (const [itemId, raw] of Object.entries(items)) {
        const cues = parseCues(raw);
        if (cues === null) logServerError("rundown.parse", new Error(`the pieces of ${itemId} break the rules; read as none`));
        else if (cues.length > 0) stored[itemId] = cues;
      }
      return ok(stored);
    } catch (cause) {
      logServerError("rundown.read", cause);
      return err({ code: "unknown" });
    }
  }

  async saveItem(itemId: string, cues: readonly MediaCue[]): Promise<Result<void, { code: string }>> {
    try {
      const plain = cues.map(({ id, kind, name, path }) => ({ id, kind, name, path }));
      await (await this.ref()).set({ items: { [itemId]: plain }, updatedAt: new Date() }, { merge: true });
      return ok(undefined);
    } catch (cause) {
      logServerError("rundown.save", cause);
      return err({ code: "unknown" });
    }
  }
}
