import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getActiveEventId, type ActiveEventResolver } from "@/shared/lib/firebase/active-event";
import { getAdminFirestore } from "@/shared/lib/firebase/admin";
import { EVENT_CONFIG_COLLECTION, eventCollection } from "@/shared/lib/firebase/collections";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { RundownPlan, RundownStore, StoredCues } from "../../domain/manage";
import { parseTracks, type Track } from "../../domain/music";
import { isMinutes, parseCues, parseExtraPoints, type ExtraPoint, type StoredCue } from "../../domain/rundown";

export const RUNDOWN_DOC = "rundown";

/**
 * Firestore adapter (Admin SDK) for the running order: one document per edition, `config/rundown`, with the pieces of each
 * point of the agenda under `items.<id>`. Only paths and names are stored: the files stay on the operator's computer. A
 * point whose stored pieces break the rules reads as having none instead of breaking the whole order.
 */
export class FirestoreRundownStore implements RundownStore {
  constructor(
    private readonly getDb: () => Firestore = getAdminFirestore,
    private readonly getEventId: ActiveEventResolver = getActiveEventId,
  ) {}

  private async ref() {
    return eventCollection(this.getDb(), await this.getEventId(), EVENT_CONFIG_COLLECTION).doc(RUNDOWN_DOC);
  }

  async read(): Promise<Result<StoredCues, { code: string }>> {
    try {
      const snapshot = await (await this.ref()).get();
      const items: unknown = snapshot.exists ? snapshot.data()?.items : undefined;
      if (typeof items !== "object" || items === null) return ok({});
      const stored: Record<string, readonly StoredCue[]> = {};
      for (const [itemId, raw] of Object.entries(items)) {
        const cues = parseCues(raw);
        if (cues === null) logServerError("rundown.parse", new Error(`the pieces of ${itemId} break the rules; read as none`));
        else if (cues.length > 0) stored[itemId] = cues;
      }
      return ok(stored);
    } catch (cause) {
      logServerError("rundown.read", cause);
      return err({ code: "unknown" });
    }
  }

  async readPlan(): Promise<Result<RundownPlan, { code: string }>> {
    try {
      const snapshot = await (await this.ref()).get();
      const data = snapshot.exists ? snapshot.data() : undefined;
      // A broken list of points reads as none (logged), and a broken number of minutes is left out, instead of failing the console.
      const points = data?.points === undefined ? [] : parseExtraPoints(data.points);
      if (points === null) logServerError("rundown.parse", new Error("the points made in the console break the rules; read as none"));
      const minutes: Record<string, number> = {};
      if (typeof data?.minutes === "object" && data.minutes !== null) {
        for (const [itemId, value] of Object.entries(data.minutes as Record<string, unknown>)) if (isMinutes(value)) minutes[itemId] = value;
      }
      const playlist = data?.playlist === undefined ? [] : parseTracks(data.playlist);
      if (playlist === null) logServerError("rundown.parse", new Error("the playlist breaks the rules; read as empty"));
      return ok({ points: points ?? [], minutes, playlist: playlist ?? [] });
    } catch (cause) {
      logServerError("rundown.readPlan", cause);
      return err({ code: "unknown" });
    }
  }

  async savePoints(points: readonly ExtraPoint[]): Promise<Result<void, { code: string }>> {
    try {
      // Replaced as a whole: a merge would keep the points that were removed.
      await (await this.ref()).set({ points: points.map(({ id, title, who, time }) => ({ id, title, who, time })), updatedAt: new Date() }, { merge: true });
      return ok(undefined);
    } catch (cause) {
      logServerError("rundown.savePoints", cause);
      return err({ code: "unknown" });
    }
  }

  async savePlaylist(tracks: readonly Track[]): Promise<Result<void, { code: string }>> {
    try {
      await (await this.ref()).set({ playlist: tracks.map(({ id, name, path }) => ({ id, name, path })), updatedAt: new Date() }, { merge: true });
      return ok(undefined);
    } catch (cause) {
      logServerError("rundown.savePlaylist", cause);
      return err({ code: "unknown" });
    }
  }

  async saveMinutes(itemId: string, minutes: number | null): Promise<Result<void, { code: string }>> {
    try {
      await (await this.ref()).set({ minutes: { [itemId]: minutes === null ? FieldValue.delete() : minutes }, updatedAt: new Date() }, { merge: true });
      return ok(undefined);
    } catch (cause) {
      logServerError("rundown.saveMinutes", cause);
      return err({ code: "unknown" });
    }
  }

  async saveItem(itemId: string, cues: readonly StoredCue[]): Promise<Result<void, { code: string }>> {
    try {
      // Only the fields each kind has: a file keeps its path, a Google Slides piece its presentation.
      const plain = cues.map((cue) => ({
        ...(cue.kind === "gslides" ? { id: cue.id, kind: cue.kind, name: cue.name, deckId: cue.deckId, published: cue.published } : { id: cue.id, kind: cue.kind, name: cue.name, path: cue.path }),
        ...(cue.seconds !== undefined ? { seconds: cue.seconds } : {}),
      }));
      await (await this.ref()).set({ items: { [itemId]: plain }, updatedAt: new Date() }, { merge: true });
      return ok(undefined);
    } catch (cause) {
      logServerError("rundown.save", cause);
      return err({ code: "unknown" });
    }
  }
}
