import type { ImageRef, RecordImages } from "@/features/media/constants";
import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { isQuadrantId, isQuadrantPlanet, normalizeQuadrantName, normalizeQuadrantTagline, type Quadrant } from "./quadrant";
import { parseVenueMap, type VenueMap } from "./venue";

export type QuadrantAdminErrorCode =
  | "invalid-name"
  | "invalid-tagline"
  | "invalid-planet"
  | "invalid-id"
  | "invalid-venue"
  | "invalid-image"
  /** A stand points to a quadrant the edition does not have. */
  | "unknown-quadrant"
  | "already-exists"
  | "already-seeded"
  | "not-found"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface QuadrantAdminError {
  code: QuadrantAdminErrorCode;
}

export const quadrantAdminError = (code: QuadrantAdminErrorCode): QuadrantAdminError => ({ code });

export type QuadrantPatch = Partial<Pick<Quadrant, "name" | "tagline" | "planet" | "active">>;

export interface QuadrantAdminStore {
  /** The quadrants the edition has saved (active and inactive), in no particular order. */
  listQuadrants(): Promise<Result<readonly Quadrant[], { code: string }>>;
  /** Fails with `already-exists` when the id is taken. */
  createQuadrant(quadrant: Quadrant): Promise<Result<void, { code: "already-exists" | "unknown" }>>;
  /** `null` when the quadrant does not exist. */
  updateQuadrant(id: string, patch: QuadrantPatch): Promise<Result<{ before: Quadrant; after: Quadrant } | null, { code: string }>>;
  setQuadrantOrder(ids: readonly string[]): Promise<Result<void, { code: string }>>;
  /** The plan the edition saved, or `null` while it has none (or it cannot be drawn). */
  loadVenue(): Promise<Result<VenueMap | null, { code: string }>>;
  saveVenue(venue: VenueMap): Promise<Result<void, { code: string }>>;
}

/**
 * Makes sure each stand has its printed-QR checkpoint `stand-{areaId}` (the checkpoints feature does it).
 * Existing checkpoints are left as they are. Reports the ids it created and those it could not.
 */
export interface StandCheckpoints {
  ensure(actor: QuadrantAdminActor, stands: ReadonlyArray<{ id: string; name: string }>): Promise<{ created: string[]; failed: string[] }>;
}

export interface QuadrantAuditEntry {
  action: "layout.seeded" | "quadrant.created" | "quadrant.updated" | "quadrant.activated" | "quadrant.deactivated" | "quadrant.reordered" | "venue.saved";
  actorUid: string;
  targetUid: string;
  details: Record<string, string | null>;
  at: Date;
}

export interface QuadrantAudit {
  append(entry: QuadrantAuditEntry): Promise<Result<void, { code: string }>>;
}

export interface QuadrantAdminDeps {
  store: QuadrantAdminStore;
  stands: StandCheckpoints;
  images: RecordImages;
  audit: QuadrantAudit;
  /** The bundled quadrants and plan, served (and editable as a starting point) until the edition saves its own. */
  defaults: { quadrants: readonly Quadrant[]; venue: VenueMap };
  now: () => Date;
}

/** Who is asking. The server action takes it from the verified session, never from the request. */
export interface QuadrantAdminActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

/** The checkpoint id of a stand of the plan. */
export const standCheckpointId = (areaId: string) => `stand-${areaId}`;

const forbidden = (actor: QuadrantAdminActor) => actor.role !== "admin";
const byOrder = (a: Quadrant, b: Quadrant) => a.order - b.order || a.name.localeCompare(b.name);

async function audit(deps: Pick<QuadrantAdminDeps, "audit" | "now">, entry: Omit<QuadrantAuditEntry, "at">): Promise<void> {
  const written = await deps.audit.append({ ...entry, at: deps.now() });
  // A change that already happened is not undone by a missing audit line, but it must not go unnoticed.
  if (!written.ok) logServerError("quadrants.audit.append", new Error(`audit entry missing for ${entry.targetUid}`));
}

const standsOf = (venue: VenueMap) => venue.areas.filter((area) => area.kind === "stand").map((area) => ({ id: standCheckpointId(area.id), name: area.label }));

export async function listManagedQuadrants(
  deps: Pick<QuadrantAdminDeps, "store">,
  actor: QuadrantAdminActor,
): Promise<Result<readonly Quadrant[], QuadrantAdminError>> {
  if (forbidden(actor)) return err(quadrantAdminError("forbidden"));
  const listed = await deps.store.listQuadrants();
  return listed.ok ? ok([...listed.value].sort(byOrder)) : err(quadrantAdminError("unknown"));
}

/**
 * Saves the bundled quadrants as the edition's own, only into an edition without quadrants, keeping their
 * ids (missions and stands point to them), and the bundled plan if the edition has none. Then gives every
 * stand of the plan its printed-QR checkpoint, so stand missions work from the start.
 */
export async function seedLayout(
  deps: QuadrantAdminDeps,
  actor: QuadrantAdminActor,
): Promise<Result<{ quadrants: number; standQrs: string[] }, QuadrantAdminError>> {
  if (forbidden(actor)) return err(quadrantAdminError("forbidden"));

  const [listed, venue] = await Promise.all([deps.store.listQuadrants(), deps.store.loadVenue()]);
  if (!listed.ok || !venue.ok) return err(quadrantAdminError("unknown"));
  if (listed.value.length > 0) return err(quadrantAdminError("already-seeded"));

  let created = 0;
  for (const quadrant of deps.defaults.quadrants) {
    const saved = await deps.store.createQuadrant(quadrant);
    // Another admin seeding at the same time: their quadrants stand, ours are not doubled.
    if (!saved.ok && saved.error.code !== "already-exists") return err(quadrantAdminError("unknown"));
    if (saved.ok) created += 1;
  }

  const plan = venue.value ?? deps.defaults.venue;
  if (venue.value === null) {
    const saved = await deps.store.saveVenue(plan);
    if (!saved.ok) return err(quadrantAdminError("unknown"));
  }
  const qrs = await deps.stands.ensure(actor, standsOf(plan));

  await audit(deps, { action: "layout.seeded", actorUid: actor.uid, targetUid: "layout", details: { quadrants: String(created), standQrs: qrs.created.join(",") } });
  return ok({ quadrants: created, standQrs: qrs.created });
}

function checkFields(input: { name: string; tagline: string; planet: string }): Result<Pick<Quadrant, "name" | "tagline" | "planet">, QuadrantAdminError> {
  const name = normalizeQuadrantName(input.name);
  if (name === null) return err(quadrantAdminError("invalid-name"));
  const tagline = normalizeQuadrantTagline(input.tagline);
  if (tagline === null) return err(quadrantAdminError("invalid-tagline"));
  if (!isQuadrantPlanet(input.planet)) return err(quadrantAdminError("invalid-planet"));
  return ok({ name, tagline, planet: input.planet });
}

export async function createQuadrant(
  deps: QuadrantAdminDeps,
  actor: QuadrantAdminActor,
  input: { id: string; name: string; tagline: string; planet: string },
): Promise<Result<Quadrant, QuadrantAdminError>> {
  if (forbidden(actor)) return err(quadrantAdminError("forbidden"));
  const fields = checkFields(input);
  if (!fields.ok) return fields;
  if (!isQuadrantId(input.id)) return err(quadrantAdminError("invalid-id"));

  const listed = await deps.store.listQuadrants();
  if (!listed.ok) return err(quadrantAdminError("unknown"));
  const order = Math.max(-1, ...listed.value.map((quadrant) => quadrant.order).filter((value) => value < Number.MAX_SAFE_INTEGER)) + 1;

  const quadrant: Quadrant = { id: input.id, ...fields.value, order, active: true };
  const saved = await deps.store.createQuadrant(quadrant);
  if (!saved.ok) return err(quadrantAdminError(saved.error.code === "already-exists" ? "already-exists" : "unknown"));

  await audit(deps, { action: "quadrant.created", actorUid: actor.uid, targetUid: quadrant.id, details: { name: quadrant.name } });
  return ok(quadrant);
}

/** Changes the name, tagline and planet. The id never changes: missions and stands point to it. */
export async function updateQuadrant(
  deps: QuadrantAdminDeps,
  actor: QuadrantAdminActor,
  input: { id: string; name: string; tagline: string; planet: string },
): Promise<Result<Quadrant, QuadrantAdminError>> {
  if (forbidden(actor)) return err(quadrantAdminError("forbidden"));
  if (!isQuadrantId(input.id)) return err(quadrantAdminError("not-found"));
  const fields = checkFields(input);
  if (!fields.ok) return fields;

  const updated = await deps.store.updateQuadrant(input.id, fields.value);
  if (!updated.ok) return err(quadrantAdminError("unknown"));
  if (updated.value === null) return err(quadrantAdminError("not-found"));

  const { before, after } = updated.value;
  const changed = (["name", "tagline", "planet"] as const).filter((field) => before[field] !== after[field]);
  if (changed.length > 0) {
    await audit(deps, { action: "quadrant.updated", actorUid: actor.uid, targetUid: input.id, details: { changed: changed.join(",") } });
  }
  return ok(after);
}

/**
 * Shows or hides a quadrant on the map and the missions board. Its missions and stands keep pointing to it:
 * while it is hidden, its stands show as plain stands and its missions under "Otras misiones".
 */
export async function setQuadrantActive(
  deps: QuadrantAdminDeps,
  actor: QuadrantAdminActor,
  input: { id: string; active: boolean },
): Promise<Result<Quadrant, QuadrantAdminError>> {
  if (forbidden(actor)) return err(quadrantAdminError("forbidden"));
  if (!isQuadrantId(input.id)) return err(quadrantAdminError("not-found"));

  const updated = await deps.store.updateQuadrant(input.id, { active: input.active });
  if (!updated.ok) return err(quadrantAdminError("unknown"));
  if (updated.value === null) return err(quadrantAdminError("not-found"));

  if (updated.value.before.active !== input.active) {
    await audit(deps, {
      action: input.active ? "quadrant.activated" : "quadrant.deactivated",
      actorUid: actor.uid,
      targetUid: input.id,
      details: { name: updated.value.after.name },
    });
  }
  return ok(updated.value.after);
}

export async function moveQuadrant(
  deps: QuadrantAdminDeps,
  actor: QuadrantAdminActor,
  input: { id: string; to: number },
): Promise<Result<readonly string[], QuadrantAdminError>> {
  if (forbidden(actor)) return err(quadrantAdminError("forbidden"));

  const listed = await deps.store.listQuadrants();
  if (!listed.ok) return err(quadrantAdminError("unknown"));

  const ids = [...listed.value].sort(byOrder).map((quadrant) => quadrant.id);
  const from = ids.indexOf(input.id);
  if (from < 0) return err(quadrantAdminError("not-found"));
  const to = Math.min(Math.max(input.to, 0), ids.length - 1);
  if (to === from) return ok(ids);

  ids.splice(to, 0, ...ids.splice(from, 1));
  const saved = await deps.store.setQuadrantOrder(ids);
  if (!saved.ok) return err(quadrantAdminError("unknown"));

  await audit(deps, { action: "quadrant.reordered", actorUid: actor.uid, targetUid: input.id, details: { order: ids.join(",") } });
  return ok(ids);
}

export interface VenueForEdit {
  venue: VenueMap;
  /** True while the edition has no plan of its own: the bundled one is shown as a starting point. */
  isDefault: boolean;
  /** Every quadrant a stand can belong to (the edition's own, or the bundled ones), active or not. */
  quadrants: readonly Quadrant[];
}

/** The plan to edit: the edition's own, or the bundled one as a starting point. */
export async function getVenueForEdit(deps: QuadrantAdminDeps, actor: QuadrantAdminActor): Promise<Result<VenueForEdit, QuadrantAdminError>> {
  if (forbidden(actor)) return err(quadrantAdminError("forbidden"));
  const [listed, venue] = await Promise.all([deps.store.listQuadrants(), deps.store.loadVenue()]);
  if (!listed.ok || !venue.ok) return err(quadrantAdminError("unknown"));
  return ok({
    venue: venue.value ?? deps.defaults.venue,
    isDefault: venue.value === null,
    quadrants: [...(listed.value.length > 0 ? listed.value : deps.defaults.quadrants)].sort(byOrder),
  });
}

/**
 * Saves the edition's plan: it must be drawable (`parseVenueMap`) and every stand must belong to one of the
 * edition's quadrants. Then every stand gets its printed-QR checkpoint (`stand-{areaId}`), created if missing.
 * A stand removed from the plan keeps its checkpoint and history.
 */
export async function saveVenue(
  deps: QuadrantAdminDeps,
  actor: QuadrantAdminActor,
  input: unknown,
): Promise<Result<{ venue: VenueMap; standQrs: string[]; failedQrs: string[] }, QuadrantAdminError>> {
  if (forbidden(actor)) return err(quadrantAdminError("forbidden"));
  const parsed = parseVenueMap(input);
  if (!parsed) return err(quadrantAdminError("invalid-venue"));
  // The plan is saved whole: the editor sends the background it keeps (its path), or null for none.
  const sentPath = (input as { backgroundPath?: unknown }).backgroundPath;
  let background: ImageRef | null = null;
  if (sentPath !== undefined && sentPath !== null) {
    background = typeof sentPath === "string" ? deps.images.ref(sentPath, "venue-plan") : null;
    if (!background) return err(quadrantAdminError("invalid-image"));
  }
  const venue: VenueMap = { ...parsed, background };

  const listed = await deps.store.listQuadrants();
  if (!listed.ok) return err(quadrantAdminError("unknown"));
  const known = new Set((listed.value.length > 0 ? listed.value : deps.defaults.quadrants).map((quadrant) => quadrant.id));
  if (venue.areas.some((area) => area.quadrantId !== null && !known.has(area.quadrantId))) return err(quadrantAdminError("unknown-quadrant"));

  const before = await deps.store.loadVenue();
  const saved = await deps.store.saveVenue(venue);
  if (!saved.ok) return err(quadrantAdminError("unknown"));
  const replaced = before.ok ? (before.value?.background ?? null) : null;
  if (replaced && replaced.path !== background?.path) await deps.images.remove(replaced.path);

  const qrs = await deps.stands.ensure(actor, standsOf(venue));
  await audit(deps, {
    action: "venue.saved",
    actorUid: actor.uid,
    targetUid: "venue",
    details: { areas: String(venue.areas.length), standQrs: qrs.created.join(",") || null, background: background ? "yes" : "no" },
  });
  return ok({ venue, standQrs: qrs.created, failedQrs: qrs.failed });
}
