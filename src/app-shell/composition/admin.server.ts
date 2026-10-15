import "server-only";
import { createHash, randomBytes } from "node:crypto";
import {
  FirebaseRoleDirectory,
  FirestoreAuditLog,
  FirestoreInviteStore,
  FirestoreTeamRepository,
  ResendInviteMailer,
  type InviteDeps,
  type TeamDeps,
} from "@/features/admin/server";
import { currentEditionOf } from "@/features/event/server";
import { getServerEnv } from "@/shared/config/env.server";
import { copy } from "@/shared/copy/es";

const team = new FirestoreTeamRepository();
const directory = new FirebaseRoleDirectory();
const audit = new FirestoreAuditLog();

/** Composition root for the admin area: the only place that binds the Firebase adapters of the team. */
export const teamDeps: TeamDeps = {
  directory,
  team,
  audit,
  now: () => new Date(),
};

/**
 * Invitations: a 256-bit random secret per link, stored only as its SHA-256. Emails go out through Resend only when
 * its key, a sender and the app's address are configured; otherwise the screen shows the link to share by hand.
 */
export function inviteDeps(): InviteDeps {
  const env = getServerEnv();
  const mailer = env.resendApiKey && env.inviteFrom ? new ResendInviteMailer(env.resendApiKey, env.inviteFrom, copy.brand.name) : null;
  return {
    invites: new FirestoreInviteStore(),
    team,
    directory,
    audit,
    newSecret: () => randomBytes(32).toString("base64url"),
    hash: (secret) => createHash("sha256").update(secret).digest("hex"),
    appUrl: env.appUrl ?? null,
    editionId: currentEditionOf,
    mailer: env.appUrl ? mailer : null,
    now: () => new Date(),
  };
}

/** How long a staff or organizer's place in an edition's team is trusted in memory (every request checks it). */
const EDITION_ROLE_TTL_MS = 30_000;
const editionRoles = new Map<string, { role: "staff" | "organizer" | null; expiresAt: number }>();
const roleKey = (eventId: string, uid: string) => `${eventId}/${uid}`;

/**
 * A staff or organizer's role in one edition, kept for a short time per server (a removal also signs the person
 * out, so the wait never leaves access open). A failed read is thrown: the guard never guesses a role.
 */
export async function editionRoleOf(uid: string, eventId: string, now: () => number = Date.now): Promise<"staff" | "organizer" | null> {
  const kept = editionRoles.get(roleKey(eventId, uid));
  if (kept && kept.expiresAt > now()) return kept.role;
  const read = await team.editionRoleOf(uid, eventId);
  if (!read.ok) throw new Error(`could not read the edition team for ${uid}`);
  editionRoles.set(roleKey(eventId, uid), { role: read.value, expiresAt: now() + EDITION_ROLE_TTL_MS });
  return read.value;
}

/** Every edition where a person is staff or organizer (only asked for someone outside the public edition). Not kept. */
export async function editionRolesOf(uid: string): Promise<ReadonlyArray<{ eventId: string; role: "staff" | "organizer" }>> {
  const read = await team.editionRolesOf(uid);
  if (!read.ok) throw new Error(`could not read the edition teams for ${uid}`);
  return read.value;
}

/** Drops what is kept about a person in every edition, after their role changes on this server. */
export function forgetEditionRole(uid: string): void {
  for (const key of editionRoles.keys()) if (key.endsWith(`/${uid}`)) editionRoles.delete(key);
}
