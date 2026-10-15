import "server-only";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { ADMIN_SECTIONS, DEFAULT_PERMISSIONS, sectionAccess, type AccessLevel, type AdminSection, type EditionPermissions, type StaffStation } from "@/features/event/server";
import { logServerError } from "@/shared/lib/log";
import { editionPermissions } from "./composition/event.server";
import type { AppSession } from "./session-role";

/** The request's edition permissions, read once per request; `null` when they cannot be read. */
const permissions = cache(async (): Promise<EditionPermissions | null> => {
  await connection();
  const read = await editionPermissions();
  if (read.ok) return read.value;
  logServerError("permissions.read", new Error("the edition's permissions could not be read"));
  return null;
});

/**
 * How far a session may go in a control center section of the request's edition (Eventos › Permisos). An admin of
 * every edition edits everything without reading anything. When the permissions cannot be read an organizer gets
 * nothing: a failure never grants more than the edition allows.
 */
export async function accessTo(session: Pick<AppSession, "role" | "adminScope">, section: AdminSection): Promise<AccessLevel> {
  if (session.role !== "admin") return "none";
  if (session.adminScope === "global") return "edit";
  const allowed = await permissions();
  return allowed ? sectionAccess(allowed, session, section) : "none";
}

/** Whether a session may change things in a section (or in any of several, for shared tools like image uploads). */
export async function mayEdit(session: Pick<AppSession, "role" | "adminScope">, section: AdminSection | readonly AdminSection[]): Promise<boolean> {
  const sections = typeof section === "string" ? [section] : section;
  for (const one of sections) if ((await accessTo(session, one)) === "edit") return true;
  return false;
}

/** For control center pages: a section the session may not even see behaves as not found. */
export async function requireSection(session: Pick<AppSession, "role" | "adminScope">, section: AdminSection | readonly AdminSection[]): Promise<void> {
  const sections = typeof section === "string" ? [section] : section;
  for (const one of sections) if ((await accessTo(session, one)) !== "none") return;
  notFound();
}

/** Every section with the session's level, for the navigation and the read-only frame. */
export async function sectionLevels(session: Pick<AppSession, "role" | "adminScope">): Promise<Record<AdminSection, AccessLevel>> {
  const levels = await Promise.all(ADMIN_SECTIONS.map((section) => accessTo(session, section)));
  return Object.fromEntries(ADMIN_SECTIONS.map((section, index) => [section, levels[index]])) as Record<AdminSection, AccessLevel>;
}

/**
 * The kinds of station staff may operate in the request's edition. A failed read lets them operate every kind (the
 * event day's scanning never stops for a settings read), and is logged.
 */
export async function staffStations(): Promise<readonly StaffStation[]> {
  const allowed = await permissions();
  return allowed ? allowed.staffStations : DEFAULT_PERMISSIONS.staffStations;
}
