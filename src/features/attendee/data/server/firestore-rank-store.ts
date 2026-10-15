import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { imageRefOf } from "@/features/media/server";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { EVENT_CONFIG_COLLECTION, RANKS_DOC, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { parseRankLadder, type RankLadder } from "../../domain/rank";
import type { RankStore } from "../../domain/rank-admin";

/**
 * Firestore adapter (Admin SDK) over `events/{eventId}/config/ranks` (`{ ranks: [{ id, name, minXp }] }`).
 * A ladder that breaks the rules is logged and read as missing, so the bundled one prices everyone instead.
 */
export class FirestoreRankStore implements RankStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  async load(): Promise<Result<RankLadder | null, { code: string }>> {
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, EVENT_CONFIG_COLLECTION).doc(RANKS_DOC).get();
      if (!snapshot.exists) return ok(null);
      const raw: unknown = snapshot.data()?.ranks;
      const ladder = parseRankLadder(raw);
      if (!ladder) {
        logServerError("ranks.store.load", new Error(`rank ladder of ${eventId} breaks the rules`));
        return ok(null);
      }
      // Icons are kept as paths; their address is rebuilt here.
      const stored = raw as ReadonlyArray<{ iconPath?: unknown }>;
      return ok(
        ladder.map((rank, index) => {
          const path = stored[index]?.iconPath;
          const icon = typeof path === "string" ? imageRefOf(path, "rank") : null;
          return icon ? { ...rank, icon } : rank;
        }),
      );
    } catch (cause) {
      logServerError("ranks.store.load", cause);
      return err({ code: "unknown" });
    }
  }

  async save(ranks: ReadonlyArray<{ id: string; name: string; minXp: number; iconPath: string | null }>): Promise<Result<void, { code: string }>> {
    try {
      const eventId = await this.getEventId();
      await eventCollection(this.getDb(), eventId, EVENT_CONFIG_COLLECTION)
        .doc(RANKS_DOC)
        .set({ ranks: ranks.map(({ id, name, minXp, iconPath }) => ({ id, name, minXp, iconPath })), updatedAt: new Date() });
      return ok(undefined);
    } catch (cause) {
      logServerError("ranks.store.save", cause);
      return err({ code: "unknown" });
    }
  }
}

/** The ladder kept in memory for a short time (every dashboard view needs it). Failed reads are never cached. */
export class CachedRankStore implements RankStore {
  private cached: { ladder: RankLadder | null; expiresAt: number } | null = null;

  constructor(
    private readonly store: RankStore,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  async load(): Promise<Result<RankLadder | null, { code: string }>> {
    if (this.cached && this.cached.expiresAt > this.now()) return ok(this.cached.ladder);
    const loaded = await this.store.load();
    if (loaded.ok) this.cached = { ladder: loaded.value, expiresAt: this.now() + this.ttlMs };
    return loaded;
  }

  async save(ranks: ReadonlyArray<{ id: string; name: string; minXp: number; iconPath: string | null }>): Promise<Result<void, { code: string }>> {
    const saved = await this.store.save(ranks);
    // The next read sees the change at once (on this server instance).
    this.cached = null;
    return saved;
  }
}
