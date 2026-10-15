import type { AuthSession, Role } from "@/features/auth/server";

/** The roles the app works with once a session is resolved: a valid organizer is an admin of its edition. */
export type AppRole = Exclude<Role, "organizer">;

export type EditionTeamRole = "staff" | "organizer";

export type AppSession = Omit<AuthSession, "role"> & {
  role: AppRole | null;
  /**
   * The edition this person is preparing in the control center when it is not the public one. Set only after the
   * checks below; adapters read it (through the edition resolver) for control center requests.
   */
  workingEdition?: string;
  /** For a staff or organizer with no place in the public edition: the editions where they do have one. */
  otherEditions?: ReadonlyArray<{ eventId: string; role: EditionTeamRole }>;
};

/** What the guard needs to know about editions and teams. Failed reads are thrown (a role is never guessed). */
export interface EditionAccess {
  publicId: () => Promise<string>;
  roleIn: (uid: string, eventId: string) => Promise<EditionTeamRole | null>;
  rolesElsewhere: (uid: string) => Promise<ReadonlyArray<{ eventId: string; role: EditionTeamRole }>>;
}

/**
 * Turns the verified role claim, and the edition the request asks to work in (`requested`, from a signed cookie the
 * browser only sends to the control center), into what the app trusts.
 *
 * - Admins are global and may work in any edition.
 * - Staff and organizers count only while an edition's team lists them. An organizer may work in an edition where it
 *   is organizer; otherwise the public edition decides. A claim never grants more than the team record: an organizer
 *   listed as staff works as staff.
 * - Someone with no place in the public edition has no role there. When they have one in another edition, the session
 *   says so, so the app shows them their editions instead of signing them up as a cadet.
 */
export async function resolveSession(session: AuthSession, access: EditionAccess, requested: string | null = null): Promise<AppSession> {
  const base = { uid: session.uid, displayName: session.displayName, photoUrl: session.photoUrl, verifiedEmail: session.verifiedEmail ?? null };
  if (session.role !== "admin" && session.role !== "staff" && session.role !== "organizer") return { ...base, role: session.role };

  const publicId = await access.publicId();
  const working = requested !== null && requested !== publicId ? requested : null;

  if (session.role === "admin") return { ...base, role: "admin", adminScope: "global", ...(working ? { workingEdition: working } : {}) };

  if (working && session.role === "organizer" && (await access.roleIn(session.uid, working)) === "organizer") {
    return { ...base, role: "admin", adminScope: "edition", workingEdition: working };
  }

  const listed = await access.roleIn(session.uid, publicId);
  if (listed === "organizer" && session.role === "organizer") return { ...base, role: "admin", adminScope: "edition" };
  if (listed !== null) return { ...base, role: "staff" };

  const elsewhere = (await access.rolesElsewhere(session.uid)).filter((entry) => entry.eventId !== publicId);
  return elsewhere.length > 0 ? { ...base, role: null, otherEditions: elsewhere } : { ...base, role: null };
}
