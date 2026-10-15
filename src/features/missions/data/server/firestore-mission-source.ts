import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { MISSIONS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { imageRefOf } from "@/features/media/server";
import { parseMission, type Mission } from "../../domain/mission";
import type { MissionSource } from "../../domain/ports";

/**
 * Firestore adapter (Admin SDK) over `events/{eventId}/missions`. A document that cannot be offered
 * (bad type config, XP out of range) is logged and skipped: one broken mission never hides the rest.
 */
/** A stored mission, its picture kept as a path whose address is rebuilt here. */
export function toMission(id: string, data: unknown): Mission | null {
  const mission = parseMission(id, data);
  if (!mission) return null;
  const path = (data as { imagePath?: unknown } | undefined)?.imagePath;
  return { ...mission, image: typeof path === "string" ? imageRefOf(path, "mission") : null };
}

export class FirestoreMissionSource implements MissionSource {
  constructor(
    protected readonly getDb: () => Firestore = getAdminFirestore,
    protected readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  async list(): Promise<Result<readonly Mission[], { code: string }>> {
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, MISSIONS_COLLECTION).get();
      const missions: Mission[] = [];
      for (const doc of snapshot.docs) {
        const mission = toMission(doc.id, doc.data());
        if (mission) missions.push(mission);
        else logServerError("missions.source.parse", new Error(`mission ${doc.id} of ${eventId} cannot be offered`));
      }
      return ok(missions);
    } catch (cause) {
      logServerError("missions.source.list", cause);
      return err({ code: "unknown" });
    }
  }
}
