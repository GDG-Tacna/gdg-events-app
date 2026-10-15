import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { EVENT_CONFIG_COLLECTION, MINIGAME_PLAYS_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { isDifficulty, isMinigameId } from "../../domain/catalog";
import { playId, type MinigamePlay, type PlayStatus, type PlayStore } from "../../domain/plays";
import { parseMinigameSettings, type MinigameSettings, type MinigameSettingsStore } from "../../domain/settings";

const SETTINGS_DOC = "minigames";
const STATUSES: readonly PlayStatus[] = ["started", "won", "lost"];

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate: () => Date }).toDate();
  return null;
};

/** A stored play, or `null` when it breaks the rules (a play nobody can read is treated as missing, never as won). */
function toPlay(data: Record<string, unknown> | undefined): MinigamePlay | null {
  if (!data) return null;
  const startedAt = toDate(data.startedAt);
  const expiresAt = toDate(data.expiresAt);
  const finishedAt = data.finishedAt === null || data.finishedAt === undefined ? null : toDate(data.finishedAt);
  if (
    typeof data.uid !== "string" ||
    typeof data.missionId !== "string" ||
    !isMinigameId(data.gameId) ||
    !isDifficulty(data.difficulty) ||
    !STATUSES.includes(data.status as PlayStatus) ||
    typeof data.xpBonus !== "number" ||
    !startedAt ||
    !expiresAt
  ) {
    return null;
  }
  return { uid: data.uid, missionId: data.missionId, gameId: data.gameId, difficulty: data.difficulty, status: data.status as PlayStatus, xpBonus: data.xpBonus, startedAt, expiresAt, finishedAt };
}

/**
 * Firestore adapter (Admin SDK) over `events/{eventId}/minigamePlays/{uid}_{missionId}` (the id is the single
 * attempt) and `events/{eventId}/config/minigames` (which games the edition offers). Starting and finishing
 * are transactions, so two taps at once issue one ticket and record one result.
 */
export class FirestoreMinigameStore implements PlayStore, MinigameSettingsStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async playRef(uid: string, missionId: string) {
    const eventId = await this.getEventId();
    const db = this.getDb();
    return { db, ref: eventCollection(db, eventId, MINIGAME_PLAYS_COLLECTION).doc(playId(uid, missionId)), eventId };
  }

  async find(uid: string, missionId: string): Promise<Result<MinigamePlay | null, { code: string }>> {
    try {
      const { ref } = await this.playRef(uid, missionId);
      const snapshot = await ref.get();
      return ok(snapshot.exists ? toPlay(snapshot.data()) : null);
    } catch (cause) {
      logServerError("minigames.plays.find", cause);
      return err({ code: "unknown" });
    }
  }

  async start(play: MinigamePlay): Promise<Result<{ play: MinigamePlay; created: boolean }, { code: string }>> {
    try {
      const { db, ref, eventId } = await this.playRef(play.uid, play.missionId);
      return await db.runTransaction(async (tx): Promise<Result<{ play: MinigamePlay; created: boolean }, { code: string }>> => {
        const snapshot = await tx.get(ref);
        if (snapshot.exists) {
          const stored = toPlay(snapshot.data());
          if (!stored) {
            logServerError("minigames.plays.parse", new Error(`play ${ref.id} of ${eventId} breaks the rules`));
            return err({ code: "unknown" });
          }
          return ok({ play: stored, created: false });
        }
        tx.create(ref, { ...play });
        return ok({ play, created: true });
      });
    } catch (cause) {
      logServerError("minigames.plays.start", cause);
      return err({ code: "unknown" });
    }
  }

  async finish(uid: string, missionId: string, decide: (current: MinigamePlay | null) => MinigamePlay | null): Promise<Result<MinigamePlay | null, { code: string }>> {
    try {
      const { db, ref } = await this.playRef(uid, missionId);
      return await db.runTransaction(async (tx): Promise<Result<MinigamePlay | null, { code: string }>> => {
        const snapshot = await tx.get(ref);
        const current = snapshot.exists ? toPlay(snapshot.data()) : null;
        const next = decide(current);
        if (!next) return ok(current);
        tx.update(ref, { status: next.status, finishedAt: next.finishedAt });
        return ok(next);
      });
    } catch (cause) {
      logServerError("minigames.plays.finish", cause);
      return err({ code: "unknown" });
    }
  }

  async read(): Promise<Result<MinigameSettings | null, { code: string }>> {
    try {
      const eventId = await this.getEventId();
      const snapshot = await eventCollection(this.getDb(), eventId, EVENT_CONFIG_COLLECTION).doc(SETTINGS_DOC).get();
      if (!snapshot.exists) return ok(null);
      const settings = parseMinigameSettings(snapshot.data());
      if (!settings) logServerError("minigames.settings.parse", new Error(`mini-game settings of ${eventId} break the rules`));
      return ok(settings);
    } catch (cause) {
      logServerError("minigames.settings.read", cause);
      return err({ code: "unknown" });
    }
  }

  async save(settings: MinigameSettings): Promise<Result<void, { code: string }>> {
    try {
      const eventId = await this.getEventId();
      await eventCollection(this.getDb(), eventId, EVENT_CONFIG_COLLECTION)
        .doc(SETTINGS_DOC)
        .set({ games: JSON.parse(JSON.stringify(settings.games)), codeLanguages: [...settings.codeLanguages], updatedAt: new Date() });
      return ok(undefined);
    } catch (cause) {
      logServerError("minigames.settings.save", cause);
      return err({ code: "unknown" });
    }
  }
}
