import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { EVENT_CONFIG_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { parseOffModules, type EditionModule, type ModuleStore } from "../../domain/modules";

const MODULES_DOC = "modules";

/** Firestore adapter (Admin SDK) over `events/{eventId}/config/modules`: the modules the edition has switched off. */
export class FirestoreModuleStore implements ModuleStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async ref() {
    return eventCollection(this.getDb(), await this.getEventId(), EVENT_CONFIG_COLLECTION).doc(MODULES_DOC);
  }

  async readOff(): Promise<Result<readonly EditionModule[], { code: string }>> {
    try {
      return ok(parseOffModules((await (await this.ref()).get()).data()));
    } catch (cause) {
      logServerError("event.modules.read", cause);
      return err({ code: "unknown" });
    }
  }

  async saveOff(off: readonly EditionModule[]): Promise<Result<void, { code: string }>> {
    try {
      await (await this.ref()).set({ off: [...off], updatedAt: new Date() });
      return ok(undefined);
    } catch (cause) {
      logServerError("event.modules.save", cause);
      return err({ code: "unknown" });
    }
  }
}
