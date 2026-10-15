import { chooseImage, dropReplacedImage, type RecordImages } from "@/features/media/constants";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { isSquadId } from "@/shared/types/squad";
import type { Squad } from "./squad";
import { FALLBACK_LOGO, normalizeSquadName, normalizeTagline, validateLogo } from "./squad-rules";

/** A squad as the admin manages it: the attendee's view plus its place in the list. */
export interface ManagedSquad extends Squad {
  order: number;
}

export type SquadAdminErrorCode =
  | "invalid-name"
  | "invalid-tagline"
  | "invalid-id"
  | "invalid-logo"
  | "invalid-image"
  | "already-exists"
  | "already-seeded"
  | "not-found"
  /** Squads are only retired once the event is over, so nobody loses their team mid-event. */
  | "event-not-finished"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface SquadAdminError {
  code: SquadAdminErrorCode;
}

export const squadAdminError = (code: SquadAdminErrorCode): SquadAdminError => ({ code });

export interface SquadStore {
  /** Every squad of the active edition, in order. */
  list(): Promise<Result<readonly ManagedSquad[], { code: string }>>;
  /** Fails with `already-exists` when the id is taken: profiles store the id, so it never changes hands. */
  create(squad: ManagedSquad): Promise<Result<void, { code: "already-exists" | "unknown" }>>;
  /** `null` when the squad does not exist. */
  update(
    id: string,
    patch: Partial<Pick<Squad, "name" | "tagline" | "sprite" | "active" | "logo">>,
  ): Promise<Result<{ before: ManagedSquad; after: ManagedSquad } | null, { code: string }>>;
  /** Saves the display order: the position of each id in the list. */
  setOrder(ids: readonly string[]): Promise<Result<void, { code: string }>>;
}

/** Whether the active edition is over (the event feature answers it). */
export interface EventClock {
  hasFinished(): Promise<Result<boolean, { code: string }>>;
}

export interface SquadAuditEntry {
  action: "squads.seeded" | "squad.created" | "squad.updated" | "squad.retired" | "squad.reactivated" | "squad.reordered";
  actorUid: string;
  targetUid: string;
  details: Record<string, string | null>;
  at: Date;
}

export interface SquadAudit {
  append(entry: SquadAuditEntry): Promise<Result<void, { code: string }>>;
}

export interface SquadAdminDeps {
  store: SquadStore;
  clock: EventClock;
  images: RecordImages;
  audit: SquadAudit;
  now: () => Date;
}

/** Who is asking. The server action takes it from the verified session, never from the request. */
export interface SquadAdminActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

const forbidden = (actor: SquadAdminActor) => actor.role !== "admin";

async function audit(deps: SquadAdminDeps, entry: Omit<SquadAuditEntry, "at">): Promise<void> {
  const written = await deps.audit.append({ ...entry, at: deps.now() });
  // A change that already happened is not undone by a missing audit line, but it must not go unnoticed.
  if (!written.ok) logServerError("squads.audit.append", new Error(`audit entry missing for ${entry.targetUid}`));
}

export async function listManagedSquads(
  deps: Pick<SquadAdminDeps, "store">,
  actor: SquadAdminActor,
): Promise<Result<readonly ManagedSquad[], SquadAdminError>> {
  if (forbidden(actor)) return err(squadAdminError("forbidden"));
  const listed = await deps.store.list();
  return listed.ok ? ok(listed.value) : err(squadAdminError("unknown"));
}

/** Loads the edition's first squads (DevFest's designs), only into an empty catalog. */
export async function seedSquads(
  deps: SquadAdminDeps,
  actor: SquadAdminActor,
  seed: readonly Squad[],
): Promise<Result<readonly ManagedSquad[], SquadAdminError>> {
  if (forbidden(actor)) return err(squadAdminError("forbidden"));

  const listed = await deps.store.list();
  if (!listed.ok) return err(squadAdminError("unknown"));
  if (listed.value.length > 0) return err(squadAdminError("already-seeded"));

  const created: ManagedSquad[] = [];
  for (const [order, squad] of seed.entries()) {
    const managed = { ...squad, active: true, order };
    const saved = await deps.store.create(managed);
    // Another admin seeding at the same time: their squads stand, ours are not doubled.
    if (!saved.ok && saved.error.code !== "already-exists") return err(squadAdminError("unknown"));
    if (saved.ok) created.push(managed);
  }

  await audit(deps, {
    action: "squads.seeded",
    actorUid: actor.uid,
    targetUid: "squads",
    details: { ids: created.map((squad) => squad.id).join(",") },
  });
  return ok(created);
}

export async function createSquad(
  deps: SquadAdminDeps,
  actor: SquadAdminActor,
  input: { id: string; name: string; tagline: string; sprite: unknown; logoPath?: string | null },
): Promise<Result<ManagedSquad, SquadAdminError>> {
  if (forbidden(actor)) return err(squadAdminError("forbidden"));

  const name = normalizeSquadName(input.name);
  if (name === null) return err(squadAdminError("invalid-name"));
  const tagline = normalizeTagline(input.tagline);
  if (tagline === null) return err(squadAdminError("invalid-tagline"));
  if (!isSquadId(input.id)) return err(squadAdminError("invalid-id"));
  const logo = chooseImage(deps.images, "squad-logo", input.logoPath);
  if (!logo) return err(squadAdminError("invalid-image"));
  const uploaded = !logo.keep && logo.image !== null;
  // With an uploaded logo the drawing is optional: a blank one gives way to a plain shield.
  const sprite = validateLogo(input.sprite) ?? (uploaded ? FALLBACK_LOGO : null);
  if (sprite === null) return err(squadAdminError("invalid-logo"));

  const listed = await deps.store.list();
  if (!listed.ok) return err(squadAdminError("unknown"));
  const order = listed.value.reduce((last, squad) => Math.max(last, squad.order), -1) + 1;

  const squad: ManagedSquad = { id: input.id, name, tagline, sprite, logo: logo.keep ? null : logo.image, active: true, order };
  const saved = await deps.store.create(squad);
  if (!saved.ok) return err(squadAdminError(saved.error.code === "already-exists" ? "already-exists" : "unknown"));

  await audit(deps, { action: "squad.created", actorUid: actor.uid, targetUid: squad.id, details: { name } });
  return ok(squad);
}

/** Changes the name, the tagline and/or the logo. The id never changes: profiles store it. */
export async function updateSquad(
  deps: SquadAdminDeps,
  actor: SquadAdminActor,
  input: { id: string; name?: string; tagline?: string; sprite?: unknown; logoPath?: string | null },
): Promise<Result<ManagedSquad, SquadAdminError>> {
  if (forbidden(actor)) return err(squadAdminError("forbidden"));
  if (!isSquadId(input.id)) return err(squadAdminError("not-found"));

  const patch: Partial<Pick<Squad, "name" | "tagline" | "sprite" | "logo">> = {};
  const logo = chooseImage(deps.images, "squad-logo", input.logoPath);
  if (!logo) return err(squadAdminError("invalid-image"));
  if (!logo.keep) patch.logo = logo.image;
  if (input.name !== undefined) {
    const name = normalizeSquadName(input.name);
    if (name === null) return err(squadAdminError("invalid-name"));
    patch.name = name;
  }
  if (input.tagline !== undefined) {
    const tagline = normalizeTagline(input.tagline);
    if (tagline === null) return err(squadAdminError("invalid-tagline"));
    patch.tagline = tagline;
  }
  if (input.sprite !== undefined) {
    const sprite = validateLogo(input.sprite);
    // A blank drawing next to a new uploaded logo keeps the drawing it had.
    if (sprite === null && !(patch.logo !== undefined && patch.logo !== null)) return err(squadAdminError("invalid-logo"));
    if (sprite !== null) patch.sprite = sprite;
  }

  const updated = await deps.store.update(input.id, patch);
  if (!updated.ok) return err(squadAdminError("unknown"));
  if (updated.value === null) return err(squadAdminError("not-found"));

  const { before, after } = updated.value;
  await dropReplacedImage(deps.images, before.logo ?? null, after.logo ?? null);
  const changed = [
    before.name !== after.name ? "name" : null,
    before.tagline !== after.tagline ? "tagline" : null,
    JSON.stringify(before.sprite) !== JSON.stringify(after.sprite) ? "logo" : null,
    (before.logo?.path ?? null) !== (after.logo?.path ?? null) ? "uploaded-logo" : null,
  ].filter((field): field is string => field !== null);
  if (changed.length > 0) {
    await audit(deps, { action: "squad.updated", actorUid: actor.uid, targetUid: input.id, details: { changed: changed.join(",") } });
  }
  return ok(after);
}

/**
 * Stops offering a squad to new attendees. Only once the event is over, so nobody's team disappears from
 * the offer mid-event. Its members keep it: nothing about them changes, and it can be reactivated.
 */
export async function retireSquad(
  deps: SquadAdminDeps,
  actor: SquadAdminActor,
  input: { id: string },
): Promise<Result<ManagedSquad, SquadAdminError>> {
  if (forbidden(actor)) return err(squadAdminError("forbidden"));
  if (!isSquadId(input.id)) return err(squadAdminError("not-found"));

  const finished = await deps.clock.hasFinished();
  if (!finished.ok) return err(squadAdminError("unknown"));
  if (!finished.value) return err(squadAdminError("event-not-finished"));

  return setActive(deps, actor, input.id, false);
}

/** Offers a retired squad again. Allowed at any time. */
export async function reactivateSquad(
  deps: SquadAdminDeps,
  actor: SquadAdminActor,
  input: { id: string },
): Promise<Result<ManagedSquad, SquadAdminError>> {
  if (forbidden(actor)) return err(squadAdminError("forbidden"));
  if (!isSquadId(input.id)) return err(squadAdminError("not-found"));
  return setActive(deps, actor, input.id, true);
}

async function setActive(
  deps: SquadAdminDeps,
  actor: SquadAdminActor,
  id: string,
  active: boolean,
): Promise<Result<ManagedSquad, SquadAdminError>> {
  const updated = await deps.store.update(id, { active });
  if (!updated.ok) return err(squadAdminError("unknown"));
  if (updated.value === null) return err(squadAdminError("not-found"));

  if (updated.value.before.active !== active) {
    await audit(deps, {
      action: active ? "squad.reactivated" : "squad.retired",
      actorUid: actor.uid,
      targetUid: id,
      details: { name: updated.value.after.name },
    });
  }
  return ok(updated.value.after);
}

/** Moves a squad to a place in the list attendees see (clamped to its ends); its own place is a no-op. */
export async function moveSquad(
  deps: SquadAdminDeps,
  actor: SquadAdminActor,
  input: { id: string; to: number },
): Promise<Result<readonly string[], SquadAdminError>> {
  if (forbidden(actor)) return err(squadAdminError("forbidden"));

  const listed = await deps.store.list();
  if (!listed.ok) return err(squadAdminError("unknown"));

  const ids = listed.value.map((squad) => squad.id);
  const from = ids.indexOf(input.id);
  if (from < 0) return err(squadAdminError("not-found"));
  const to = Math.min(Math.max(input.to, 0), ids.length - 1);
  if (to === from) return ok(ids);

  ids.splice(to, 0, ...ids.splice(from, 1));
  const saved = await deps.store.setOrder(ids);
  if (!saved.ok) return err(squadAdminError("unknown"));

  await audit(deps, { action: "squad.reordered", actorUid: actor.uid, targetUid: input.id, details: { order: ids.join(",") } });
  return ok(ids);
}
