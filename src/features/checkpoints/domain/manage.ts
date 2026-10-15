import { isCheckpointId, isCheckpointKind, type CheckpointKind } from "@/features/checkins";
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
  /** The food gate of a catering checkpoint (none by default); other kinds never have one. */
  requirements: FoodRequirements;
}

export interface CheckpointStore {
  /** Every checkpoint of the active edition, active or not, ordered by name. */
  list(): Promise<Result<readonly ManagedCheckpoint[], { code: string }>>;
  /** Fails with `already-exists` when the id is taken: the id is the document id and never changes hands. */
  create(checkpoint: ManagedCheckpoint): Promise<Result<void, { code: "already-exists" | "unknown" }>>;
  /** `null` when the checkpoint does not exist. */
  update(
    id: string,
    patch: { name?: string; active?: boolean; requirements?: FoodRequirements },
  ): Promise<Result<{ before: ManagedCheckpoint; after: ManagedCheckpoint } | null, { code: string }>>;
}

export interface ManageAuditEntry {
  action: "checkpoint.created" | "checkpoint.renamed" | "checkpoint.activated" | "checkpoint.deactivated" | "checkpoint.requirements";
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
  now: () => Date;
}

/** Who is asking. The server action takes it from the verified session, never from the request. */
export interface ManageActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 60;

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

/** Creates a checkpoint, open from the start. Its kind and id cannot be changed later: scans and reports refer to them. */
export async function createCheckpoint(
  deps: ManageDeps,
  actor: ManageActor,
  input: { name: string; id: string; kind: string },
): Promise<Result<ManagedCheckpoint, ManageError>> {
  const denied = requireAdmin(actor);
  if (denied) return err(denied);

  const name = normalizeName(input.name);
  if (name === null) return err(manageError("invalid-name"));
  if (!isCheckpointId(input.id)) return err(manageError("invalid-id"));
  // Talks are created in Charlas, with their speaker and schedule; Puestos creates the stations staff operate.
  if (!isCheckpointKind(input.kind) || !isStationKind(input.kind)) return err(manageError("invalid-kind"));

  const checkpoint: ManagedCheckpoint = { id: input.id, kind: input.kind, name, active: true, requirements: NO_FOOD_REQUIREMENTS };
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

export async function renameCheckpoint(
  deps: ManageDeps,
  actor: ManageActor,
  input: { id: string; name: string },
): Promise<Result<ManagedCheckpoint, ManageError>> {
  const denied = requireAdmin(actor);
  if (denied) return err(denied);

  const name = normalizeName(input.name);
  if (name === null) return err(manageError("invalid-name"));
  if (!isCheckpointId(input.id)) return err(manageError("not-found"));

  const updated = await deps.store.update(input.id, { name });
  if (!updated.ok) return err(manageError("unknown"));
  if (updated.value === null) return err(manageError("not-found"));
  // Saving the same name again is not a change worth a line in the audit trail.
  if (updated.value.before.name !== updated.value.after.name) {
    await audit(deps, {
      action: "checkpoint.renamed",
      actorUid: actor.uid,
      targetUid: input.id,
      details: { from: updated.value.before.name, to: name },
    });
  }
  return ok(updated.value.after);
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

const describeRequirements = (requirements: FoodRequirements) => ({
  minLevel: requirements.minLevel === null ? null : String(requirements.minLevel),
  minTalks: requirements.minTalks === null ? null : String(requirements.minTalks),
});

/**
 * Sets the food gate of a catering checkpoint: a minimum level and a minimum of talks attended, each
 * optional (none by default). It applies to the next scan, staff or self-service; rations already
 * handed out stay.
 */
export async function setFoodRequirements(
  deps: ManageDeps,
  actor: ManageActor,
  input: { id: string; minLevel: number | null; minTalks: number | null },
): Promise<Result<ManagedCheckpoint, ManageError>> {
  const denied = requireAdmin(actor);
  if (denied) return err(denied);
  const checked = checkFoodRequirements({ minLevel: input.minLevel, minTalks: input.minTalks });
  if (!checked.ok) return err(manageError(checked.code));
  if (!isCheckpointId(input.id)) return err(manageError("not-found"));

  // Only meals have a food gate; the kind of a checkpoint never changes, so reading it first is safe.
  const listed = await deps.store.list();
  if (!listed.ok) return err(manageError("unknown"));
  const current = listed.value.find((checkpoint) => checkpoint.id === input.id);
  if (!current) return err(manageError("not-found"));
  if (current.kind !== "catering") return err(manageError("not-catering"));

  const updated = await deps.store.update(input.id, { requirements: checked.value });
  if (!updated.ok) return err(manageError("unknown"));
  if (updated.value === null) return err(manageError("not-found"));

  const { before, after } = updated.value;
  if (before.requirements.minLevel !== after.requirements.minLevel || before.requirements.minTalks !== after.requirements.minTalks) {
    await audit(deps, { action: "checkpoint.requirements", actorUid: actor.uid, targetUid: input.id, details: { name: after.name, ...describeRequirements(after.requirements) } });
  }
  return ok(after);
}
