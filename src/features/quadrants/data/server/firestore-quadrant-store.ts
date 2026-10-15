import "server-only";
import { imageRefOf } from "@/features/media/server";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { QUADRANTS_COLLECTION, VENUE_COLLECTION, VENUE_MAP_DOC, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { QuadrantAdminStore, QuadrantPatch } from "../../domain/manage";
import type { EditionLayout, QuadrantSource } from "../../domain/ports";
import { isQuadrantId, isQuadrantPlanet, type Quadrant } from "../../domain/quadrant";
import { parseVenueMap, type VenueMap } from "../../domain/venue";

const isAlreadyExists = (cause: unknown) =>
  typeof cause === "object" && cause !== null && ((cause as { code?: unknown }).code === 6 || (cause as { code?: unknown }).code === "already-exists");

/** A stored quadrant, or `null` when the document is malformed (it is skipped, not shown half-drawn). */
function toQuadrant(id: string, data: Record<string, unknown> | undefined): Quadrant | null {
  if (!isQuadrantId(id) || !data) return null;
  if (typeof data.name !== "string" || typeof data.tagline !== "string" || !isQuadrantPlanet(data.planet)) return null;
  return {
    id,
    name: data.name,
    tagline: data.tagline,
    planet: data.planet,
    order: typeof data.order === "number" && Number.isFinite(data.order) ? data.order : Number.MAX_SAFE_INTEGER,
    active: data.active === true,
  };
}

/**
 * Firestore adapter (Admin SDK) over `events/{eventId}/quadrants` and the plan in `events/{eventId}/venue/map`.
 * Both are read together; a plan that cannot be drawn is logged and read as missing, so the bundled one
 * stands in instead of breaking the map.
 */
export class FirestoreQuadrantStore implements QuadrantSource, QuadrantAdminStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  async load(): Promise<Result<EditionLayout, { code: string }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const [quadrantDocs, venueDoc] = await Promise.all([
        eventCollection(db, eventId, QUADRANTS_COLLECTION).get(),
        eventCollection(db, eventId, VENUE_COLLECTION).doc(VENUE_MAP_DOC).get(),
      ]);

      const quadrants: Quadrant[] = [];
      for (const doc of quadrantDocs.docs) {
        const quadrant = toQuadrant(doc.id, doc.data());
        if (quadrant) quadrants.push(quadrant);
      }

      let venue = null;
      if (venueDoc.exists) {
        venue = parseVenueMap(venueDoc.data());
        if (!venue) logServerError("quadrants.store.venue", new Error(`venue plan of ${eventId} cannot be drawn`));
        // The background is kept as a path; its address is rebuilt here.
        const path = venueDoc.data()?.backgroundPath;
        if (venue && typeof path === "string") venue = { ...venue, background: imageRefOf(path, "venue-plan") };
      }
      return ok({ quadrants, venue });
    } catch (cause) {
      logServerError("quadrants.store.load", cause);
      return err({ code: "unknown" });
    }
  }

  async listQuadrants(): Promise<Result<readonly Quadrant[], { code: string }>> {
    const loaded = await this.load();
    return loaded.ok ? ok(loaded.value.quadrants) : loaded;
  }

  async loadVenue(): Promise<Result<VenueMap | null, { code: string }>> {
    const loaded = await this.load();
    return loaded.ok ? ok(loaded.value.venue) : loaded;
  }

  async createQuadrant(quadrant: Quadrant): Promise<Result<void, { code: "already-exists" | "unknown" }>> {
    try {
      const eventId = await this.getEventId();
      const { id, ...data } = quadrant;
      await eventCollection(this.getDb(), eventId, QUADRANTS_COLLECTION).doc(id).create({ ...data, createdAt: new Date() });
      return ok(undefined);
    } catch (cause) {
      if (isAlreadyExists(cause)) return err({ code: "already-exists" });
      logServerError("quadrants.store.create", cause);
      return err({ code: "unknown" });
    }
  }

  async updateQuadrant(id: string, patch: QuadrantPatch): Promise<Result<{ before: Quadrant; after: Quadrant } | null, { code: string }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const ref = eventCollection(db, eventId, QUADRANTS_COLLECTION).doc(id);
      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const before = snapshot.exists ? toQuadrant(id, snapshot.data()) : null;
        if (!before) return ok(null);
        const fields = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
        tx.update(ref, fields);
        return ok({ before, after: { ...before, ...fields } as Quadrant });
      });
    } catch (cause) {
      logServerError("quadrants.store.update", cause);
      return err({ code: "unknown" });
    }
  }

  async setQuadrantOrder(ids: readonly string[]): Promise<Result<void, { code: string }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const collection = eventCollection(db, eventId, QUADRANTS_COLLECTION);
      const batch = db.batch();
      ids.forEach((id, order) => batch.update(collection.doc(id), { order }));
      await batch.commit();
      return ok(undefined);
    } catch (cause) {
      logServerError("quadrants.store.setOrder", cause);
      return err({ code: "unknown" });
    }
  }

  async saveVenue(venue: VenueMap): Promise<Result<void, { code: string }>> {
    try {
      const eventId = await this.getEventId();
      await eventCollection(this.getDb(), eventId, VENUE_COLLECTION)
        .doc(VENUE_MAP_DOC)
        .set({
          width: venue.width,
          height: venue.height,
          areas: venue.areas.map((area) => ({ ...area, rect: { ...area.rect } })),
          backgroundPath: venue.background?.path ?? null,
          updatedAt: new Date(),
        });
      return ok(undefined);
    } catch (cause) {
      logServerError("quadrants.store.saveVenue", cause);
      return err({ code: "unknown" });
    }
  }
}
