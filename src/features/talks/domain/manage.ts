import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { checkTalk, compareTalks, type Talk, type TalkDataErrorCode, type TalkDraft } from "./talk";

export type TalkAdminErrorCode = TalkDataErrorCode | "unknown-room" | "unknown-speaker" | "already-exists" | "not-found" | "unauthenticated" | "forbidden" | "disabled" | "unknown";

export interface TalkAdminError {
  code: TalkAdminErrorCode;
}

const adminError = (code: TalkAdminErrorCode): TalkAdminError => ({ code });

export type TalkPatch = Partial<Omit<Talk, "id">>;

export interface TalkStore {
  /** Every talk of the edition, active or not. */
  list(): Promise<Result<readonly Talk[], { code: string }>>;
  /** Fails with `already-exists` when the id is taken by any checkpoint (talks and stations share ids). */
  create(talk: Talk): Promise<Result<void, { code: "already-exists" | "unknown" }>>;
  /** `null` when there is no talk with that id. */
  update(id: string, patch: TalkPatch): Promise<Result<{ before: Talk; after: Talk } | null, { code: string }>>;
}

/** The edition's active zones (the rooms a talk can be in) and its speakers (the quadrants and speakers features answer). */
export interface TalkDirectory {
  roomIds(): Promise<Result<ReadonlySet<string>, { code: string }>>;
  speakerIds(): Promise<Result<ReadonlySet<string>, { code: string }>>;
}

export interface TalkAuditEntry {
  action: "talk.created" | "talk.updated" | "talk.activated" | "talk.deactivated";
  actorUid: string;
  targetUid: string;
  details: Record<string, string | null>;
  at: Date;
}

export interface TalkAdminDeps {
  store: TalkStore;
  directory: TalkDirectory;
  audit: { append(entry: TalkAuditEntry): Promise<Result<void, { code: string }>> };
  now: () => Date;
  /** The venue's fixed UTC offset (`-05:00`), for the times the admin types. */
  utcOffset: string;
}

export interface TalkAdminActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

const forbidden = (actor: TalkAdminActor) => actor.role !== "admin";

async function audit(deps: Pick<TalkAdminDeps, "audit" | "now">, entry: Omit<TalkAuditEntry, "at">): Promise<void> {
  const written = await deps.audit.append({ ...entry, at: deps.now() });
  if (!written.ok) logServerError("talks.audit.append", new Error(`audit entry missing for ${entry.targetUid}`));
}

/** Checks a draft, that its room is an active zone of the edition and that its speakers are the edition's. */
async function checkDraft(deps: TalkAdminDeps, id: string, draft: TalkDraft): Promise<Result<Omit<Talk, "active" | "speaker">, TalkAdminError>> {
  const checked = checkTalk(id, draft, deps.utcOffset);
  if (!checked.ok) return err(adminError(checked.error));
  const speakers = await deps.directory.speakerIds();
  if (!speakers.ok) return err(adminError("unknown"));
  if (!checked.value.speakerIds.every((speakerId) => speakers.value.has(speakerId))) return err(adminError("unknown-speaker"));
  if (checked.value.roomId !== null) {
    const rooms = await deps.directory.roomIds();
    if (!rooms.ok) return err(adminError("unknown"));
    if (!rooms.value.has(checked.value.roomId)) return err(adminError("unknown-room"));
  }
  return ok(checked.value);
}

/** Every talk of the edition in agenda order (by start time, undated last). Admin only. */
export async function listManagedTalks(deps: Pick<TalkAdminDeps, "store">, actor: TalkAdminActor): Promise<Result<readonly Talk[], TalkAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const listed = await deps.store.list();
  return listed.ok ? ok([...listed.value].sort(compareTalks)) : err(adminError("unknown"));
}

/** A new talk, open from the start (its code checks people in as soon as it is projected). */
export async function createTalk(deps: TalkAdminDeps, actor: TalkAdminActor, input: { id: string; draft: TalkDraft }): Promise<Result<Talk, TalkAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const checked = await checkDraft(deps, input.id, input.draft);
  if (!checked.ok) return checked;

  const talk: Talk = { ...checked.value, speaker: null, active: true };
  const saved = await deps.store.create(talk);
  if (!saved.ok) return err(adminError(saved.error.code === "already-exists" ? "already-exists" : "unknown"));
  await audit(deps, { action: "talk.created", actorUid: actor.uid, targetUid: talk.id, details: { title: talk.title } });
  return ok(talk);
}

const FIELDS = ["title", "speakerIds", "startsAt", "endsAt", "roomId", "description"] as const;
const same = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : Array.isArray(a) && Array.isArray(b) ? a.join(",") === b.join(",") : a === b;

/** Changes everything but the id (which other records point to). Audited only when something changed. */
export async function updateTalk(deps: TalkAdminDeps, actor: TalkAdminActor, input: { id: string; draft: TalkDraft }): Promise<Result<Talk, TalkAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const checked = await checkDraft(deps, input.id, input.draft);
  if (!checked.ok) return checked.error.code === "invalid-id" ? err(adminError("not-found")) : checked;

  const { title, speakerIds, startsAt, endsAt, roomId, description } = checked.value;
  const updated = await deps.store.update(input.id, { title, speakerIds, startsAt, endsAt, roomId, description });
  if (!updated.ok) return err(adminError("unknown"));
  if (updated.value === null) return err(adminError("not-found"));

  const { before, after } = updated.value;
  const changed = FIELDS.filter((field) => !same(before[field], after[field]));
  if (changed.length > 0) await audit(deps, { action: "talk.updated", actorUid: actor.uid, targetUid: input.id, details: { changed: changed.join(",") } });
  return ok(after);
}

/** Opens or closes a talk; a closed talk's code no longer checks anyone in. */
export async function setTalkActive(deps: TalkAdminDeps, actor: TalkAdminActor, input: { id: string; active: boolean }): Promise<Result<Talk, TalkAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const updated = await deps.store.update(input.id, { active: input.active });
  if (!updated.ok) return err(adminError("unknown"));
  if (updated.value === null) return err(adminError("not-found"));
  if (updated.value.before.active !== input.active) {
    await audit(deps, { action: input.active ? "talk.activated" : "talk.deactivated", actorUid: actor.uid, targetUid: input.id, details: { title: updated.value.after.title } });
  }
  return ok(updated.value.after);
}
