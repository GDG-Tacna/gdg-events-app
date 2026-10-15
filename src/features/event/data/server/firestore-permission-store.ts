import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { EVENT_CONFIG_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { parsePermissions, type EditionPermissions, type PermissionStore } from "../../domain/permissions";

const PERMISSIONS_DOC = "permissions";

/** Firestore adapter (Admin SDK) over `events/{eventId}/config/permissions`. */
export class FirestorePermissionStore implements PermissionStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async ref() {
    return eventCollection(this.getDb(), await this.getEventId(), EVENT_CONFIG_COLLECTION).doc(PERMISSIONS_DOC);
  }

  async read(): Promise<Result<EditionPermissions, { code: string }>> {
    try {
      return ok(parsePermissions((await (await this.ref()).get()).data()));
    } catch (cause) {
      logServerError("event.permissions.read", cause);
      return err({ code: "unknown" });
    }
  }

  async save(permissions: EditionPermissions): Promise<Result<void, { code: string }>> {
    try {
      await (await this.ref()).set({ organizer: { ...permissions.organizer }, staffStations: [...permissions.staffStations], updatedAt: new Date() });
      return ok(undefined);
    } catch (cause) {
      logServerError("event.permissions.save", cause);
      return err({ code: "unknown" });
    }
  }
}
