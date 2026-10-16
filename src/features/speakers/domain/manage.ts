import { chooseImage, dropReplacedImage, type RecordImages } from "@/features/media/constants";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { checkSpeaker, compareSpeakers, type Speaker, type SpeakerDataErrorCode, type SpeakerDraft } from "./speaker";

export type SpeakerAdminErrorCode = SpeakerDataErrorCode | "invalid-image" | "already-exists" | "not-found" | "unauthenticated" | "forbidden" | "disabled" | "unknown";

export interface SpeakerAdminError {
  code: SpeakerAdminErrorCode;
}

const adminError = (code: SpeakerAdminErrorCode): SpeakerAdminError => ({ code });

export type SpeakerPatch = Partial<Omit<Speaker, "id">>;

export interface SpeakerStore {
  /** Every speaker of the edition, active or not. */
  list(): Promise<Result<readonly Speaker[], { code: string }>>;
  create(speaker: Speaker): Promise<Result<void, { code: "already-exists" | "unknown" }>>;
  /** `null` when there is no speaker with that id. */
  update(id: string, patch: SpeakerPatch): Promise<Result<{ before: Speaker; after: Speaker } | null, { code: string }>>;
}

export interface SpeakerAuditEntry {
  action: "speaker.created" | "speaker.updated" | "speaker.activated" | "speaker.deactivated" | "speaker.invited" | "speaker.linked" | "speaker.unlinked";
  actorUid: string;
  targetUid: string;
  details: Record<string, string | null>;
  at: Date;
}

export interface SpeakerAdminDeps {
  store: SpeakerStore;
  images: RecordImages;
  audit: { append(entry: SpeakerAuditEntry): Promise<Result<void, { code: string }>> };
  now: () => Date;
}

export interface SpeakerAdminActor {
  uid: string;
  role: string | null;
}

const forbidden = (actor: SpeakerAdminActor) => actor.role !== "admin";

async function audit(deps: Pick<SpeakerAdminDeps, "audit" | "now">, entry: Omit<SpeakerAuditEntry, "at">): Promise<void> {
  const written = await deps.audit.append({ ...entry, at: deps.now() });
  if (!written.ok) logServerError("speakers.audit.append", new Error(`audit entry missing for ${entry.targetUid}`));
}

/** Every speaker of the edition, alphabetically. Admin only. */
export async function listManagedSpeakers(deps: Pick<SpeakerAdminDeps, "store">, actor: SpeakerAdminActor): Promise<Result<readonly Speaker[], SpeakerAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const listed = await deps.store.list();
  return listed.ok ? ok([...listed.value].sort(compareSpeakers)) : err(adminError("unknown"));
}

/** A new speaker, active, with an optional photo uploaded for a speaker. */
export async function createSpeaker(
  deps: SpeakerAdminDeps,
  actor: SpeakerAdminActor,
  input: { id: string; draft: SpeakerDraft; photoPath: string | null },
): Promise<Result<Speaker, SpeakerAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const checked = checkSpeaker(input.id, input.draft);
  if (!checked.ok) return err(adminError(checked.error));
  const photo = chooseImage(deps.images, "speaker", input.photoPath);
  if (!photo) return err(adminError("invalid-image"));

  const speaker: Speaker = { ...checked.value, photo: photo.keep ? null : photo.image, active: true };
  const saved = await deps.store.create(speaker);
  if (!saved.ok) return err(adminError(saved.error.code === "already-exists" ? "already-exists" : "unknown"));
  await audit(deps, { action: "speaker.created", actorUid: actor.uid, targetUid: speaker.id, details: { name: speaker.name } });
  return ok(speaker);
}

/** Changes everything but the id (talks point at it). `photoPath` undefined keeps the photo; null removes it. */
export async function updateSpeaker(
  deps: SpeakerAdminDeps,
  actor: SpeakerAdminActor,
  input: { id: string; draft: SpeakerDraft; photoPath?: string | null },
): Promise<Result<Speaker, SpeakerAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const checked = checkSpeaker(input.id, input.draft);
  if (!checked.ok) return err(adminError(checked.error === "invalid-id" ? "not-found" : checked.error));
  const photo = chooseImage(deps.images, "speaker", input.photoPath);
  if (!photo) return err(adminError("invalid-image"));

  const { name, headline, bio, links } = checked.value;
  const updated = await deps.store.update(input.id, { name, headline, bio, links, ...(photo.keep ? {} : { photo: photo.image }) });
  if (!updated.ok) return err(adminError("unknown"));
  if (updated.value === null) return err(adminError("not-found"));

  const { before, after } = updated.value;
  await dropReplacedImage(deps.images, before.photo, after.photo);
  const changed = [
    before.name !== after.name && "name",
    before.headline !== after.headline && "headline",
    before.bio !== after.bio && "bio",
    JSON.stringify(before.links) !== JSON.stringify(after.links) && "links",
    before.photo?.path !== after.photo?.path && "photo",
  ].filter((field): field is string => typeof field === "string");
  if (changed.length > 0) await audit(deps, { action: "speaker.updated", actorUid: actor.uid, targetUid: input.id, details: { changed: changed.join(",") } });
  return ok(after);
}

/** Offers a speaker for talks again, or stops offering it (the talks that name it keep it). */
export async function setSpeakerActive(deps: SpeakerAdminDeps, actor: SpeakerAdminActor, input: { id: string; active: boolean }): Promise<Result<Speaker, SpeakerAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const updated = await deps.store.update(input.id, { active: input.active });
  if (!updated.ok) return err(adminError("unknown"));
  if (updated.value === null) return err(adminError("not-found"));
  if (updated.value.before.active !== input.active) {
    await audit(deps, { action: input.active ? "speaker.activated" : "speaker.deactivated", actorUid: actor.uid, targetUid: input.id, details: { name: updated.value.after.name } });
  }
  return ok(updated.value.after);
}
