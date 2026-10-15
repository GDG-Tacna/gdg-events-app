import "server-only";
import { MISSIONS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { MissionPatch, MissionStore } from "../../domain/manage";
import type { Mission, MissionConfig } from "../../domain/mission";
import { FirestoreMissionSource, toMission } from "./firestore-mission-source";

const isAlreadyExists = (cause: unknown) =>
  typeof cause === "object" && cause !== null && ((cause as { code?: unknown }).code === 6 || (cause as { code?: unknown }).code === "already-exists");

/** Plain copy of a config for Firestore (no readonly arrays shared with callers). */
const configData = (config: MissionConfig) =>
  config.type === "quiz"
    ? { ...config, options: [...config.options] }
    : config.type === "keyword"
      ? { ...config, keywords: [...config.keywords] }
      : { ...config };

const missionData = (mission: Mission) => ({
  title: mission.title,
  description: mission.description,
  quadrantId: mission.quadrantId,
  xp: mission.xp,
  credits: mission.credits,
  order: mission.order,
  active: mission.active,
  minigame: mission.minigame,
  minigameDifficulty: mission.minigameDifficulty,
  config: configData(mission.config),
  imagePath: mission.image?.path ?? null,
});

/**
 * The admin side of `events/{eventId}/missions` (Admin SDK). `create` fails if the id exists, so two
 * admins cannot both take it; updates are single-document transactions that report the mission before
 * and after; the order is saved in one batch.
 */
export class FirestoreMissionStore extends FirestoreMissionSource implements MissionStore {
  async create(mission: Mission): Promise<Result<void, { code: "already-exists" | "unknown" }>> {
    try {
      const eventId = await this.getEventId();
      await eventCollection(this.getDb(), eventId, MISSIONS_COLLECTION).doc(mission.id).create({ ...missionData(mission), createdAt: new Date() });
      return ok(undefined);
    } catch (cause) {
      if (isAlreadyExists(cause)) return err({ code: "already-exists" });
      logServerError("missions.store.create", cause);
      return err({ code: "unknown" });
    }
  }

  async update(id: string, patch: MissionPatch): Promise<Result<{ before: Mission; after: Mission } | null, { code: string }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const ref = eventCollection(db, eventId, MISSIONS_COLLECTION).doc(id);

      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const before = snapshot.exists ? toMission(id, snapshot.data()) : null;
        if (!before) return ok(null);

        const after: Mission = { ...before, ...patch };
        const fields: Record<string, unknown> = {};
        for (const key of ["title", "description", "quadrantId", "xp", "active"] as const) {
          if (patch[key] !== undefined) fields[key] = patch[key];
        }
        for (const key of ["credits", "minigame", "minigameDifficulty"] as const) {
          if (patch[key] !== undefined) fields[key] = patch[key];
        }
        if (patch.config !== undefined) fields.config = configData(patch.config);
        if (patch.image !== undefined) fields.imagePath = patch.image?.path ?? null;
        tx.update(ref, fields);
        return ok({ before, after });
      });
    } catch (cause) {
      logServerError("missions.store.update", cause);
      return err({ code: "unknown" });
    }
  }

  async setOrder(ids: readonly string[]): Promise<Result<void, { code: string }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const collection = eventCollection(db, eventId, MISSIONS_COLLECTION);
      const batch = db.batch();
      ids.forEach((id, order) => batch.update(collection.doc(id), { order }));
      await batch.commit();
      return ok(undefined);
    } catch (cause) {
      logServerError("missions.store.setOrder", cause);
      return err({ code: "unknown" });
    }
  }
}
