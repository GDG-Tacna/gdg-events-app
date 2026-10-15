import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { checkCommunication, isSlug, type Communication, type CommunicationDataErrorCode } from "./communication";
import { checkStoryTitle, type StoryTitleStore } from "./story";

export type OdysseyAdminErrorCode =
  | CommunicationDataErrorCode
  | "invalid-story-title"
  | "unknown-quadrant"
  | "unknown-mission"
  | "already-exists"
  | "already-seeded"
  | "not-found"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface OdysseyAdminError {
  code: OdysseyAdminErrorCode;
}

const adminError = (code: OdysseyAdminErrorCode): OdysseyAdminError => ({ code });

/** What the admin edits. The id is chosen on creation and never changes. */
export interface CommunicationDraft {
  quadrantId: string;
  title: string;
  body: string;
  unlockMissionId: string | null;
}

export type CommunicationPatch = Partial<Pick<Communication, "quadrantId" | "title" | "body" | "unlockMissionId" | "active">>;

export interface CommunicationStore {
  list(): Promise<Result<readonly Communication[], { code: string }>>;
  create(communication: Communication): Promise<Result<void, { code: "already-exists" | "unknown" }>>;
  update(id: string, patch: CommunicationPatch): Promise<Result<{ before: Communication; after: Communication } | null, { code: string }>>;
  setOrder(ids: readonly string[]): Promise<Result<void, { code: string }>>;
}

/** The edition's active quadrants and every mission it offers (the quadrants and missions features answer). */
export interface OdysseyDirectory {
  activeQuadrantIds(): Promise<Result<ReadonlySet<string>, { code: string }>>;
  missionIds(): Promise<Result<ReadonlySet<string>, { code: string }>>;
}

export interface OdysseyAuditEntry {
  action: "communications.seeded" | "communication.created" | "communication.updated" | "communication.activated" | "communication.deactivated" | "communication.reordered" | "story.titled";
  actorUid: string;
  targetUid: string;
  details: Record<string, string | null>;
  at: Date;
}

export interface OdysseyAdminDeps {
  store: CommunicationStore;
  directory: OdysseyDirectory;
  audit: { append(entry: OdysseyAuditEntry): Promise<Result<void, { code: string }>> };
  now: () => Date;
}

/** Saving the story's title needs its store and the audit trail, nothing about missions or quadrants. */
export interface StoryAdminDeps extends Pick<OdysseyAdminDeps, "audit" | "now"> {
  titles: StoryTitleStore;
}

export interface OdysseyAdminActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

const forbidden = (actor: OdysseyAdminActor) => actor.role !== "admin";
const byOrder = (a: Communication, b: Communication) => a.order - b.order || a.title.localeCompare(b.title);

async function audit(deps: Pick<OdysseyAdminDeps, "audit" | "now">, entry: Omit<OdysseyAuditEntry, "at">): Promise<void> {
  const written = await deps.audit.append({ ...entry, at: deps.now() });
  if (!written.ok) logServerError("odyssey.audit.append", new Error(`audit entry missing for ${entry.targetUid}`));
}

/** Checks a draft and that its quadrant is active and its mission exists in the edition. */
async function checkDraft(deps: OdysseyAdminDeps, id: string, draft: CommunicationDraft): Promise<Result<Communication, OdysseyAdminError>> {
  const checked = checkCommunication(id, { ...draft, active: true });
  if (!checked.ok) return err(adminError(checked.code));

  const [quadrants, missions] = await Promise.all([deps.directory.activeQuadrantIds(), deps.directory.missionIds()]);
  if (!quadrants.ok || !missions.ok) return err(adminError("unknown"));
  if (!quadrants.value.has(checked.value.quadrantId)) return err(adminError("unknown-quadrant"));
  if (checked.value.unlockMissionId !== null && !missions.value.has(checked.value.unlockMissionId)) return err(adminError("unknown-mission"));
  return ok(checked.value);
}

export async function listManagedCommunications(
  deps: Pick<OdysseyAdminDeps, "store">,
  actor: OdysseyAdminActor,
): Promise<Result<readonly Communication[], OdysseyAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const listed = await deps.store.list();
  return listed.ok ? ok([...listed.value].sort(byOrder)) : err(adminError("unknown"));
}

/** Saves the bundled communications as the edition's own, only into an empty edition, keeping their ids. */
export async function seedCommunications(
  deps: OdysseyAdminDeps,
  actor: OdysseyAdminActor,
  seed: readonly Communication[],
): Promise<Result<readonly Communication[], OdysseyAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const listed = await deps.store.list();
  if (!listed.ok) return err(adminError("unknown"));
  if (listed.value.length > 0) return err(adminError("already-seeded"));

  const created: Communication[] = [];
  for (const communication of seed) {
    const saved = await deps.store.create(communication);
    if (!saved.ok && saved.error.code !== "already-exists") return err(adminError("unknown"));
    if (saved.ok) created.push(communication);
  }
  await audit(deps, { action: "communications.seeded", actorUid: actor.uid, targetUid: "communications", details: { ids: created.map((c) => c.id).join(",") } });
  return ok(created);
}

export async function createCommunication(
  deps: OdysseyAdminDeps,
  actor: OdysseyAdminActor,
  input: { id: string; draft: CommunicationDraft },
): Promise<Result<Communication, OdysseyAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const checked = await checkDraft(deps, input.id, input.draft);
  if (!checked.ok) return checked;

  const listed = await deps.store.list();
  if (!listed.ok) return err(adminError("unknown"));
  const order = Math.max(-1, ...listed.value.map((c) => c.order).filter((value) => value < Number.MAX_SAFE_INTEGER)) + 1;

  const communication: Communication = { ...checked.value, order, active: true };
  const saved = await deps.store.create(communication);
  if (!saved.ok) return err(adminError(saved.error.code === "already-exists" ? "already-exists" : "unknown"));

  await audit(deps, { action: "communication.created", actorUid: actor.uid, targetUid: communication.id, details: { title: communication.title } });
  return ok(communication);
}

export async function updateCommunication(
  deps: OdysseyAdminDeps,
  actor: OdysseyAdminActor,
  input: { id: string; draft: CommunicationDraft },
): Promise<Result<Communication, OdysseyAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  if (!isSlug(input.id)) return err(adminError("not-found"));
  const checked = await checkDraft(deps, input.id, input.draft);
  if (!checked.ok) return checked;

  const { quadrantId, title, body, unlockMissionId } = checked.value;
  const updated = await deps.store.update(input.id, { quadrantId, title, body, unlockMissionId });
  if (!updated.ok) return err(adminError("unknown"));
  if (updated.value === null) return err(adminError("not-found"));

  const { before, after } = updated.value;
  const changed = (["quadrantId", "title", "body", "unlockMissionId"] as const).filter((field) => before[field] !== after[field]);
  if (changed.length > 0) {
    await audit(deps, { action: "communication.updated", actorUid: actor.uid, targetUid: input.id, details: { changed: changed.join(",") } });
  }
  return ok(after);
}

export async function setCommunicationActive(
  deps: OdysseyAdminDeps,
  actor: OdysseyAdminActor,
  input: { id: string; active: boolean },
): Promise<Result<Communication, OdysseyAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  if (!isSlug(input.id)) return err(adminError("not-found"));
  const updated = await deps.store.update(input.id, { active: input.active });
  if (!updated.ok) return err(adminError("unknown"));
  if (updated.value === null) return err(adminError("not-found"));
  if (updated.value.before.active !== input.active) {
    await audit(deps, {
      action: input.active ? "communication.activated" : "communication.deactivated",
      actorUid: actor.uid,
      targetUid: input.id,
      details: { title: updated.value.after.title },
    });
  }
  return ok(updated.value.after);
}

export async function moveCommunication(
  deps: OdysseyAdminDeps,
  actor: OdysseyAdminActor,
  input: { id: string; to: number },
): Promise<Result<readonly string[], OdysseyAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const listed = await deps.store.list();
  if (!listed.ok) return err(adminError("unknown"));

  const ids = [...listed.value].sort(byOrder).map((c) => c.id);
  const from = ids.indexOf(input.id);
  if (from < 0) return err(adminError("not-found"));
  const to = Math.min(Math.max(input.to, 0), ids.length - 1);
  if (to === from) return ok(ids);

  ids.splice(to, 0, ...ids.splice(from, 1));
  const saved = await deps.store.setOrder(ids);
  if (!saved.ok) return err(adminError("unknown"));
  await audit(deps, { action: "communication.reordered", actorUid: actor.uid, targetUid: input.id, details: { order: ids.join(",") } });
  return ok(ids);
}

/** Names the edition's story for cadets; a blank title goes back to the generic name. */
export async function saveStoryTitle(deps: StoryAdminDeps, actor: OdysseyAdminActor, input: { title: string }): Promise<Result<string | null, OdysseyAdminError>> {
  if (forbidden(actor)) return err(adminError("forbidden"));
  const checked = checkStoryTitle(input.title);
  if (!checked.ok) return err(adminError("invalid-story-title"));
  const saved = await deps.titles.saveTitle(checked.value);
  if (!saved.ok) return err(adminError("unknown"));
  await audit(deps, { action: "story.titled", actorUid: actor.uid, targetUid: "story", details: { title: checked.value } });
  return ok(checked.value);
}
