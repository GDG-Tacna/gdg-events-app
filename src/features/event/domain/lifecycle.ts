import type { Edition, EditionsActor } from "./editions";

/**
 * Where an edition is in its life, which decides what may still be deleted in it:
 * - `draft`: being prepared, never published. Whoever may edit a section may delete its items.
 * - `published`: it is (or once was) the public edition. Its items can only be deactivated, except by an admin of every edition.
 * - `finished`: over (marked so, or past its end). Same as published.
 * Being published is permanent: it is remembered when an edition is made public, so replacing it with another one does
 * not make it a draft again.
 */
export type EditionLifecycle = "draft" | "published" | "finished";

export function lifecycleOf(edition: Pick<Edition, "status" | "endsAt" | "publishedAt">, isPublic: boolean, now: Date): EditionLifecycle {
  if (edition.status === "finished" || (edition.endsAt !== null && edition.endsAt.getTime() <= now.getTime())) return "finished";
  return isPublic || (edition.publishedAt ?? null) !== null ? "published" : "draft";
}

/**
 * Whether the actor may delete items (missions, zones, badges, squads, stations, ranks) of an edition in this lifecycle.
 * Only admins at all; in a draft any of them, afterwards only an admin of every edition. Whether the section allows
 * editing, and whether the item is safe to delete, are other checks.
 */
export function mayDelete(lifecycle: EditionLifecycle, actor: Pick<EditionsActor, "role" | "adminScope">): boolean {
  if (actor.role !== "admin") return false;
  return lifecycle === "draft" || actor.adminScope === "global";
}
