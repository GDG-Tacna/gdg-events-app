import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { SpeakerAuditEntry } from "./manage";

/** How long an invitation link works before it is accepted. */
export const SPEAKER_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * The invitation sent to a speaker. Only a hash of the link's secret is kept, so the admin screen never holds a working
 * link. Once accepted it stays (marked), so the same link keeps taking the speaker to their code.
 */
export interface SpeakerInvite {
  hash: string;
  email: string;
  invitedBy: string;
  expiresAt: Date;
  acceptedAt: Date | null;
}

/** A speaker as access sees them: who they are, the account linked to them, and their invitation. */
export interface SpeakerAccessRow {
  speakerId: string;
  name: string;
  active: boolean;
  accountUid: string | null;
  invite: SpeakerInvite | null;
}

export interface SpeakerAccessStore {
  /** Every speaker of the edition with their access (an edition has a few dozen at most). */
  rows(): Promise<Result<readonly SpeakerAccessRow[], { code: string }>>;
  /** Replaces the invitation and drops any linked account (a new link is a new person). False when there is no such speaker. */
  invite(speakerId: string, invite: SpeakerInvite): Promise<Result<boolean, { code: string }>>;
  /**
   * Links the account if the speaker's invitation is still this one, unexpired and not accepted by someone else (one
   * transaction). Accepting again with the same account is fine.
   */
  claim(speakerId: string, hash: string, uid: string, at: Date): Promise<Result<"linked" | "gone", { code: string }>>;
  /** Drops the linked account and the invitation. False when there is no such speaker. */
  unlink(speakerId: string): Promise<Result<boolean, { code: string }>>;
}

export interface SpeakerAccessDeps {
  access: SpeakerAccessStore;
  audit: { append(entry: SpeakerAuditEntry): Promise<Result<void, { code: string }>> };
  /** A new secret for a link (random, URL-safe) and the hash stored for it. */
  newSecret: () => string;
  hash: (secret: string) => string;
  /** The edition the speakers belong to; the link names it. */
  editionId: () => Promise<string>;
  now: () => Date;
}

export type SpeakerAccessErrorCode =
  | "invalid-email"
  | "not-found"
  | "inactive"
  | "expired"
  | "used"
  | "wrong-account"
  | "unverified-email"
  | "already-linked"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

const fail = (code: SpeakerAccessErrorCode) => err({ code });
const SECRET = /^[A-Za-z0-9_-]{32,128}$/;
const EVENT_ID = /^[a-z0-9][a-z0-9-]{1,47}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The path a speaker's link opens: `/invite/speaker/{eventId}.{secret}`. */
export const speakerInvitePath = (eventId: string, secret: string) => `/invite/speaker/${eventId}.${secret}`;

/** The edition and secret a link carries, or `null` for anything that is not one. */
export function splitSpeakerToken(token: string): { eventId: string; secret: string } | null {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const eventId = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  return EVENT_ID.test(eventId) && SECRET.test(secret) ? { eventId, secret } : null;
}

/** Trimmed and lowercased, or null when it does not look like an email. */
export function normalizeSpeakerEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

/** "ana.torres@gmail.com" becomes "an•••@gmail.com": enough to recognise, not enough to collect addresses. */
export function maskSpeakerEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}${"•".repeat(3)}@${domain}`;
}

/** Where a speaker stands, for the admin's card. */
export type SpeakerAccessState =
  | { state: "none" }
  | { state: "invited"; email: string; expiresAt: Date; expired: boolean }
  | { state: "linked"; email: string | null };

async function audit(deps: Pick<SpeakerAccessDeps, "audit" | "now">, entry: Omit<SpeakerAuditEntry, "at">): Promise<void> {
  const written = await deps.audit.append({ ...entry, at: deps.now() });
  if (!written.ok) logServerError("speakers.audit.append", new Error(`audit entry missing for ${entry.targetUid}`));
}

/** Each speaker's access, for the admin's Speakers screen (emails half hidden). */
export async function listSpeakerAccess(
  deps: Pick<SpeakerAccessDeps, "access" | "now">,
  actor: { role: string | null },
): Promise<Result<Readonly<Record<string, SpeakerAccessState>>, { code: SpeakerAccessErrorCode }>> {
  if (actor.role !== "admin") return fail("forbidden");
  const rows = await deps.access.rows();
  if (!rows.ok) return fail("unknown");
  const now = deps.now().getTime();
  const states: Record<string, SpeakerAccessState> = {};
  for (const row of rows.value) {
    const email = row.invite ? maskSpeakerEmail(row.invite.email) : null;
    if (row.accountUid) states[row.speakerId] = { state: "linked", email };
    else if (row.invite && email) states[row.speakerId] = { state: "invited", email, expiresAt: row.invite.expiresAt, expired: row.invite.expiresAt.getTime() <= now };
    else states[row.speakerId] = { state: "none" };
  }
  return ok(states);
}

/**
 * Makes an invitation link for an active speaker, for one email, and answers its path (shown once: only its hash is
 * kept). It replaces any earlier link and unlinks any account: a new invitation means a new person holds the code.
 */
export async function inviteSpeaker(
  deps: SpeakerAccessDeps,
  actor: { uid: string; role: string | null },
  input: { speakerId: string; email: string },
): Promise<Result<{ path: string; expiresAt: Date }, { code: SpeakerAccessErrorCode }>> {
  if (actor.role !== "admin") return fail("forbidden");
  const email = normalizeSpeakerEmail(input.email);
  if (email === null) return fail("invalid-email");
  const rows = await deps.access.rows();
  if (!rows.ok) return fail("unknown");
  const speaker = rows.value.find((row) => row.speakerId === input.speakerId);
  if (!speaker) return fail("not-found");
  if (!speaker.active) return fail("inactive");

  const secret = deps.newSecret();
  const now = deps.now();
  const expiresAt = new Date(now.getTime() + SPEAKER_INVITE_TTL_MS);
  const saved = await deps.access.invite(speaker.speakerId, { hash: deps.hash(secret), email, invitedBy: actor.uid, expiresAt, acceptedAt: null });
  if (!saved.ok) return fail("unknown");
  if (!saved.value) return fail("not-found");
  await audit(deps, { action: "speaker.invited", actorUid: actor.uid, targetUid: speaker.speakerId, details: { name: speaker.name } });
  return ok({ path: speakerInvitePath(await deps.editionId(), secret), expiresAt });
}

/** Drops a speaker's linked account and invitation: their old link stops working and only an admin shows their code. */
export async function unlinkSpeaker(
  deps: Pick<SpeakerAccessDeps, "access" | "audit" | "now">,
  actor: { uid: string; role: string | null },
  input: { speakerId: string },
): Promise<Result<void, { code: SpeakerAccessErrorCode }>> {
  if (actor.role !== "admin") return fail("forbidden");
  const done = await deps.access.unlink(input.speakerId);
  if (!done.ok) return fail("unknown");
  if (!done.value) return fail("not-found");
  await audit(deps, { action: "speaker.unlinked", actorUid: actor.uid, targetUid: input.speakerId, details: {} });
  return ok(undefined);
}

function byLink(rows: readonly SpeakerAccessRow[], hash: string): SpeakerAccessRow | undefined {
  return rows.find((row) => row.invite?.hash === hash);
}

export type SpeakerInviteState = "pending" | "accepted" | "expired";

/** What the link's screen shows before accepting: whose code it is and the invited email, half hidden. */
export async function previewSpeakerInvite(
  deps: Pick<SpeakerAccessDeps, "access" | "hash" | "now">,
  secret: string,
): Promise<Result<{ name: string; email: string; state: SpeakerInviteState; accountUid: string | null }, { code: SpeakerAccessErrorCode }>> {
  if (!SECRET.test(secret)) return fail("not-found");
  const rows = await deps.access.rows();
  if (!rows.ok) return fail("unknown");
  const row = byLink(rows.value, deps.hash(secret));
  if (!row?.invite) return fail("not-found");
  const state: SpeakerInviteState = row.invite.acceptedAt ? "accepted" : row.invite.expiresAt.getTime() <= deps.now().getTime() ? "expired" : "pending";
  return ok({ name: row.name, email: maskSpeakerEmail(row.invite.email), state, accountUid: row.accountUid });
}

/**
 * Links the signed-in account to the speaker of the link. It must be the invited email, verified by the provider; an
 * account already linked to another speaker of the edition is refused (one code per person). Accepting again with
 * the linked account is fine, so the link doubles as the way back to the code.
 */
export async function acceptSpeakerInvite(
  deps: SpeakerAccessDeps,
  session: { uid: string; verifiedEmail: string | null },
  secret: string,
): Promise<Result<{ speakerId: string }, { code: SpeakerAccessErrorCode }>> {
  if (!SECRET.test(secret)) return fail("not-found");
  const rows = await deps.access.rows();
  if (!rows.ok) return fail("unknown");
  const hash = deps.hash(secret);
  const row = byLink(rows.value, hash);
  if (!row?.invite) return fail("not-found");
  if (row.invite.acceptedAt) {
    if (row.accountUid === session.uid) return ok({ speakerId: row.speakerId });
    return fail("used");
  }
  if (row.invite.expiresAt.getTime() <= deps.now().getTime()) return fail("expired");
  if (!session.verifiedEmail) return fail("unverified-email");
  if (session.verifiedEmail !== row.invite.email) return fail("wrong-account");
  if (rows.value.some((other) => other.speakerId !== row.speakerId && other.accountUid === session.uid)) return fail("already-linked");

  const claimed = await deps.access.claim(row.speakerId, hash, session.uid, deps.now());
  if (!claimed.ok) return fail("unknown");
  if (claimed.value === "gone") return fail("used");
  await audit(deps, { action: "speaker.linked", actorUid: session.uid, targetUid: row.speakerId, details: { name: row.name } });
  return ok({ speakerId: row.speakerId });
}

/** The speaker of the edition linked to this account, if any (for their own code screen). */
export async function speakerOfAccount(
  deps: Pick<SpeakerAccessDeps, "access">,
  uid: string,
): Promise<Result<{ id: string; name: string; active: boolean } | null, { code: SpeakerAccessErrorCode }>> {
  const rows = await deps.access.rows();
  if (!rows.ok) return fail("unknown");
  const row = rows.value.find((candidate) => candidate.accountUid === uid);
  return ok(row ? { id: row.speakerId, name: row.name, active: row.active } : null);
}
