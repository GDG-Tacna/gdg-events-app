import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { imageRefOf } from "@/features/media/server";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { ACHIEVEMENTS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { BadgeSource } from "../../domain/achievements";
import { parseBadge, type Badge } from "../../domain/badge";
import type { BadgePatch, BadgeStore } from "../../domain/manage";

/** A stored badge: its fields, and the image kept as a path whose address is rebuilt here. */
function toBadge(id: string, data: unknown): Badge | null {
  const badge = parseBadge(id, data);
  if (!badge) return null;
  const path = (data as { imagePath?: unknown }).imagePath;
  return { ...badge, image: typeof path === "string" ? imageRefOf(path, "badge") : null };
}

/** The fields to write for a patch: the image as its path only. */
function toFields(patch: BadgePatch): Record<string, unknown> {
  const { image, ...rest } = patch;
  const fields: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
  if (image !== undefined) fields.imagePath = image?.path ?? null;
  return fields;
}

const isAlreadyExists = (cause: unknown) =>
  typeof cause === "object" && cause !== null && ((cause as { code?: unknown }).code === 6 || (cause as { code?: unknown }).code === "already-exists");

/**
 * Firestore adapter (Admin SDK) over `events/{eventId}/achievements`. A badge that breaks the rules is logged
 * and skipped (nobody can earn a badge nobody can describe); `create` never overwrites; updates are
 * single-document transactions; the order is saved in one batch.
 */
export class FirestoreBadgeStore implements BadgeSource, BadgeStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  async list(): Promise<Result<readonly Badge[], { code: string }>> {
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, ACHIEVEMENTS_COLLECTION).get();
      const badges: Badge[] = [];
      for (const doc of snapshot.docs) {
        const badge = toBadge(doc.id, doc.data());
        if (badge) badges.push(badge);
        else logServerError("achievements.store.parse", new Error(`badge ${doc.id} of ${eventId} cannot be shown`));
      }
      return ok(badges);
    } catch (cause) {
      logServerError("achievements.store.list", cause);
      return err({ code: "unknown" });
    }
  }

  async create(badge: Badge): Promise<Result<void, { code: "already-exists" | "unknown" }>> {
    try {
      const eventId = await this.getEventId();
      const { id, image, ...data } = badge;
      await eventCollection(this.getDb(), eventId, ACHIEVEMENTS_COLLECTION).doc(id).create({ ...data, imagePath: image?.path ?? null, createdAt: new Date() });
      return ok(undefined);
    } catch (cause) {
      if (isAlreadyExists(cause)) return err({ code: "already-exists" });
      logServerError("achievements.store.create", cause);
      return err({ code: "unknown" });
    }
  }

  async update(id: string, patch: BadgePatch): Promise<Result<{ before: Badge; after: Badge } | null, { code: string }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const ref = eventCollection(db, eventId, ACHIEVEMENTS_COLLECTION).doc(id);
      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const before = snapshot.exists ? toBadge(id, snapshot.data()) : null;
        if (!before) return ok(null);
        tx.update(ref, toFields(patch));
        const changes = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
        return ok({ before, after: { ...before, ...changes } as Badge });
      });
    } catch (cause) {
      logServerError("achievements.store.update", cause);
      return err({ code: "unknown" });
    }
  }

  async setOrder(ids: readonly string[]): Promise<Result<void, { code: string }>> {
    try {
      const db = this.getDb();
      const eventId = await this.getEventId();
      const collection = eventCollection(db, eventId, ACHIEVEMENTS_COLLECTION);
      const batch = db.batch();
      ids.forEach((id, order) => batch.update(collection.doc(id), { order }));
      await batch.commit();
      return ok(undefined);
    } catch (cause) {
      logServerError("achievements.store.setOrder", cause);
      return err({ code: "unknown" });
    }
  }
}

/** The badges kept in memory for a short time. Failed reads are never cached; admin changes call `invalidate()`. */
export class CachedBadgeSource implements BadgeSource {
  private cached: { badges: readonly Badge[]; expiresAt: number } | null = null;

  constructor(
    private readonly source: BadgeSource,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  async list(): Promise<Result<readonly Badge[], { code: string }>> {
    if (this.cached && this.cached.expiresAt > this.now()) return ok(this.cached.badges);
    const listed = await this.source.list();
    if (listed.ok) this.cached = { badges: listed.value, expiresAt: this.now() + this.ttlMs };
    return listed;
  }

  invalidate(): void {
    this.cached = null;
  }
}
