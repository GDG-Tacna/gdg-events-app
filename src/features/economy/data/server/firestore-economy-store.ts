import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { ECONOMY_DOC, EVENT_CONFIG_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { parseEconomySettings, type EconomySettings, type EconomyStore } from "../../domain/settings";

/**
 * Firestore adapter over `events/{eventId}/config/economy`. Settings that break the rules are logged and
 * read as missing (the defaults rule then). Kept for a minute in memory; a save drops the cache at once.
 */
export class FirestoreEconomyStore implements EconomyStore {
  private cached: { settings: EconomySettings | null; expiresAt: number } | null = null;

  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  async load(): Promise<Result<EconomySettings | null, { code: string }>> {
    if (this.cached && this.cached.expiresAt > this.now()) return ok(this.cached.settings);
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, EVENT_CONFIG_COLLECTION).doc(ECONOMY_DOC).get();
      let settings: EconomySettings | null = null;
      if (snapshot.exists) {
        settings = parseEconomySettings(snapshot.data());
        if (!settings) logServerError("economy.settings.parse", new Error(`economy settings of ${eventId} break the rules`));
      }
      this.cached = { settings, expiresAt: this.now() + this.ttlMs };
      return ok(settings);
    } catch (cause) {
      logServerError("economy.settings.load", cause);
      return err({ code: "unknown" });
    }
  }

  async save(settings: EconomySettings): Promise<Result<void, { code: string }>> {
    try {
      const eventId = await this.getEventId();
      await eventCollection(this.getDb(), eventId, EVENT_CONFIG_COLLECTION)
        .doc(ECONOMY_DOC)
        .set({ ...settings, missionCredits: { ...settings.missionCredits }, updatedAt: new Date() });
      this.cached = null;
      return ok(undefined);
    } catch (cause) {
      logServerError("economy.settings.save", cause);
      return err({ code: "unknown" });
    }
  }
}
