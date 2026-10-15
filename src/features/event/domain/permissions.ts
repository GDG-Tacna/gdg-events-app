import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { EditionsActor, EditionsAuditEntry } from "./editions";

/**
 * What an edition lets its organizers and staff do. Organizers get a level per control center section (hidden, view
 * only, or edit); staff get the kinds of station they operate. An edition with nothing saved works as before: an
 * organizer edits every section (and in Equipo only manages staff) and staff operate every station. Admins of every
 * edition are never limited by this.
 */
export const ADMIN_SECTIONS = [
  "checkpoints",
  "talks",
  "missions",
  "map",
  "ranks",
  "odyssey",
  "achievements",
  "minigames",
  "economy",
  "squads",
  "squadCredits",
  "stage",
  "raffle",
  "team",
  "event",
] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];
export const isAdminSection = (value: unknown): value is AdminSection => typeof value === "string" && (ADMIN_SECTIONS as readonly string[]).includes(value);

export const ACCESS_LEVELS = ["none", "view", "edit"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
const isAccessLevel = (value: unknown): value is AccessLevel => typeof value === "string" && (ACCESS_LEVELS as readonly string[]).includes(value);

/** The kinds of station staff can operate (the same closed set as the checkpoints feature). */
export const STAFF_STATIONS = ["entrance", "catering", "stand"] as const;
export type StaffStation = (typeof STAFF_STATIONS)[number];
const isStaffStation = (value: unknown): value is StaffStation => typeof value === "string" && (STAFF_STATIONS as readonly string[]).includes(value);

export interface EditionPermissions {
  organizer: Readonly<Record<AdminSection, AccessLevel>>;
  staffStations: readonly StaffStation[];
}

/** Everything as before permissions existed. */
export const DEFAULT_PERMISSIONS: EditionPermissions = {
  organizer: Object.fromEntries(ADMIN_SECTIONS.map((section) => [section, "edit"])) as Record<AdminSection, AccessLevel>,
  staffStations: STAFF_STATIONS,
};

/** Stored permissions over the defaults: unknown sections or levels are ignored, a missing one keeps its default. */
export function parsePermissions(data: unknown): EditionPermissions {
  const stored = (data ?? {}) as { organizer?: unknown; staffStations?: unknown };
  const organizer = { ...DEFAULT_PERMISSIONS.organizer };
  if (stored.organizer && typeof stored.organizer === "object") {
    for (const [section, level] of Object.entries(stored.organizer)) if (isAdminSection(section) && isAccessLevel(level)) organizer[section] = level;
  }
  const staffStations = Array.isArray(stored.staffStations) ? STAFF_STATIONS.filter((kind) => (stored.staffStations as unknown[]).includes(kind)) : DEFAULT_PERMISSIONS.staffStations;
  return { organizer, staffStations };
}

/**
 * How far a session may go in a section of the request's edition: an admin of every edition edits everything, an
 * organizer what the edition allows, anyone else nothing.
 */
export function sectionAccess(permissions: EditionPermissions, actor: Pick<EditionsActor, "role" | "adminScope">, section: AdminSection): AccessLevel {
  if (actor.role !== "admin") return "none";
  if (actor.adminScope === "global") return "edit";
  return permissions.organizer[section];
}

export interface PermissionStore {
  read(): Promise<Result<EditionPermissions, { code: string }>>;
  save(permissions: EditionPermissions): Promise<Result<void, { code: string }>>;
}

export interface PermissionDeps {
  store: PermissionStore;
  audit: { append(entry: Omit<EditionsAuditEntry, "action"> & { action: "event.permissions" }): Promise<Result<void, { code: string }>> };
  now: () => Date;
}

export type PermissionsErrorCode = "invalid-permissions" | "forbidden" | "unauthenticated" | "disabled" | "unknown";

/** Saves what organizers and staff may do in an edition. Only an admin of every edition decides it. */
export async function setEditionPermissions(
  deps: PermissionDeps,
  actor: EditionsActor,
  input: { eventId: string; organizer: Readonly<Record<string, unknown>>; staffStations: readonly unknown[] },
): Promise<Result<EditionPermissions, { code: PermissionsErrorCode }>> {
  if (actor.role !== "admin" || actor.adminScope !== "global") return err({ code: "forbidden" });
  const entries = Object.entries(input.organizer);
  if (!entries.every(([section, level]) => isAdminSection(section) && isAccessLevel(level))) return err({ code: "invalid-permissions" });
  if (!input.staffStations.every(isStaffStation)) return err({ code: "invalid-permissions" });

  const permissions: EditionPermissions = {
    organizer: { ...DEFAULT_PERMISSIONS.organizer, ...(Object.fromEntries(entries) as Record<AdminSection, AccessLevel>) },
    staffStations: STAFF_STATIONS.filter((kind) => input.staffStations.includes(kind)),
  };
  const saved = await deps.store.save(permissions);
  if (!saved.ok) return err({ code: "unknown" });

  const limited = ADMIN_SECTIONS.filter((section) => permissions.organizer[section] !== "edit").map((section) => `${section}:${permissions.organizer[section]}`);
  const written = await deps.audit.append({
    action: "event.permissions",
    actorUid: actor.uid,
    targetUid: input.eventId,
    details: { organizer: limited.join(",") || null, staffStations: permissions.staffStations.join(",") || null },
    at: deps.now(),
  });
  if (!written.ok) logServerError("event.audit.append", new Error(`audit entry missing for the permissions of ${input.eventId}`));
  return ok(permissions);
}

/** What the request's edition allows (the defaults when nothing was saved). */
export async function getEditionPermissions(deps: Pick<PermissionDeps, "store">): Promise<Result<EditionPermissions, { code: "unknown" }>> {
  const read = await deps.store.read();
  return read.ok ? ok(read.value) : err({ code: "unknown" });
}
