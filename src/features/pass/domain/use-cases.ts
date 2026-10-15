import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { QrEncoder, TokenSigner } from "./ports";
import {
  PASS_LIFETIME_SECONDS,
  PASS_MAX_FUTURE_SECONDS,
  formatPassPayload,
  parsePassPayload,
  passSigningInput,
} from "./pass-code";
import { passError, type PassError } from "./pass-error";

export interface PassDeps {
  signer: TokenSigner;
  encoder: QrEncoder;
  /** Milliseconds since the epoch. */
  now: () => number;
}

export interface PassActor {
  uid: string;
  role: "attendee" | "staff" | "admin" | null;
}

export interface IssuedPass {
  /** The picture: rows of "1" and "0" without the quiet zone. The signed text itself stays on the server. */
  cells: readonly string[];
  /** Server clock when it was issued and when it stops working, in ms. */
  issuedAt: number;
  expiresAt: number;
}

/**
 * An attendee's personal pass: a code that says "this is attendee X" for one minute, signed so nobody can
 * make one for someone else. It is for staff to scan (for example to hand over a ration). The uid always
 * comes from the verified session, never from the request, and nothing is stored.
 */
export function issuePass(deps: PassDeps, actor: PassActor): Result<IssuedPass, PassError> {
  if (actor.role !== "attendee") return err(passError("forbidden"));

  try {
    const issuedAt = deps.now();
    const expiresAtSeconds = Math.floor(issuedAt / 1000) + PASS_LIFETIME_SECONDS;
    const signature = deps.signer.sign(passSigningInput(actor.uid, expiresAtSeconds));
    const payload = formatPassPayload(actor.uid, expiresAtSeconds, signature);

    return ok({ cells: deps.encoder.encode(payload), issuedAt, expiresAt: expiresAtSeconds * 1000 });
  } catch (cause) {
    // Most likely the signing secret is missing or too short: say so in the server log.
    logServerError("pass.issue", cause);
    return err(passError("unknown"));
  }
}

export type VerifyPassOutcome =
  | { ok: true; uid: string }
  | { ok: false; code: "invalid-code" | "expired-code" };

/**
 * Checks a scanned pass. The signature is checked before the expiry, so only a pass we really issued can
 * ever be told "expired"; a forged or altered one is simply invalid.
 */
export function verifyPass(deps: Pick<PassDeps, "signer" | "now">, payload: string): VerifyPassOutcome {
  const parsed = parsePassPayload(payload);
  if (parsed === null) return { ok: false, code: "invalid-code" };

  let genuine: boolean;
  try {
    genuine = deps.signer.verify(passSigningInput(parsed.uid, parsed.expiresAt), parsed.signature);
  } catch (cause) {
    logServerError("pass.verify", cause);
    return { ok: false, code: "invalid-code" };
  }
  if (!genuine) return { ok: false, code: "invalid-code" };

  const nowSeconds = Math.floor(deps.now() / 1000);
  if (parsed.expiresAt < nowSeconds) return { ok: false, code: "expired-code" };
  if (parsed.expiresAt > nowSeconds + PASS_MAX_FUTURE_SECONDS) return { ok: false, code: "invalid-code" };

  return { ok: true, uid: parsed.uid };
}
