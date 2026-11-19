import { isCheckpointId, isCheckpointKind, type CheckpointKind } from "@/features/checkins";
import { chooseImage, dropReplacedImage, type ImageRef, type RecordImages } from "@/features/media/constants";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { NO_FOOD_REQUIREMENTS, checkFoodRequirements, type FoodRequirements } from "./food-gate";
import { manageError, type ManageError } from "./manage-error";
import { isStationKind } from "./serve";

export interface ManagedCheckpoint {
  id: string;
  kind: CheckpointKind;
  name: string;
  active: boolean;
  /** What the puesto is, for the cadet and the staff (up to 200 characters; empty when it has none). */
  description: string;
  /** Its logo or photo, shown on its QR screen, to the cadet after scanning and to the staff. */
  image: ImageRef | null;
  /** The food gate of a catering checkpoint (none by default); other kinds never have one. */
  requirements: FoodRequirements;
}

/**
 * A change to a checkpoint's fields. `requirements: null` clears the food gate (a puesto that stops being a meal);
 * `image: null` removes the picture.
 */
export interface CheckpointPatch {
  name?: string;
  active?: boolean;
  description?: string;
  image?: ImageRef | null;
  kind?: CheckpointKind;
  requirements?: FoodRequirements | null;
}

/** Why a change to a checkpoint's kind or id was refused by the store (checked in the same transaction as the write). */
export type CheckpointInUse = "has-check-ins" | "has-missions";

export interface CheckpointStore {
  /** Every checkpoint of the active edition, active or not, ordered by name. */
  list(): Promise<Result<readonly ManagedCheckpoint[], { code: string }>>;
  /** Fails with `already-exists` when the id is taken: the id is the document id. */
  create(checkpoint: ManagedCheckpoint): Promise<Result<void, { code: "already-exists" | "unknown" }>>;
  /**
   * `null` when the checkpoint does not exist. A patch that changes the kind fails with `has-check-ins` or
   * `has-missions` when a check-in or a mission refers to the checkpoint (read in the same transaction).
   */
  update(id: string, patch: CheckpointPatch): Promise<Result<{ before: ManagedCheckpoint; after: ManagedCheckpoint } | null, { code: CheckpointInUse | "unknown" }>>;
  /**
   * Moves a checkpoint to a new id with the patch applied, in one transaction: the new document gets every field, the
   * old one is deleted, and every staff scope that listed the old id lists the new one. Refused (nothing written) when
   * a check-in or a mission refers to the old id, or the new id is taken. `null` when the checkpoint does not exist.
   */
  rekey(
    oldId: string,
    newId: string,
    patch: CheckpointPatch,
  ): Promise<Result<{ before: ManagedCheckpoint; after: ManagedCheckpoint } | null, { code: CheckpointInUse | "already-exists" | "unknown" }>>;
  /**
   * Deletes the checkpoint unless a check-in or a mission refers to it, and takes it out of every staff scope; the
   * checks and the writes are one transaction.
   */
  delete(id: string): Promise<Result<CheckpointDeletion, { code: string }>>;
  /** For each id, whether a check-in and whether a mission refers to it (what locks its kind and id). */
  usage(ids: readonly string[]): Promise<Result<Readonly<Record<string, { checkIns: boolean; missions: boolean }>>, { code: string }>>;
}

export type CheckpointDeletion = { kind: "deleted"; checkpoint: ManagedCheckpoint } | { kind: "not-found" } | { kind: "has-check-ins" } | { kind: "has-missions" };

/**
 * The stands drawn on the edition's venue plan (`stand-{areaId}`). Saving the plan re-creates them, so their kind and
 * id belong to the plan (Zonas), not to Puestos.
 */
export interface PlanStands {
  ids(): Promise<Result<readonly string[], { code: string }>>;
}

export interface ManageAuditEntry {
  action: "checkpoint.created" | "checkpoint.updated" | "checkpoint.reidentified" | "checkpoint.activated" | "checkpoint.deactivated" | "checkpoint.deleted";
  actorUid: string;
  targetUid: string;
  details: Record<string, string | null>;
  at: Date;
}

/** The admin's append-only trail (the admin feature's audit log satisfies it). */
export interface ManageAudit {
  append(entry: ManageAuditEntry): Promise<Result<void, { code: string }>>;
}

export interface ManageDeps {
  store: CheckpointStore;
  audit: ManageAudit;
  /** Checks the image a form sent and deletes the one a puesto no longer uses. */
  images: RecordImages;
  planStands: PlanStands;
  now: () => Date;
}

/** Who is asking. The server action takes it from the verified session, never from the request. */
export interface ManageActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 60;
export const DESCRIPTION_MAX_LENGTH = 200;

/** Trimmed, or `null` when longer than 200 characters (the same rule as a mission's description). */
export function normalizeDescription(input: string | undefined): string | null {
  const description = (input ?? "").trim();
  return description.length <= DESCRIPTION_MAX_LENGTH ? description : null;
}

/** Trimmed and collapsed spaces, or `null` when the length is out of range. */
export function normalizeName(input: string): string | null {
  const name = input.trim().replace(/\s+/g, " ");
  return name.length >= NAME_MIN_LENGTH && name.length <= NAME_MAX_LENGTH ? name : null;
}

/**
 * A suggestion for the id from the name: lowercase letters, digits and hyphens ("Almuerzo día 1" becomes
 * "almuerzo-dia-1"). Accents are dropped, not kept. The admin can edit it before saving.
 */
export function suggestId(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

const requireAdmin = (actor: ManageActor): ManageError | null => (actor.role === "admin" ? null : manageError("forbidden"));

async function audit(
  deps: ManageDeps,
  entry: Omit<ManageAuditEntry, "at">,
): Promise<void> {
  const written = await deps.audit.append({ ...entry, at: deps.now() });
  // A change that already happened is not undone by a missing audit line, but it must not go unnoticed.
  if (!written.ok) logServerError("checkpoints.audit.append", new Error(`audit entry missing for ${entry.targetUid}`));
}

export async function listCheckpoints(
  deps: Pick<ManageDeps, "store">,
  actor: ManageActor,
): Promise<Result<readonly ManagedCheckpoint[], ManageError>> {
  const denied = requireAdmin(actor);
  if (denied) return err(denied);

  const listed = await deps.store.list();
  return listed.ok ? ok(listed.value) : err(manageError("unknown"));
}

/**
 * Creates a checkpoint, open from the start, with an optional description and image. Its kind and id can change later
 * only while nothing refers to it (see `editCheckpoint`).
 */
export async function createCheckpoint(
  deps: ManageDeps,
  actor: ManageActor,
  input: { name: string; id: string; kind: string; description?: string; imagePath?: string | null },
): Promise<Result<ManagedCheckpoint, ManageError>> {
  const denied = requireAdmin(actor);
  if (denied) return err(denied);

  const name = normalizeName(input.name);
  if (name === null) return err(manageError("invalid-name"));
  if (!isCheckpointId(input.id)) return err(manageError("invalid-id"));
  // Talks are created in Charlas, with their speaker and schedule; Puestos creates the stations staff operate.
  if (!isCheckpointKind(input.kind) || !isStationKind(input.kind)) return err(manageError("invalid-kind"));
  const description = normalizeDescription(input.description);
  if (description === null) return err(manageError("invalid-description"));
  const image = chooseImage(deps.images, "checkpoint", input.imagePath);
  if (!image) return err(manageError("invalid-image"));

  const checkpoint: ManagedCheckpoint = {
    id: input.id,
    kind: input.kind,
    name,
    active: true,
    description,
    image: image.keep ? null : image.image,
    requirements: NO_FOOD_REQUIREMENTS,
  };
  const created = await deps.store.create(checkpoint);
  if (!created.ok) return err(manageError(created.error.code === "already-exists" ? "already-exists" : "unknown"));

  await audit(deps, {
    action: "checkpoint.created",
    actorUid: actor.uid,
    targetUid: checkpoint.id,
    details: { kind: checkpoint.kind, name },
  });
  return ok(checkpoint);
}

/** Why a puesto's kind and id cannot change, or `null` when they can (as far as the stored data tells). */
export type IdentityLock = "from-plan" | "has-check-ins" | "has-missions" | null;

/**
 * For each puesto (by id), why its kind and id are locked: it is a stand of the venue plan, a cadet checked in there, or
 * a mission points at it. The edit dialog shows the reason; the server checks again on save.
 */
export async function listIdentityLocks(
  deps: Pick<ManageDeps, "store" | "planStands">,
  actor: ManageActor,
  checkpoints: readonly Pick<ManagedCheckpoint, "id" | "kind">[],
): Promise<Result<Readonly<Record<string, IdentityLock>>, ManageError>> {
  const denied = requireAdmin(actor);
  if (denied) return err(denied);

  const [planned, used] = await Promise.all([deps.planStands.ids(), deps.store.usage(checkpoints.map((checkpoint) => checkpoint.id))]);
  if (!planned.ok || !used.ok) return err(manageError("unknown"));
  const locks: Record<string, IdentityLock> = {};
  for (const checkpoint of checkpoints) {
    const usage = used.value[checkpoint.id];
    locks[checkpoint.id] =
      checkpoint.kind === "stand" && planned.value.includes(checkpoint.id) ? "from-plan" : usage?.checkIns ? "has-check-ins" : usage?.missions ? "has-missions" : null;
  }
  return ok(locks);
}

const sameRequirements = (a: FoodRequirements, b: FoodRequirements) => a.minLevel === b.minLevel && a.minTalks === b.minTalks && a.minTicket === b.minTicket;

const describeRequirements = (requirements: FoodRequirements) => ({
  minLevel: requirements.minLevel === null ? null : String(requirements.minLevel),
  minTalks: requirements.minTalks === null ? null : String(requirements.minTalks),
  minTicket: requirements.minTicket,
});

export interface EditCheckpointInput {
  id: string;
  name: string;
  description: string;
  /** `undefined` keeps the image, `null` removes it, a path sets an uploaded one. */
  imagePath?: string | null;
  /** A new kind (entrance, catering or stand). Absent keeps it. */
  kind?: string;
  /** A new id. Absent keeps it. */
  newId?: string;
  /** The food gate, for a puesto that is (or becomes) a catering one. Absent keeps it. */
  requirements?: { minLevel: number | null; minTalks: number | null; minTicket?: string | null };
}

/**
 * Edits a puesto: its name, description, image and, for a meal, its food gate, always; its kind and id only while
 * nothing refers to it (no check-in, no mission: the store checks in the same transaction as the write) and only when
 * it is not a stand of the venue plan (saving the plan would re-create it). Whether the edition lets this admin change
 * them (as deleting) is checked by the caller. A puesto that stops being a meal loses its food gate; a new id moves the
 * document and the staff scopes that list it. Talks are never edited here (they live in Charlas).
 */
export async function editCheckpoint(deps: ManageDeps, actor: ManageActor, input: EditCheckpointInput): Promise<Result<ManagedCheckpoint, ManageError>> {
  const denied = requireAdmin(actor);
  if (denied) return err(denied);
  if (!isCheckpointId(input.id)) return err(manageError("not-found"));

  const name = normalizeName(input.name);
  if (name === null) return err(manageError("invalid-name"));
  const description = normalizeDescription(input.description);
  if (description === null) return err(manageError("invalid-description"));
  const image = chooseImage(deps.images, "checkpoint", input.imagePath);
  if (!image) return err(manageError("invalid-image"));
  if (input.kind !== undefined && (!isCheckpointKind(input.kind) || !isStationKind(input.kind))) return err(manageError("invalid-kind"));
  if (input.newId !== undefined && !isCheckpointId(input.newId)) return err(manageError("invalid-id"));
  let requirements: FoodRequirements | undefined;
  if (input.requirements !== undefined) {
    const checked = checkFoodRequirements(input.requirements);
    if (!checked.ok) return err(manageError(checked.code));
    requirements = checked.value;
  }

  const listed = await deps.store.list();
  if (!listed.ok) return err(manageError("unknown"));
  const current = listed.value.find((checkpoint) => checkpoint.id === input.id);
  if (!current || !isStationKind(current.kind)) return err(manageError("not-found"));

  const kind: CheckpointKind = input.kind !== undefined && isCheckpointKind(input.kind) ? input.kind : current.kind;
  const newId = input.newId ?? current.id;
  const kindChanged = kind !== current.kind;
  const idChanged = newId !== current.id;
  if (requirements !== undefined && kind !== "catering") return err(manageError("not-catering"));

  if (kindChanged || idChanged) {
    const planned = await deps.planStands.ids();
    if (!planned.ok) return err(manageError("unknown"));
    if (current.kind === "stand" && planned.value.includes(current.id)) return err(manageError("from-plan"));
  }

  const patch: CheckpointPatch = {
    name,
    description,
    ...(image.keep ? {} : { image: image.image }),
    ...(kindChanged ? { kind } : {}),
    // Only a meal has a food gate: one that stops being a meal loses it.
    ...(kind === "catering" ? (requirements !== undefined ? { requirements } : {}) : current.kind === "catering" ? { requirements: null } : {}),
  };
  const saved = idChanged ? await deps.store.rekey(current.id, newId, patch) : await deps.store.update(current.id, patch);
  if (!saved.ok) {
    const code = saved.error.code;
    return err(manageError(code === "has-check-ins" || code === "has-missions" || code === "already-exists" ? code : "unknown"));
  }
  if (saved.value === null) return err(manageError("not-found"));

  const { before, after } = saved.value;
  await dropReplacedImage(deps.images, before.image, after.image);
  if (idChanged) {
    await audit(deps, { action: "checkpoint.reidentified", actorUid: actor.uid, targetUid: after.id, details: { from: before.id, to: after.id, name: after.name } });
  }
  const changed = [
    ...(before.name !== after.name ? ["name"] : []),
    ...(before.description !== after.description ? ["description"] : []),
    ...((before.image?.path ?? null) !== (after.image?.path ?? null) ? ["image"] : []),
    ...(before.kind !== after.kind ? ["kind"] : []),
    ...(!sameRequirements(before.requirements, after.requirements) ? ["requirements"] : []),
  ];
  // Saving the same values again is not a change worth a line in the audit trail.
  if (changed.length > 0) {
    await audit(deps, {
      action: "checkpoint.updated",
      actorUid: actor.uid,
      targetUid: after.id,
      details: {
        changed: changed.join(","),
        name: after.name,
        ...(before.name !== after.name ? { from: before.name } : {}),
        ...(before.kind !== after.kind ? { fromKind: before.kind, toKind: after.kind } : {}),
        ...(after.kind === "catering" ? describeRequirements(after.requirements) : {}),
      },
    });
  }
  return ok(after);
}

/** Opens or closes a checkpoint. Closed ones keep their history (check-ins refer to them) but stop accepting scans. */
export async function setCheckpointActive(
  deps: ManageDeps,
  actor: ManageActor,
  input: { id: string; active: boolean },
): Promise<Result<ManagedCheckpoint, ManageError>> {
  const denied = requireAdmin(actor);
  if (denied) return err(denied);
  if (!isCheckpointId(input.id)) return err(manageError("not-found"));

  const updated = await deps.store.update(input.id, { active: input.active });
  if (!updated.ok) return err(manageError("unknown"));
  if (updated.value === null) return err(manageError("not-found"));

  if (updated.value.before.active !== updated.value.after.active) {
    await audit(deps, {
      action: input.active ? "checkpoint.activated" : "checkpoint.deactivated",
      actorUid: actor.uid,
      targetUid: input.id,
      details: { name: updated.value.after.name },
    });
  }
  return ok(updated.value.after);
}

/**
 * Deletes a station nobody has used: no cadet checked in there and no mission points at it (a station with history is
 * only closed). Staff limited to it lose it from their scope, and its image is deleted. The phase of the edition is
 * checked by the caller.
 */
export async function deleteCheckpoint(deps: ManageDeps, actor: ManageActor, input: { id: string }): Promise<Result<ManagedCheckpoint, ManageError>> {
  const denied = requireAdmin(actor);
  if (denied) return err(denied);
  if (!isCheckpointId(input.id)) return err(manageError("not-found"));

  const deleted = await deps.store.delete(input.id);
  if (!deleted.ok) return err(manageError("unknown"));
  if (deleted.value.kind === "not-found") return err(manageError("not-found"));
  if (deleted.value.kind === "has-check-ins") return err(manageError("has-check-ins"));
  if (deleted.value.kind === "has-missions") return err(manageError("has-missions"));

  const { checkpoint } = deleted.value;
  await dropReplacedImage(deps.images, checkpoint.image, null);
  await audit(deps, { action: "checkpoint.deleted", actorUid: actor.uid, targetUid: checkpoint.id, details: { kind: checkpoint.kind, name: checkpoint.name } });
  return ok(checkpoint);
}
