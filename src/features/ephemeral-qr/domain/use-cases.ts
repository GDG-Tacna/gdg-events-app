import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { QrEncoder, TalkLookup, TokenSigner } from "./ports";
import {
  QR_MAX_FUTURE_SECONDS,
  formatPayload,
  lifetimeSecondsFor,
  parsePayload,
  signingInput,
} from "./qr-code";
import { qrError, type EphemeralQrError } from "./qr-error";

export interface EphemeralQrDeps {
  signer: TokenSigner;
  encoder: QrEncoder;
  lookup: TalkLookup;
  /** Milliseconds since the epoch. */
  now: () => number;
}

/** Who is asking. The server action takes it from the verified session, never from the request. */
export interface QrActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
  /** For staff: the kinds of station the edition lets them operate (an admin needs none). */
  kinds?: readonly string[];
}

/** The checkpoints whose code is drawn on a screen: a talk's, in its room, and the entrance's, at the door. */
const SCREEN_KINDS: readonly string[] = ["talk", "entrance"];

/**
 * Who may put a checkpoint's code on a screen: an admin (an organizer is one) any of them; staff only the entrance's,
 * and only when the edition lets staff operate entrances. A talk's code never goes to staff.
 */
function mayShow(actor: QrActor, kind: string): boolean {
  if (actor.role === "admin") return true;
  return actor.role === "staff" && kind === "entrance" && (actor.kinds ?? []).includes("entrance");
}

export interface IssuedQr {
  checkpointId: string;
  /** The talk's or the entrance's name, to show next to the code. */
  name: string;
  /** What the QR contains. */
  payload: string;
  /** The picture: rows of "1" and "0" without the quiet zone. */
  cells: readonly string[];
  /** Server clock when it was issued and when it stops working, in ms. The screen counts down against these. */
  issuedAt: number;
  expiresAt: number;
}

export interface TalkOption {
  id: string;
  name: string;
}

/** The talks an admin can put on screen. */
export async function listTalks(
  deps: Pick<EphemeralQrDeps, "lookup">,
  actor: QrActor,
): Promise<Result<readonly TalkOption[], EphemeralQrError>> {
  if (actor.role !== "admin") return err(qrError("forbidden"));

  const active = await deps.lookup.listActive();
  if (!active.ok) return err(qrError("unknown"));
  return ok(active.value.filter((checkpoint) => checkpoint.kind === "talk").map(({ id, name }) => ({ id, name })));
}

/** A checkpoint that can show a code on a screen, with its kind. */
export interface ScreenCheckpoint {
  id: string;
  name: string;
  kind: string;
}

/** The checkpoints this actor can put on a screen: every open talk and entrance for an admin, the entrances for allowed staff. */
export async function listScreenCheckpoints(
  deps: Pick<EphemeralQrDeps, "lookup">,
  actor: QrActor,
): Promise<Result<readonly ScreenCheckpoint[], EphemeralQrError>> {
  if (actor.role !== "admin" && actor.role !== "staff") return err(qrError("forbidden"));

  const active = await deps.lookup.listActive();
  if (!active.ok) return err(qrError("unknown"));
  return ok(active.value.filter((checkpoint) => SCREEN_KINDS.includes(checkpoint.kind) && mayShow(actor, checkpoint.kind)).map(({ id, name, kind }) => ({ id, name, kind })));
}

/**
 * A signed code for a talk (two minutes) or an entrance (one minute), for whoever may show it. Nothing is stored: the code
 * carries its own expiry and signature, so issuing costs no database write, any server instance can verify it, and
 * every screen that asks gets a code of its own: two devices at the same door share nothing.
 */
export async function issueQr(
  deps: EphemeralQrDeps,
  actor: QrActor,
  input: { checkpointId: string },
): Promise<Result<IssuedQr, EphemeralQrError>> {
  if (actor.role !== "admin" && actor.role !== "staff") return err(qrError("forbidden"));

  const found = await deps.lookup.find(input.checkpointId);
  if (!found.ok) return err(qrError("unknown"));
  if (found.value === null) return err(qrError("checkpoint-not-found"));
  if (!found.value.active) return err(qrError("checkpoint-inactive"));
  if (!SCREEN_KINDS.includes(found.value.kind)) return err(qrError("not-shown-on-screen"));
  if (!mayShow(actor, found.value.kind)) return err(qrError("forbidden"));

  try {
    const issuedAt = deps.now();
    const expiresAtSeconds = Math.floor(issuedAt / 1000) + lifetimeSecondsFor(found.value.kind);
    const signature = deps.signer.sign(signingInput(found.value.id, expiresAtSeconds));
    const payload = formatPayload(found.value.id, expiresAtSeconds, signature);

    return ok({
      checkpointId: found.value.id,
      name: found.value.name,
      payload,
      cells: deps.encoder.encode(payload),
      issuedAt,
      expiresAt: expiresAtSeconds * 1000,
    });
  } catch (cause) {
    // Most likely the signing secret is missing or too short: say so in the server log.
    logServerError("ephemeral-qr.issue", cause);
    return err(qrError("unknown"));
  }
}

export type VerifyOutcome =
  | { ok: true; checkpointId: string }
  | { ok: false; code: "invalid-code" | "expired-code" };

/**
 * Checks a scanned payload. The signature is checked before the expiry, so only a code we really
 * issued can ever be told "expired"; a forged or altered one is simply invalid.
 */
export function verifyPayload(deps: Pick<EphemeralQrDeps, "signer" | "now">, payload: string): VerifyOutcome {
  const parsed = parsePayload(payload);
  if (parsed === null) return { ok: false, code: "invalid-code" };

  let genuine: boolean;
  try {
    genuine = deps.signer.verify(signingInput(parsed.checkpointId, parsed.expiresAt), parsed.signature);
  } catch (cause) {
    logServerError("ephemeral-qr.verify", cause);
    return { ok: false, code: "invalid-code" };
  }
  if (!genuine) return { ok: false, code: "invalid-code" };

  const nowSeconds = Math.floor(deps.now() / 1000);
  if (parsed.expiresAt < nowSeconds) return { ok: false, code: "expired-code" };
  // A signed code can never expire further ahead than a fresh one: this bounds a leaked secret's damage too.
  if (parsed.expiresAt > nowSeconds + QR_MAX_FUTURE_SECONDS) return { ok: false, code: "invalid-code" };

  return { ok: true, checkpointId: parsed.checkpointId };
}
