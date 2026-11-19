import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { parseTracks, type Track } from "./music";
import { isMinutes, parseCues, parseExtraPoints, type ExtraPoint, type StoredCue } from "./rundown";

/** The stored pieces of every point of the agenda, by the point's id (a talk's id). */
export type StoredCues = Readonly<Record<string, readonly StoredCue[]>>;

/** What is saved besides the pieces: the points made in the console and the minutes planned for each point. */
export interface RundownPlan {
  points: readonly ExtraPoint[];
  minutes: Readonly<Record<string, number>>;
  /** The songs of the event's playlist, in order. */
  playlist: readonly Track[];
}

export interface RundownStore {
  /** Every point's pieces; an edition that has none saved reads as `{}`. */
  read(): Promise<Result<StoredCues, { code: string }>>;
  /** Replaces one point's pieces (an empty list clears them). */
  saveItem(itemId: string, cues: readonly StoredCue[]): Promise<Result<void, { code: string }>>;
  /** The points made in the console and the minutes planned; an edition that has none reads as empty. */
  readPlan(): Promise<Result<RundownPlan, { code: string }>>;
  /** Replaces the points made in the console. */
  savePoints(points: readonly ExtraPoint[]): Promise<Result<void, { code: string }>>;
  /** Replaces the playlist. */
  savePlaylist(tracks: readonly Track[]): Promise<Result<void, { code: string }>>;
  /** Sets the minutes planned for a point, or clears them with `null`. */
  saveMinutes(itemId: string, minutes: number | null): Promise<Result<void, { code: string }>>;
}

export interface RundownDeps {
  store: RundownStore;
}

export type RundownErrorCode = "invalid-item" | "invalid-cues" | "invalid-points" | "invalid-minutes" | "invalid-tracks" | "unauthenticated" | "forbidden" | "disabled" | "unknown";

export interface RundownActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

const ITEM_ID = /^[a-z0-9][a-z0-9-]{1,47}$/;
export const isItemId = (value: unknown): value is string => typeof value === "string" && ITEM_ID.test(value);

const rundownError = (code: RundownErrorCode) => ({ code });

/** The stored order, for the console. Admin only. */
export async function getStoredCues(deps: Pick<RundownDeps, "store">, actor: RundownActor): Promise<Result<StoredCues, { code: RundownErrorCode }>> {
  if (actor.role !== "admin") return err(rundownError("forbidden"));
  const read = await deps.store.read();
  return read.ok ? ok(read.value) : err(rundownError("unknown"));
}

/** The points made in the console and the minutes planned. Admin only. */
export async function getRundownPlan(deps: Pick<RundownDeps, "store">, actor: RundownActor): Promise<Result<RundownPlan, { code: RundownErrorCode }>> {
  if (actor.role !== "admin") return err(rundownError("forbidden"));
  const read = await deps.store.readPlan();
  return read.ok ? ok(read.value) : err(rundownError("unknown"));
}

/** Saves the points made in the console (a break, a welcome): they are not in the public agenda. */
export async function saveExtraPoints(deps: Pick<RundownDeps, "store">, actor: RundownActor, input: { points: unknown }): Promise<Result<readonly ExtraPoint[], { code: RundownErrorCode }>> {
  if (actor.role !== "admin") return err(rundownError("forbidden"));
  const points = parseExtraPoints(input.points);
  if (points === null) return err(rundownError("invalid-points"));
  const saved = await deps.store.savePoints(points);
  if (!saved.ok) {
    logServerError("rundown.points", new Error(saved.error.code));
    return err(rundownError("unknown"));
  }
  return ok(points);
}

/** Saves the playlist: the songs and their order. Only where each song is kept, never the song. */
export async function saveMusicPlaylist(deps: Pick<RundownDeps, "store">, actor: RundownActor, input: { tracks: unknown }): Promise<Result<readonly Track[], { code: RundownErrorCode }>> {
  if (actor.role !== "admin") return err(rundownError("forbidden"));
  const tracks = parseTracks(input.tracks);
  if (tracks === null) return err(rundownError("invalid-tracks"));
  const saved = await deps.store.savePlaylist(tracks);
  if (!saved.ok) {
    logServerError("rundown.playlist", new Error(saved.error.code));
    return err(rundownError("unknown"));
  }
  return ok(tracks);
}

/** Sets the minutes planned for a point of the agenda (a talk or one made here), or clears them with `null`. */
export async function saveItemMinutes(deps: Pick<RundownDeps, "store">, actor: RundownActor, input: { itemId: unknown; minutes: unknown }): Promise<Result<number | null, { code: RundownErrorCode }>> {
  if (actor.role !== "admin") return err(rundownError("forbidden"));
  if (!isItemId(input.itemId)) return err(rundownError("invalid-item"));
  if (input.minutes !== null && !isMinutes(input.minutes)) return err(rundownError("invalid-minutes"));
  const saved = await deps.store.saveMinutes(input.itemId, input.minutes);
  if (!saved.ok) {
    logServerError("rundown.minutes", new Error(saved.error.code));
    return err(rundownError("unknown"));
  }
  return ok(input.minutes);
}

/**
 * Saves the pieces of one point of the agenda. Every piece is checked again (a path cannot leave the connected folder or
 * point to a file the browser cannot show); nothing about the files themselves is stored, only where they are.
 */
export async function saveItemCues(deps: Pick<RundownDeps, "store">, actor: RundownActor, input: { itemId: unknown; cues: unknown }): Promise<Result<readonly StoredCue[], { code: RundownErrorCode }>> {
  if (actor.role !== "admin") return err(rundownError("forbidden"));
  if (!isItemId(input.itemId)) return err(rundownError("invalid-item"));
  const cues = parseCues(input.cues);
  if (cues === null) return err(rundownError("invalid-cues"));
  const saved = await deps.store.saveItem(input.itemId, cues);
  if (!saved.ok) {
    logServerError("rundown.save", new Error(saved.error.code));
    return err(rundownError("unknown"));
  }
  return ok(cues);
}
