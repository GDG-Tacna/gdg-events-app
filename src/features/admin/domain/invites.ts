import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { claimAfterChange } from "./claim";
import type { AuditLog, RoleDirectory, TeamRepository } from "./ports";
import { normalizeEmail, type ManagedRole } from "./team";
import type { Actor } from "./use-cases";

/** How long a link works. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Pending invitations an edition keeps at once (a guard against a flood of links). */
export const INVITES_MAX = 200;

/**
 * An invitation to a role, sent as a link. Only a hash of the link's secret is stored (its id), so the list never
 * shows a working link; a link works once, for the invited email, until it expires or is revoked.
 */
export interface Invite {
  id: string;
  email: string;
  role: ManagedRole;
  invitedBy: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  acceptedBy: string | null;
  revokedAt: Date | null;
}

export type InviteState = "pending" | "accepted" | "expired" | "revoked";

export const inviteState = (invite: Invite, now: Date): InviteState =>
  invite.revokedAt ? "revoked" : invite.acceptedAt ? "accepted" : invite.expiresAt.getTime() <= now.getTime() ? "expired" : "pending";

export type InviteErrorCode =
  | "invalid-email"
  | "invalid-role"
  | "too-many"
  | "not-found"
  | "expired"
  | "used"
  | "revoked"
  | "wrong-account"
  | "unverified-email"
  | "already-admin"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface InviteStore {
  /** The edition's invitations, newest first. */
  list(): Promise<Result<readonly Invite[], { code: string }>>;
  create(invite: Invite): Promise<Result<void, { code: string }>>;
  get(id: string): Promise<Result<Invite | null, { code: string }>>;
  /** Marks it accepted only if it is still pending (one transaction): false when someone else used it first. */
  accept(id: string, uid: string, at: Date): Promise<Result<boolean, { code: string }>>;
  /** Puts an acceptance back when granting the role then failed. */
  undoAccept(id: string): Promise<Result<void, { code: string }>>;
  revoke(id: string, at: Date): Promise<Result<Invite | null, { code: string }>>;
}

/** Sends the link by email when a sender is configured (Resend); absent, the admin shares the link by hand. */
export interface InviteMailer {
  send(input: { to: string; role: ManagedRole; link: string; expiresAt: Date }): Promise<Result<void, { code: string }>>;
}

export interface InviteDeps {
  invites: InviteStore;
  team: TeamRepository;
  directory: RoleDirectory;
  audit: AuditLog;
  /** A new secret for a link (random, URL-safe) and the hash stored for it. */
  newSecret: () => string;
  hash: (secret: string) => string;
  /** The app's public address, for the links in emails. */
  appUrl: string | null;
  /** The edition the invitation belongs to (the admin's working edition); its link names it. */
  editionId: () => Promise<string>;
  mailer: InviteMailer | null;
  now: () => Date;
}

const fail = (code: InviteErrorCode) => err({ code });
const isOrganizer = (actor: Actor) => actor.adminScope === "edition";
/** What a person may invite to: a global admin to any role, an organizer only to staff. */
const mayInvite = (actor: Actor, role: ManagedRole) => actor.role === "admin" && (!isOrganizer(actor) || role === "staff");
const SECRET = /^[A-Za-z0-9_-]{32,128}$/;

/** The path a link opens (the screen adds its own origin when copying it): `/invite/{eventId}.{secret}`. */
export const invitePath = (secret: string, eventId: string) => `/invite/${eventId}.${secret}`;

const EVENT_ID = /^[a-z0-9][a-z0-9-]{1,47}$/;

/**
 * The edition and secret a link carries. Links made before editions were named in them (no dot) belong to the
 * public edition (`eventId` null). Anything else is not a link (`null`).
 */
export function splitInviteToken(token: string): { eventId: string | null; secret: string } | null {
  const dot = token.indexOf(".");
  if (dot < 0) return SECRET.test(token) ? { eventId: null, secret: token } : null;
  const eventId = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  return EVENT_ID.test(eventId) && SECRET.test(secret) ? { eventId, secret } : null;
}

export async function listInvites(deps: Pick<InviteDeps, "invites">, actor: Actor): Promise<Result<readonly Invite[], { code: InviteErrorCode }>> {
  if (actor.role !== "admin") return fail("forbidden");
  const listed = await deps.invites.list();
  if (!listed.ok) return fail("unknown");
  // An organizer only sees the invitations it could have made.
  return ok(isOrganizer(actor) ? listed.value.filter((invite) => invite.role === "staff") : listed.value);
}

/**
 * Creates an invitation and answers its link (shown once: only its hash is kept). With a mailer the link is also
 * emailed; a failed email keeps the invitation, and the screen still shows the link to share.
 */
export async function createInvite(
  deps: InviteDeps,
  actor: Actor,
  input: { email: string; role: string },
): Promise<Result<{ invite: Invite; path: string; emailed: boolean }, { code: InviteErrorCode }>> {
  const email = normalizeEmail(input.email);
  if (email === null) return fail("invalid-email");
  if (input.role !== "staff" && input.role !== "organizer" && input.role !== "admin") return fail("invalid-role");
  const role = input.role;
  if (!mayInvite(actor, role)) return fail("forbidden");

  const listed = await deps.invites.list();
  if (!listed.ok) return fail("unknown");
  const now = deps.now();
  if (listed.value.filter((invite) => inviteState(invite, now) === "pending").length >= INVITES_MAX) return fail("too-many");

  const secret = deps.newSecret();
  const eventId = await deps.editionId();
  const invite: Invite = {
    id: deps.hash(secret),
    email,
    role,
    invitedBy: actor.uid,
    createdAt: now,
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    acceptedAt: null,
    acceptedBy: null,
    revokedAt: null,
  };
  const created = await deps.invites.create(invite);
  if (!created.ok) return fail("unknown");

  let emailed = false;
  if (deps.mailer && deps.appUrl) {
    const sent = await deps.mailer.send({ to: email, role, link: `${deps.appUrl}${invitePath(secret, eventId)}`, expiresAt: invite.expiresAt });
    emailed = sent.ok;
    if (!sent.ok) logServerError("admin.invite.email", new Error(`invitation email to a ${role} was not sent`));
  }

  const written = await deps.audit.append({ action: "invite.created", actorUid: actor.uid, targetUid: email, details: { role, emailed: String(emailed) }, at: now });
  if (!written.ok) logServerError("admin.audit.append", new Error("audit entry missing for an invitation"));
  return ok({ invite, path: invitePath(secret, eventId), emailed });
}

export async function revokeInvite(deps: Pick<InviteDeps, "invites" | "audit" | "now">, actor: Actor, input: { id: string }): Promise<Result<Invite, { code: InviteErrorCode }>> {
  if (actor.role !== "admin") return fail("forbidden");
  const found = await deps.invites.get(input.id);
  if (!found.ok) return fail("unknown");
  if (!found.value) return fail("not-found");
  if (!mayInvite(actor, found.value.role)) return fail("forbidden");
  const state = inviteState(found.value, deps.now());
  if (state !== "pending") return fail(state === "accepted" ? "used" : state);

  const revoked = await deps.invites.revoke(input.id, deps.now());
  if (!revoked.ok) return fail("unknown");
  if (!revoked.value) return fail("not-found");
  const written = await deps.audit.append({ action: "invite.revoked", actorUid: actor.uid, targetUid: found.value.email, details: { role: found.value.role }, at: deps.now() });
  if (!written.ok) logServerError("admin.audit.append", new Error("audit entry missing for a revoked invitation"));
  return ok(revoked.value);
}

/** What the invitation screen shows before accepting: the role, and the invited email half hidden. */
export async function previewInvite(deps: Pick<InviteDeps, "invites" | "hash" | "now">, secret: string): Promise<Result<{ role: ManagedRole; email: string; state: InviteState }, { code: InviteErrorCode }>> {
  if (!SECRET.test(secret)) return fail("not-found");
  const found = await deps.invites.get(deps.hash(secret));
  if (!found.ok) return fail("unknown");
  if (!found.value) return fail("not-found");
  return ok({ role: found.value.role, email: maskEmail(found.value.email), state: inviteState(found.value, deps.now()) });
}

/** "ana.torres@gmail.com" becomes "an•••@gmail.com": enough to recognise, not enough to collect addresses. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}${"•".repeat(3)}@${domain}`;
}

/**
 * Accepts an invitation with the signed-in account: it must be the invited email, verified by the provider. The link
 * is marked used first (one transaction, so it works once), then the role is filed in the edition's team and set on
 * the account without signing it out (the screen renews the session right after). If that fails, the link works again.
 */
export async function acceptInvite(
  deps: InviteDeps,
  session: { uid: string; verifiedEmail: string | null; displayName: string | null; role: string | null },
  secret: string,
): Promise<Result<{ role: ManagedRole }, { code: InviteErrorCode }>> {
  if (!SECRET.test(secret)) return fail("not-found");
  const id = deps.hash(secret);
  const found = await deps.invites.get(id);
  if (!found.ok) return fail("unknown");
  const invite = found.value;
  if (!invite) return fail("not-found");
  const state = inviteState(invite, deps.now());
  if (state !== "pending") return fail(state === "accepted" ? "used" : state);
  if (!session.verifiedEmail) return fail("unverified-email");
  if (session.verifiedEmail !== invite.email) return fail("wrong-account");
  // An admin is never turned into staff or organizer by a link.
  if (session.role === "admin" && invite.role !== "admin") return fail("already-admin");

  const claimed = await deps.invites.accept(id, session.uid, deps.now());
  if (!claimed.ok) return fail("unknown");
  if (!claimed.value) return fail("used");

  const account = { uid: session.uid, email: invite.email, displayName: session.displayName };
  const filed = await deps.team.change(account, invite.role);
  // Their strongest role in any edition: a staff link here never demotes an organizer of another edition.
  const claim = filed.ok ? await claimAfterChange(deps.team, session.uid, invite.role) : filed;
  const set = claim.ok ? await deps.directory.setRole(session.uid, claim.value, { keepSession: true }) : claim;
  if (!filed.ok || !set.ok) {
    if (filed.ok) await deps.team.change(account, filed.value.previous);
    const undone = await deps.invites.undoAccept(id);
    if (!undone.ok) logServerError("admin.invite.undo", new Error("an invitation stayed used after a failed acceptance"));
    return fail("unknown");
  }

  const written = await deps.audit.append({ action: "invite.accepted", actorUid: session.uid, targetUid: session.uid, details: { role: invite.role, invitedBy: invite.invitedBy }, at: deps.now() });
  if (!written.ok) logServerError("admin.audit.append", new Error("audit entry missing for an accepted invitation"));
  return ok({ role: invite.role });
}
