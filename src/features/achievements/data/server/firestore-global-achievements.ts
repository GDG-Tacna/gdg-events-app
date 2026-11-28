import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { imageRefOf } from "@/features/media/server";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import {
  ACHIEVEMENTS_COLLECTION,
  ACHIEVEMENT_AWARDS_COLLECTION,
  CERTIFICATES_COLLECTION,
  CONTACTS_COLLECTION,
  GLOBAL_ACHIEVEMENTS_COLLECTION,
  GLOBAL_ACHIEVEMENT_AWARDS_COLLECTION,
  PARTICIPANTS_COLLECTION,
  WALLETS_COLLECTION,
  eventCollection,
} from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { DEFAULT_BADGES } from "../default-badges";
import type { BadgeStanding } from "../../domain/achievements";
import { parseBadge, type Badge } from "../../domain/badge";
import type { EditionAchievementsGroup, GlobalAwardStore, GlobalBadgeSource } from "../../domain/global-achievements";
import { parseGlobalBadge, type GlobalBadge, type GlobalPlayerProgress } from "../../domain/global-badge";
import type { GlobalBadgeDeletion, GlobalBadgePatch, GlobalBadgeStore } from "../../domain/manage-global";

const isAlreadyExists = (cause: unknown) =>
  typeof cause === "object" && cause !== null && ((cause as { code?: unknown }).code === 6 || (cause as { code?: unknown }).code === "already-exists");

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
};

const numberOr0 = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

function toGlobalBadge(id: string, data: unknown): GlobalBadge | null {
  const badge = parseGlobalBadge(id, data);
  if (!badge) return null;
  const path = (data as { imagePath?: unknown }).imagePath;
  return { ...badge, image: typeof path === "string" ? imageRefOf(path, "badge") : null };
}

function toEditionBadge(id: string, data: unknown): Badge | null {
  const badge = parseBadge(id, data);
  if (!badge) return null;
  const path = (data as { imagePath?: unknown }).imagePath;
  return { ...badge, image: typeof path === "string" ? imageRefOf(path, "badge") : null };
}

function toFields(patch: GlobalBadgePatch): Record<string, unknown> {
  const { image, ...rest } = patch;
  const fields: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
  if (image !== undefined) fields.imagePath = image?.path ?? null;
  return fields;
}

/** Firestore adapter (Admin SDK) over global community badges (`globalAchievements`). */
export class FirestoreGlobalBadgeStore implements GlobalBadgeSource, GlobalBadgeStore {
  constructor(private readonly getDb: () => Firestore = getAdminFirestore) {}

  async list(): Promise<Result<readonly GlobalBadge[], { code: string }>> {
    try {
      const snapshot = await this.getDb().collection(GLOBAL_ACHIEVEMENTS_COLLECTION).get();
      const badges: GlobalBadge[] = [];
      for (const doc of snapshot.docs) {
        const badge = toGlobalBadge(doc.id, doc.data());
        if (badge) badges.push(badge);
        else logServerError("achievements.global.parse", new Error(`global badge ${doc.id} cannot be shown`));
      }
      return ok(badges);
    } catch (cause) {
      logServerError("achievements.global.list", cause);
      return err({ code: "unknown" });
    }
  }

  async create(badge: GlobalBadge): Promise<Result<void, { code: "already-exists" | "unknown" }>> {
    try {
      const { id, image, ...data } = badge;
      await this.getDb()
        .collection(GLOBAL_ACHIEVEMENTS_COLLECTION)
        .doc(id)
        .create({ ...data, imagePath: image?.path ?? null, createdAt: new Date() });
      return ok(undefined);
    } catch (cause) {
      if (isAlreadyExists(cause)) return err({ code: "already-exists" });
      logServerError("achievements.global.create", cause);
      return err({ code: "unknown" });
    }
  }

  async update(id: string, patch: GlobalBadgePatch): Promise<Result<{ before: GlobalBadge; after: GlobalBadge } | null, { code: string }>> {
    try {
      const db = this.getDb();
      const ref = db.collection(GLOBAL_ACHIEVEMENTS_COLLECTION).doc(id);
      return await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const before = snapshot.exists ? toGlobalBadge(id, snapshot.data()) : null;
        if (!before) return ok(null);
        tx.update(ref, toFields(patch));
        const changes = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
        return ok({ before, after: { ...before, ...changes } as GlobalBadge });
      });
    } catch (cause) {
      logServerError("achievements.global.update", cause);
      return err({ code: "unknown" });
    }
  }

  async delete(id: string): Promise<Result<GlobalBadgeDeletion, { code: string }>> {
    try {
      const db = this.getDb();
      const ref = db.collection(GLOBAL_ACHIEVEMENTS_COLLECTION).doc(id);
      const awards = db.collection(GLOBAL_ACHIEVEMENT_AWARDS_COLLECTION).where("badgeId", "==", id).limit(1);
      return await db.runTransaction(async (tx): Promise<Result<GlobalBadgeDeletion, { code: string }>> => {
        const [snapshot, earned] = await Promise.all([tx.get(ref), tx.get(awards)]);
        const badge = snapshot.exists ? toGlobalBadge(id, snapshot.data()) : null;
        if (!badge) return ok({ kind: "not-found" });
        if (!earned.empty) return ok({ kind: "has-awards" });
        tx.delete(ref);
        return ok({ kind: "deleted", badge });
      });
    } catch (cause) {
      logServerError("achievements.global.delete", cause);
      return err({ code: "unknown" });
    }
  }

  async setOrder(ids: readonly string[]): Promise<Result<void, { code: string }>> {
    try {
      const db = this.getDb();
      const collection = db.collection(GLOBAL_ACHIEVEMENTS_COLLECTION);
      const batch = db.batch();
      ids.forEach((id, order) => batch.update(collection.doc(id), { order }));
      await batch.commit();
      return ok(undefined);
    } catch (cause) {
      logServerError("achievements.global.setOrder", cause);
      return err({ code: "unknown" });
    }
  }
}

/** In-memory TTL cache for global community badges (60s default; invalidated on admin writes). */
export class CachedGlobalBadgeSource implements GlobalBadgeSource {
  private cached: { badges: readonly GlobalBadge[]; expiresAt: number } | null = null;

  constructor(
    private readonly source: GlobalBadgeSource,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  async list(): Promise<Result<readonly GlobalBadge[], { code: string }>> {
    if (this.cached && this.cached.expiresAt > this.now()) return ok(this.cached.badges);
    const listed = await this.source.list();
    if (listed.ok) this.cached = { badges: listed.value, expiresAt: this.now() + this.ttlMs };
    return listed;
  }

  invalidate(): void {
    this.cached = null;
  }
}

/** Firestore adapter over `globalAchievementAwards/{uid}_{badgeId}` (idempotent create). */
export class FirestoreGlobalAwardStore implements GlobalAwardStore {
  constructor(private readonly getDb: () => Firestore = getAdminFirestore) {}

  async awardsOf(uid: string): Promise<Result<ReadonlyMap<string, Date>, { code: string }>> {
    try {
      const snapshot = await this.getDb()
        .collection(GLOBAL_ACHIEVEMENT_AWARDS_COLLECTION)
        .where("uid", "==", uid)
        .get();
      const awards = new Map<string, Date>();
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const at = toDate(data.at);
        if (typeof data.badgeId === "string" && at) awards.set(data.badgeId, at);
      }
      return ok(awards);
    } catch (cause) {
      logServerError("achievements.global.awards.list", cause);
      return err({ code: "unknown" });
    }
  }

  async award(input: { uid: string; badgeId: string; at: Date }): Promise<Result<{ awarded: boolean }, { code: string }>> {
    try {
      await this.getDb()
        .collection(GLOBAL_ACHIEVEMENT_AWARDS_COLLECTION)
        .doc(`${input.uid}_${input.badgeId}`)
        .create({ ...input });
      return ok({ awarded: true });
    } catch (cause) {
      if (isAlreadyExists(cause)) return ok({ awarded: false });
      logServerError("achievements.global.awards.create", cause);
      return err({ code: "unknown" });
    }
  }
}

export interface EditionSummaryRef {
  id: string;
  name: string | null;
  startsAt: Date | null;
}

export interface CrossEditionAchievementsSnapshot {
  progress: GlobalPlayerProgress;
  /** Earned badges per edition (excluding live active edition, which is built separately with pending progress). */
  earnedByEdition: ReadonlyMap<string, ReadonlyMap<string, Date>>;
}

const byOrder = (a: Badge, b: Badge) => a.order - b.order || a.name.localeCompare(b.name);

/**
 * Reads one user's cross-edition community progress and earned edition awards across every known edition.
 * Uses aggregation `.count()` for contacts and caches per-edition badge catalogs in memory to keep Spark reads low.
 */
export class FirestoreCrossEditionAchievementsReader {
  private readonly editionCatalogCache = new Map<string, { badges: readonly Badge[]; expiresAt: number }>();

  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly catalogTtlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  invalidateEdition(eventId?: string): void {
    if (eventId) this.editionCatalogCache.delete(eventId);
    else this.editionCatalogCache.clear();
  }

  private async editionBadges(eventId: string): Promise<readonly Badge[]> {
    const cached = this.editionCatalogCache.get(eventId);
    if (cached && cached.expiresAt > this.now()) return cached.badges;
    const snapshot = await eventCollection(this.getDb(), eventId, ACHIEVEMENTS_COLLECTION).get();
    const stored: Badge[] = [];
    for (const doc of snapshot.docs) {
      const badge = toEditionBadge(doc.id, doc.data());
      if (badge) stored.push(badge);
    }
    const badges = stored.length > 0 ? stored : DEFAULT_BADGES;
    this.editionCatalogCache.set(eventId, { badges, expiresAt: this.now() + this.catalogTtlMs });
    return badges;
  }

  async readSnapshot(
    uid: string,
    editions: readonly EditionSummaryRef[],
  ): Promise<Result<CrossEditionAchievementsSnapshot, { code: string }>> {
    try {
      const db = this.getDb();
      const [walletSnap, certsSnap, perEdition] = await Promise.all([
        db.collection(WALLETS_COLLECTION).doc(uid).get(),
        db.collection(CERTIFICATES_COLLECTION).where("uid", "==", uid).get(),
        Promise.all(
          editions.map(async (edition) => {
            const [participantSnap, awardsSnap, contactsCountSnap] = await Promise.all([
              eventCollection(db, edition.id, PARTICIPANTS_COLLECTION).doc(uid).get(),
              eventCollection(db, edition.id, ACHIEVEMENT_AWARDS_COLLECTION).where("uid", "==", uid).get(),
              eventCollection(db, edition.id, CONTACTS_COLLECTION).where("uids", "array-contains", uid).count().get(),
            ]);
            const awards = new Map<string, Date>();
            for (const doc of awardsSnap.docs) {
              const data = doc.data();
              const at = toDate(data.at);
              if (typeof data.badgeId === "string" && at) awards.set(data.badgeId, at);
            }
            const participantData = participantSnap.exists ? participantSnap.data() : undefined;
            const participated =
              awards.size > 0 ||
              (participantSnap.exists &&
                (toDate(participantData?.attendedAt) !== null || numberOr0(participantData?.xp) > 0));
            return {
              edition,
              participated,
              editionCredits: numberOr0(participantData?.credits),
              awards,
              contactsCount: contactsCountSnap.data().count,
            };
          }),
        ),
      ]);

      const certEventIds = new Set<string>();
      let certificatesEarned = 0;
      for (const doc of certsSnap.docs) {
        const data = doc.data();
        if (toDate(data.revokedAt) !== null) continue;
        certificatesEarned += 1;
        if (typeof data.eventId === "string") certEventIds.add(data.eventId);
      }

      let eventsAttended = 0;
      let totalBadges = 0;
      let totalContacts = 0;
      let fallbackCredits = 0;
      const earnedByEdition = new Map<string, ReadonlyMap<string, Date>>();

      for (const entry of perEdition) {
        if (entry.participated || certEventIds.has(entry.edition.id)) eventsAttended += 1;
        totalBadges += entry.awards.size;
        totalContacts += entry.contactsCount;
        fallbackCredits += entry.editionCredits;
        earnedByEdition.set(entry.edition.id, entry.awards);
      }

      const walletData = walletSnap.exists ? walletSnap.data() : undefined;
      const totalCredits = walletSnap.exists ? numberOr0(walletData?.earned) : fallbackCredits;

      return ok({
        progress: {
          eventsAttended,
          totalCredits,
          totalBadges,
          certificatesEarned,
          totalContacts,
        },
        earnedByEdition,
      });
    } catch (cause) {
      logServerError("achievements.crossEdition.read", cause);
      return err({ code: "unknown" });
    }
  }

  /** Builds earned-only edition groups for finished and past editions (newest first). */
  async buildFinishedGroups(
    editions: readonly EditionSummaryRef[],
    earnedByEdition: ReadonlyMap<string, ReadonlyMap<string, Date>>,
    options: { activeEventId: string; activeEventFinished: boolean },
  ): Promise<Result<readonly EditionAchievementsGroup[], { code: string }>> {
    try {
      const relevant = editions
        .filter((edition) => {
          if (edition.id === options.activeEventId) return options.activeEventFinished;
          return (earnedByEdition.get(edition.id)?.size ?? 0) > 0;
        })
        .sort((a, b) => {
          if (a.id === options.activeEventId) return -1;
          if (b.id === options.activeEventId) return 1;
          const timeA = a.startsAt?.getTime() ?? -Infinity;
          const timeB = b.startsAt?.getTime() ?? -Infinity;
          return timeB - timeA || a.id.localeCompare(b.id);
        });

      const groups = await Promise.all(
        relevant.map(async (edition): Promise<EditionAchievementsGroup> => {
          const awards = earnedByEdition.get(edition.id) ?? new Map<string, Date>();
          if (awards.size === 0) {
            return {
              eventId: edition.id,
              eventName: edition.name ?? edition.id,
              isLive: false,
              badges: [],
            };
          }
          const catalog = await this.editionBadges(edition.id);
          const byId = new Map(catalog.map((badge) => [badge.id, badge]));
          const earnedStandings: BadgeStanding[] = [...awards.entries()]
            .map(([badgeId, earnedAt]): BadgeStanding | null => {
              const badge = byId.get(badgeId);
              if (!badge) return null;
              return { badge, earnedAt, current: 1, target: 1 };
            })
            .filter((entry): entry is BadgeStanding => entry !== null)
            .sort((a, b) => byOrder(a.badge, b.badge));
          return {
            eventId: edition.id,
            eventName: edition.name ?? edition.id,
            isLive: false,
            badges: earnedStandings,
          };
        }),
      );
      return ok(groups);
    } catch (cause) {
      logServerError("achievements.crossEdition.groups", cause);
      return err({ code: "unknown" });
    }
  }
}
