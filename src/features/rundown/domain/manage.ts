import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { parseCues, type StoredCue } from "./rundown";

/** The stored pieces of every point of the agenda, by the point's id (a talk's id). */
export type StoredCues = Readonly<Record<string, readonly StoredCue[]>>;

export interface RundownStore {
  /** Every point's pieces; an edition that has none saved reads as `{}`. */
  read(): Promise<Result<StoredCues, { code: string }>>;
  /** Replaces one point's pieces (an empty list clears them). */
  saveItem(itemId: string, cues: readonly StoredCue[]): Promise<Result<void, { code: string }>>;
}

export interface RundownDeps {
  store: RundownStore;
}

export type RundownErrorCode = "invalid-item" | "invalid-cues" | "unauthenticated" | "forbidden" | "disabled" | "unknown";

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
