import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { AVATARS_COLLECTION } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { parseLook, type AvatarLook } from "@/shared/ui/pixel/avatar-look";
import type { AvatarStore } from "../../domain/avatar";

/**
 * Firestore adapter (Admin SDK) over `avatars/{uid}`: one global document per person with their chosen look. A stored
 * look that breaks the rules reads as none, so the alias's look is drawn instead of a broken one.
 */
export class FirestoreAvatarStore implements AvatarStore {
  constructor(private readonly getDb: () => Firestore = getAdminFirestore) {}

  private doc(uid: string) {
    return this.getDb().collection(AVATARS_COLLECTION).doc(uid);
  }

  async get(uid: string): Promise<Result<AvatarLook | null, { code: string }>> {
    try {
      const snapshot = await this.doc(uid).get();
      return ok(snapshot.exists ? parseLook(snapshot.data()?.look) : null);
    } catch (cause) {
      logServerError("avatar.store.get", cause);
      return err({ code: "unknown" });
    }
  }

  async save(uid: string, look: AvatarLook, at: Date): Promise<Result<void, { code: string }>> {
    try {
      await this.doc(uid).set({ look: { ...look }, updatedAt: at });
      return ok(undefined);
    } catch (cause) {
      logServerError("avatar.store.save", cause);
      return err({ code: "unknown" });
    }
  }

  async remove(uid: string): Promise<Result<void, { code: string }>> {
    try {
      await this.doc(uid).delete();
      return ok(undefined);
    } catch (cause) {
      logServerError("avatar.store.remove", cause);
      return err({ code: "unknown" });
    }
  }
}
