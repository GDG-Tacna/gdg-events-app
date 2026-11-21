import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { EditionCatalog, EditionsActor, EditionsAuditEntry } from "./editions";

/**
 * Cleaning the progress of an edition: every cadet goes back to zero XP and zero G-Credits, and what had given them
 * those is cleared too (the XP history, the missions done, the badges, the mini-games played and the rewards of
 * contacts), so everyone can earn again from the start. The squads' credits go to zero as well, and the prizes they
 * redeemed return to the stock. What stays: the cadets' profiles (alias, squad, ticket), their attendance, their contacts, the
 * missions and everything else an admin prepared. It cannot be undone, so only an admin of every edition may do it,
 * never to a finished edition (its results are history), and it leaves an entry in the audit trail.
 */
export interface ProgressResetSummary {
  /** Cadets whose XP and credits went back to zero. */
  cadets: number;
  /** Documents deleted or reset in all (history, completions, awards, plays, rewards, squad credits). */
  documents: number;
}

export interface ProgressResetter {
  /** Clears the progress of one edition. It can be run again: what is already clear stays clear. */
  reset(eventId: string): Promise<Result<ProgressResetSummary, { code: string }>>;
}

export type ProgressResetErrorCode = "not-found" | "finished" | "forbidden" | "unauthenticated" | "disabled" | "unknown";

export interface ProgressResetDeps {
  catalog: Pick<EditionCatalog, "list">;
  resetter: ProgressResetter;
  audit: { append(entry: Omit<EditionsAuditEntry, "action"> & { action: "event.progress-reset" }): Promise<Result<void, { code: string }>> };
  now: () => Date;
}

/** Clears the progress of an edition (see the top of this file). Only an admin of every edition, never a finished edition. */
export async function resetEditionProgress(
  deps: ProgressResetDeps,
  actor: EditionsActor,
  input: { eventId: string },
): Promise<Result<ProgressResetSummary, { code: ProgressResetErrorCode }>> {
  if (actor.role !== "admin" || actor.adminScope !== "global") return err({ code: "forbidden" });

  const listed = await deps.catalog.list();
  if (!listed.ok) return err({ code: "unknown" });
  const edition = listed.value.find((candidate) => candidate.id === input.eventId);
  if (!edition) return err({ code: "not-found" });
  if (edition.status === "finished") return err({ code: "finished" });

  const cleared = await deps.resetter.reset(input.eventId);
  if (!cleared.ok) {
    logServerError("event.progress-reset", new Error(cleared.error.code));
    return err({ code: "unknown" });
  }

  const audited = await deps.audit.append({
    action: "event.progress-reset",
    actorUid: actor.uid,
    targetUid: input.eventId,
    details: { cadets: String(cleared.value.cadets), documents: String(cleared.value.documents) },
    at: deps.now(),
  });
  if (!audited.ok) logServerError("event.audit.append", new Error(`audit entry missing for the progress reset of ${input.eventId}`));
  return ok(cleared.value);
}
