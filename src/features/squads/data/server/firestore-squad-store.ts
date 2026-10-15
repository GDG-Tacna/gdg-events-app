import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { imageRefOf } from "@/features/media/server";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { SQUADS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { isSquadId } from "@/shared/types/squad";
import type { ManagedSquad, SquadStore } from "../../domain/manage";
import type { Squad } from "../../domain/squad";
import { validateLogo } from "../../domain/squad-rules";

/** A stored squad, or `null` when the document is malformed: a squad nobody can draw is not shown or changed. */
function toSquad(id: string, data: Record<string, unknown> | undefined): ManagedSquad | null {
  if (!isSquadId(id) || !data) return null;
  if (typeof data.name !== "string" || typeof data.tagline !== "string") return null;
  const sprite = validateLogo(data.sprite);
  if (!sprite) return null;
  return {
    id,
    name: data.name,
    tagline: data.tagline,
    sprite,
    logo: typeof data.logoPath === "string" ? imageRefOf(data.logoPath, "squad-logo") : null,
    active: data.active === true,
    order: typeof data.order === "number" && Number.isFinite(data.order) ? data.order : Number.MAX_SAFE_INTEGER,
  };
}

const byOrder = (a: ManagedSquad, b: ManagedSquad) => a.order - b.order || a.name.localeCompare(b.name);

const isAlreadyExists = (cause: unknown) =>
  typeof cause === "object" && cause !== null && ((cause as { code?: unknown }).code === 6 || (cause as { code?: unknown }).code === "already-exists");

/**
 * Firestore adapter (Admin SDK) over `events/{eventId}/squads`. The id is the document id: `create`
 * fails if it exists, so two admins cannot both take it. Updates are single-document transactions that
 * report the squad before and after.
 */
export class FirestoreSquadStore implements SquadStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  async list(): Promise<Result<readonly ManagedSquad[], { code: string }>> {
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, SQUADS_COLLECTION).get();
      const squads: ManagedSquad[] = [];
      for (const doc of snapshot.docs) {
        const squad = toSquad(doc.id, doc.data());
        if (squad) squads.push(squad);
      }
      return ok(squads.sort(byOrder));
    } catch (cause) {
      logServerError("squads.store.list", cause);
      return err({ code: "unknown" });
    }
  }

  async create(squad: ManagedSquad): Promise<Result<void, { code: "already-exists" | "unknown" }>> {
    try {
      const eventId = await this.getEventId();
      await eventCollection(this.getDb(), eventId, SQUADS_COLLECTION).doc(squad.id).create({
        name: squad.name,
        tagline: squad.tagline,
        sprite: { rows: [...squad.sprite.rows], palette: { ...squad.sprite.palette } },
        logoPath: squad.logo?.path ?? null,
        active: squad.active,
        order: squad.order,
        createdAt: new Date(),
      });
      return ok(undefined);
    } catch (cause) {
      if (isAlreadyExists(cause)) return err({ code: "already-exists" });
      logServerError("squads.store.create", cause);
      return err({ code: "unknown" });
    }
  }

  async update(
    id: string,
    patch: Partial<Pick<Squad, "name" | "tagline" | "sprite" | "active" | "logo">>,
  ): Promise<Result<{ before: ManagedSquad; after: ManagedSquad } | null, { code: string }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const ref = eventCollection(db, eventId, SQUADS_COLLECTION).doc(id);

      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const before = snapshot.exists ? toSquad(id, snapshot.data()) : null;
        if (!before) return ok(null);

        const after: ManagedSquad = { ...before, ...patch };
        const fields: Record<string, unknown> = {};
        if (patch.name !== undefined) fields.name = patch.name;
        if (patch.tagline !== undefined) fields.tagline = patch.tagline;
        if (patch.sprite !== undefined) fields.sprite = { rows: [...patch.sprite.rows], palette: { ...patch.sprite.palette } };
        if (patch.active !== undefined) fields.active = patch.active;
        if (patch.logo !== undefined) fields.logoPath = patch.logo?.path ?? null;
        tx.update(ref, fields);
        return ok({ before, after });
      });
    } catch (cause) {
      logServerError("squads.store.update", cause);
      return err({ code: "unknown" });
    }
  }

  async setOrder(ids: readonly string[]): Promise<Result<void, { code: string }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const collection = eventCollection(db, eventId, SQUADS_COLLECTION);
      const batch = db.batch();
      ids.forEach((id, order) => batch.update(collection.doc(id), { order }));
      await batch.commit();
      return ok(undefined);
    } catch (cause) {
      logServerError("squads.store.setOrder", cause);
      return err({ code: "unknown" });
    }
  }
}
