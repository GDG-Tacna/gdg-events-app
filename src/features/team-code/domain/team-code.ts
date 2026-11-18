import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";

/**
 * The code a team member shows to cadets («Conoce a un organizador / voluntario»). Staff show a volunteer's code,
 * organizers and admins an organizer's. Like a speaker's code it is signed, short-lived and stores nothing: it proves
 * meeting the person face to face.
 */

/** Who a team code says its holder is. The missions feature names the same two roles (the names are the contract). */
export const TEAM_CODE_ROLES = ["organizer", "volunteer"] as const;
export type TeamCodeRole = (typeof TEAM_CODE_ROLES)[number];
const isTeamCodeRole = (value: unknown): value is TeamCodeRole => typeof value === "string" && (TEAM_CODE_ROLES as readonly string[]).includes(value);

/** How long a team member's code can be scanned. Short on purpose, like a speaker's. */
export const TEAM_CODE_LIFETIME_SECONDS = 120;

/** A code may not claim to expire further ahead than a fresh one would, plus a little clock slack. */
export const TEAM_CODE_MAX_FUTURE_SECONDS = TEAM_CODE_LIFETIME_SECONDS + 30;

const PREFIX = "devfest:tm:";
const UID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const EXPIRY_PATTERN = /^[0-9]{1,12}$/;

/**
 * What is signed. The `team:` prefix keeps a team signature from ever being valid for another kind of code (talk codes
 * sign `<checkpoint>.<expiry>`, passes `pass:`, speakers `speaker:`, contacts `contact:`), though they share one secret.
 * The role is signed too, so a volunteer's code can never be altered into an organizer's.
 */
export const teamSigningInput = (uid: string, role: TeamCodeRole, expiresAt: number): string => `team:${uid}.${role}.${expiresAt}`;

export const formatTeamPayload = (uid: string, role: TeamCodeRole, expiresAt: number, signature: string): string =>
  `${PREFIX}${uid}.${role}.${expiresAt}.${signature}`;

/** Whether a scanned text is a team member's code at all (signed or not), so the scanner can route it. */
export const isTeamCode = (payload: string): boolean => payload.startsWith(PREFIX);

/** `null` for anything that is not shaped like a team code. Shape only: the signature is checked elsewhere. */
export function parseTeamPayload(payload: string): { uid: string; role: TeamCodeRole; expiresAt: number; signature: string } | null {
  if (!isTeamCode(payload)) return null;
  const parts = payload.slice(PREFIX.length).split(".");
  if (parts.length !== 4) return null;
  const [uid, role, expiry, signature] = parts;
  if (!UID_PATTERN.test(uid) || !isTeamCodeRole(role) || !EXPIRY_PATTERN.test(expiry) || !SIGNATURE_PATTERN.test(signature)) return null;
  return { uid, role, expiresAt: Number(expiry), signature };
}

/** Signs and checks short messages with a server secret (the one the other QR codes use). */
export interface TeamCodeSigner {
  sign(input: string): string;
  /** Constant-time comparison: a wrong guess reveals nothing about the right one. */
  verify(input: string, signature: string): boolean;
}

/** Draws a QR code. Rows of "1" (dark) and "0" (light), without the quiet zone. */
export interface TeamCodeEncoder {
  encode(text: string): readonly string[];
}

export interface TeamCodeDeps {
  signer: TeamCodeSigner;
  encoder: TeamCodeEncoder;
  /** Milliseconds since the epoch. */
  now: () => number;
}

export type TeamCodeErrorCode = "forbidden" | "unauthenticated" | "disabled" | "unknown";

/** Who is asking: the verified session's uid and role (an organizer already resolves to `admin`). */
export interface TeamCodeActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

/** The role a session's code carries: staff are the event's volunteers; organizers (and admins) are organizers. */
export function teamRoleOf(role: TeamCodeActor["role"]): TeamCodeRole | null {
  if (role === "staff") return "volunteer";
  if (role === "admin") return "organizer";
  return null;
}

export interface IssuedTeamCode {
  role: TeamCodeRole;
  /** The picture: rows of "1" and "0" without the quiet zone. The signed text itself stays on the server. */
  cells: readonly string[];
  /** Server clock when it was issued and when it stops working, in ms. */
  issuedAt: number;
  expiresAt: number;
}

/** A team member's code for two minutes. Only staff and admins (organizers) have one; the uid comes from the session. */
export function issueTeamCode(deps: TeamCodeDeps, actor: TeamCodeActor): Result<IssuedTeamCode, { code: TeamCodeErrorCode }> {
  const role = teamRoleOf(actor.role);
  if (role === null) return err({ code: "forbidden" });
  try {
    const issuedAt = deps.now();
    const expiresAtSeconds = Math.floor(issuedAt / 1000) + TEAM_CODE_LIFETIME_SECONDS;
    const signature = deps.signer.sign(teamSigningInput(actor.uid, role, expiresAtSeconds));
    const payload = formatTeamPayload(actor.uid, role, expiresAtSeconds, signature);
    return ok({ role, cells: deps.encoder.encode(payload), issuedAt, expiresAt: expiresAtSeconds * 1000 });
  } catch (cause) {
    // Most likely the signing secret is missing or too short: say so in the server log.
    logServerError("team-code.issue", cause);
    return err({ code: "unknown" });
  }
}

export type VerifyTeamCodeOutcome = { ok: true; uid: string; role: TeamCodeRole } | { ok: false; code: "invalid-code" | "expired-code" };

/**
 * Checks a scanned team code. The signature is checked before the expiry, so only a code we really issued can ever be
 * told "expired"; a forged or altered one (a changed role, say) is simply invalid.
 */
export function verifyTeamCode(deps: Pick<TeamCodeDeps, "signer" | "now">, payload: string): VerifyTeamCodeOutcome {
  const parsed = parseTeamPayload(payload);
  if (parsed === null) return { ok: false, code: "invalid-code" };

  let genuine: boolean;
  try {
    genuine = deps.signer.verify(teamSigningInput(parsed.uid, parsed.role, parsed.expiresAt), parsed.signature);
  } catch (cause) {
    logServerError("team-code.verify", cause);
    return { ok: false, code: "invalid-code" };
  }
  if (!genuine) return { ok: false, code: "invalid-code" };

  const nowSeconds = Math.floor(deps.now() / 1000);
  if (parsed.expiresAt < nowSeconds) return { ok: false, code: "expired-code" };
  if (parsed.expiresAt > nowSeconds + TEAM_CODE_MAX_FUTURE_SECONDS) return { ok: false, code: "invalid-code" };
  return { ok: true, uid: parsed.uid, role: parsed.role };
}
