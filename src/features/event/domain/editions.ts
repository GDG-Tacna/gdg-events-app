import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { isEventId } from "@/shared/types/event";
import { fromEventLocal } from "./event";

/**
 * The editions of the event (one per `events/{eventId}`): each has a name, where and when it happens, and
 * whether it is still being prepared or already over. One of them is public, the one cadets, staff and the
 * stage use (`config/app.activeEventId`); "live" is derived from that, never stored. Only an admin of every
 * edition creates them, finishes them or makes one public; an organizer edits the details of their own.
 */
export const EDITION_NAME_MIN = 3;
export const EDITION_NAME_MAX = 60;
export const EDITION_VENUE_MAX = 80;

export type EditionStatus = "draft" | "finished";

export interface Edition {
  id: string;
  /** `null` for an edition made before editions had names (it shows its id). */
  name: string | null;
  venue: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  status: EditionStatus;
}

export interface EditionListing extends Edition {
  isPublic: boolean;
}

/** What an admin types; dates as a `datetime-local` value in the event's time zone, blank for none. */
export interface EditionDraft {
  name: string;
  venue: string;
  startsAt: string;
  endsAt: string;
}

export type EditionPatch = Partial<Omit<Edition, "id">>;

export type EditionsErrorCode =
  | "invalid-id"
  | "invalid-name"
  | "invalid-venue"
  | "invalid-date"
  | "invalid-range"
  | "already-exists"
  | "already-public"
  | "not-found"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface EditionsError {
  code: EditionsErrorCode;
}

const editionsError = (code: EditionsErrorCode): EditionsError => ({ code });

export interface EditionCatalog {
  /** Every edition that has a document or any data under `events/{id}`. */
  list(): Promise<Result<readonly Edition[], { code: string }>>;
  publicId(): Promise<Result<string, { code: string }>>;
  create(edition: Edition): Promise<Result<void, { code: "already-exists" | "unknown" }>>;
  update(id: string, patch: EditionPatch): Promise<Result<{ before: Edition; after: Edition }, { code: string }>>;
  /** Makes it the public edition and answers which one was public before. */
  publish(id: string): Promise<Result<{ previous: string }, { code: string }>>;
}

export interface EditionsAuditEntry {
  action: "event.created" | "event.updated" | "event.finished" | "event.reopened" | "event.published" | "event.copied" | "event.modules" | "event.permissions";
  actorUid: string;
  targetUid: string;
  details: Record<string, string | null>;
  at: Date;
}

export interface EditionsDeps {
  catalog: EditionCatalog;
  audit: { append(entry: EditionsAuditEntry): Promise<Result<void, { code: string }>> };
  now: () => Date;
}

export interface EditionsActor {
  uid: string;
  role: string | null;
  /** "global" for an admin of every edition; "edition" for an organizer, who only sees the edition it works in. */
  adminScope?: "global" | "edition";
  /** The edition an organizer works in, when it is not the public one. */
  editionId?: string;
}

const isAdmin = (actor: EditionsActor) => actor.role === "admin";
const isGlobal = (actor: EditionsActor) => isAdmin(actor) && actor.adminScope === "global";

async function audit(deps: Pick<EditionsDeps, "audit" | "now">, entry: Omit<EditionsAuditEntry, "at">): Promise<void> {
  const written = await deps.audit.append({ ...entry, at: deps.now() });
  if (!written.ok) logServerError("event.audit.append", new Error(`audit entry missing for ${entry.targetUid}`));
}

/** A suggested id from a name: lower case, no accents, words joined by dashes ("DevFest Tacna 2027" → "devfest-tacna-2027"). */
export function suggestEditionId(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

const tidy = (value: string) => value.trim().replace(/\s+/g, " ");

/** Checks what the admin typed and turns it into the stored fields. */
export function checkEditionDraft(draft: EditionDraft): Result<Omit<Edition, "id" | "status">, EditionsError> {
  const name = tidy(draft.name);
  if (name.length < EDITION_NAME_MIN || name.length > EDITION_NAME_MAX) return err(editionsError("invalid-name"));
  const venue = tidy(draft.venue);
  if (venue.length > EDITION_VENUE_MAX) return err(editionsError("invalid-venue"));

  const date = (value: string): Date | null | undefined => (value.trim() === "" ? null : (fromEventLocal(value.trim()) ?? undefined));
  const startsAt = date(draft.startsAt);
  const endsAt = date(draft.endsAt);
  if (startsAt === undefined || endsAt === undefined) return err(editionsError("invalid-date"));
  if (startsAt && endsAt && startsAt.getTime() > endsAt.getTime()) return err(editionsError("invalid-range"));

  return ok({ name, venue: venue === "" ? null : venue, startsAt, endsAt });
}

/** The public edition first, then the newest by start date (undated last), then by id. */
function byRelevance(a: EditionListing, b: EditionListing): number {
  if (a.isPublic !== b.isPublic) return a.isPublic ? -1 : 1;
  const time = (edition: Edition) => edition.startsAt?.getTime() ?? -Infinity;
  return time(b) - time(a) || a.id.localeCompare(b.id);
}

/** Every edition for an admin of all of them; only the one it works in for an organizer. */
export async function listEditions(deps: Pick<EditionsDeps, "catalog">, actor: EditionsActor): Promise<Result<readonly EditionListing[], EditionsError>> {
  if (!isAdmin(actor)) return err(editionsError("forbidden"));
  const [listed, publicId] = await Promise.all([deps.catalog.list(), deps.catalog.publicId()]);
  if (!listed.ok || !publicId.ok) return err(editionsError("unknown"));

  const editions: EditionListing[] = listed.value.map((edition) => ({ ...edition, isPublic: edition.id === publicId.value }));
  // A brand new project serves its default edition before anything was written under it.
  if (!editions.some((edition) => edition.isPublic)) {
    editions.push({ id: publicId.value, name: null, venue: null, startsAt: null, endsAt: null, status: "draft", isPublic: true });
  }
  const own = actor.editionId ?? publicId.value;
  const visible = isGlobal(actor) ? editions : editions.filter((edition) => edition.id === own);
  return ok(visible.sort(byRelevance));
}

async function knownIds(deps: Pick<EditionsDeps, "catalog">): Promise<Result<{ ids: ReadonlySet<string>; publicId: string }, EditionsError>> {
  const [listed, publicId] = await Promise.all([deps.catalog.list(), deps.catalog.publicId()]);
  if (!listed.ok || !publicId.ok) return err(editionsError("unknown"));
  return ok({ ids: new Set([...listed.value.map((edition) => edition.id), publicId.value]), publicId: publicId.value });
}

export async function createEdition(deps: EditionsDeps, actor: EditionsActor, input: { id: string; draft: EditionDraft }): Promise<Result<Edition, EditionsError>> {
  if (!isGlobal(actor)) return err(editionsError("forbidden"));
  if (!isEventId(input.id)) return err(editionsError("invalid-id"));
  const checked = checkEditionDraft(input.draft);
  if (!checked.ok) return checked;

  // An id with data but no document (an edition from before) is taken too.
  const known = await knownIds(deps);
  if (!known.ok) return known;
  if (known.value.ids.has(input.id)) return err(editionsError("already-exists"));

  const edition: Edition = { id: input.id, ...checked.value, status: "draft" };
  const created = await deps.catalog.create(edition);
  if (!created.ok) return err(editionsError(created.error.code === "already-exists" ? "already-exists" : "unknown"));
  await audit(deps, { action: "event.created", actorUid: actor.uid, targetUid: edition.id, details: { name: edition.name } });
  return ok(edition);
}

/** An admin of every edition edits any of them; an organizer only the one it works in. */
export async function updateEdition(deps: EditionsDeps, actor: EditionsActor, input: { id: string; draft: EditionDraft }): Promise<Result<Edition, EditionsError>> {
  if (!isAdmin(actor)) return err(editionsError("forbidden"));
  if (!isEventId(input.id)) return err(editionsError("not-found"));
  const checked = checkEditionDraft(input.draft);
  if (!checked.ok) return checked;

  const known = await knownIds(deps);
  if (!known.ok) return known;
  if (!known.value.ids.has(input.id)) return err(editionsError("not-found"));
  if (!isGlobal(actor) && input.id !== (actor.editionId ?? known.value.publicId)) return err(editionsError("forbidden"));

  const updated = await deps.catalog.update(input.id, checked.value);
  if (!updated.ok) return err(editionsError("unknown"));
  const { before, after } = updated.value;
  const iso = (date: Date | null) => date?.toISOString() ?? null;
  const changed = [
    before.name !== after.name && "name",
    before.venue !== after.venue && "venue",
    iso(before.startsAt) !== iso(after.startsAt) && "startsAt",
    iso(before.endsAt) !== iso(after.endsAt) && "endsAt",
  ].filter((field): field is string => typeof field === "string");
  if (changed.length > 0) {
    await audit(deps, { action: "event.updated", actorUid: actor.uid, targetUid: input.id, details: { changed: changed.join(","), endsAt: iso(after.endsAt) } });
  }
  return ok(after);
}

export async function setEditionStatus(deps: EditionsDeps, actor: EditionsActor, input: { id: string; status: EditionStatus }): Promise<Result<Edition, EditionsError>> {
  if (!isGlobal(actor)) return err(editionsError("forbidden"));
  const known = await knownIds(deps);
  if (!known.ok) return known;
  if (!known.value.ids.has(input.id)) return err(editionsError("not-found"));

  const updated = await deps.catalog.update(input.id, { status: input.status });
  if (!updated.ok) return err(editionsError("unknown"));
  if (updated.value.before.status !== input.status) {
    await audit(deps, { action: input.status === "finished" ? "event.finished" : "event.reopened", actorUid: actor.uid, targetUid: input.id, details: {} });
  }
  return ok(updated.value.after);
}

/** Makes an edition the one cadets, staff and the stage use. The previous one keeps all its data. */
export async function publishEdition(deps: EditionsDeps, actor: EditionsActor, input: { id: string }): Promise<Result<{ previous: string }, EditionsError>> {
  if (!isGlobal(actor)) return err(editionsError("forbidden"));
  const known = await knownIds(deps);
  if (!known.ok) return known;
  if (!known.value.ids.has(input.id)) return err(editionsError("not-found"));
  if (known.value.publicId === input.id) return err(editionsError("already-public"));

  const published = await deps.catalog.publish(input.id);
  if (!published.ok) return err(editionsError("unknown"));
  await audit(deps, { action: "event.published", actorUid: actor.uid, targetUid: input.id, details: { previous: published.value.previous } });
  return ok(published.value);
}

export type EditionStage = "live" | "draft" | "finished";

/** One edition someone may pick to work in, as the control center's selector shows it. */
export interface EditionChoice {
  id: string;
  name: string | null;
  isPublic: boolean;
  stage: EditionStage;
}

/** In course when public; finished when marked so or past its end; otherwise a draft. */
export function stageOf(edition: Edition, isPublic: boolean, now: Date): EditionStage {
  if (isPublic) return "live";
  return edition.status === "finished" || (edition.endsAt !== null && edition.endsAt.getTime() <= now.getTime()) ? "finished" : "draft";
}

/**
 * The editions someone may work in: all of them for an admin of every edition, or the ones named (where an
 * organizer is listed). The caller decides who may ask; this only names and orders them.
 */
export async function listEditionChoices(deps: Pick<EditionsDeps, "catalog" | "now">, allowed: "all" | readonly string[]): Promise<Result<readonly EditionChoice[], EditionsError>> {
  const [listed, publicId] = await Promise.all([deps.catalog.list(), deps.catalog.publicId()]);
  if (!listed.ok || !publicId.ok) return err(editionsError("unknown"));
  const editions: EditionListing[] = listed.value.map((edition) => ({ ...edition, isPublic: edition.id === publicId.value }));
  if (!editions.some((edition) => edition.isPublic)) {
    editions.push({ id: publicId.value, name: null, venue: null, startsAt: null, endsAt: null, status: "draft", isPublic: true });
  }
  const now = deps.now();
  return ok(
    editions
      .filter((edition) => allowed === "all" || allowed.includes(edition.id))
      .sort(byRelevance)
      .map((edition) => ({ id: edition.id, name: edition.name, isPublic: edition.isPublic, stage: stageOf(edition, edition.isPublic, now) })),
  );
}
