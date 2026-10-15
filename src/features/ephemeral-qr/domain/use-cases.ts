import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import type { QrEncoder, TalkLookup, TokenSigner } from "./ports";
import {
  QR_LIFETIME_SECONDS,
  QR_MAX_FUTURE_SECONDS,
  formatPayload,
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
}

export interface IssuedQr {
  checkpointId: string;
  /** The talk's name, to show next to the code. */
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

/**
 * Admin only: a signed code for a talk that works for two minutes. Nothing is stored: the code carries
 * its own expiry and signature, so issuing costs no database write and any server instance can verify it.
 */
export async function issueQr(
  deps: EphemeralQrDeps,
  actor: QrActor,
  input: { checkpointId: string },
): Promise<Result<IssuedQr, EphemeralQrError>> {
  if (actor.role !== "admin") return err(qrError("forbidden"));

  const found = await deps.lookup.find(input.checkpointId);
  if (!found.ok) return err(qrError("unknown"));
  if (found.value === null) return err(qrError("checkpoint-not-found"));
  if (!found.value.active) return err(qrError("checkpoint-inactive"));
  if (found.value.kind !== "talk") return err(qrError("not-a-talk"));

  try {
    const issuedAt = deps.now();
    const expiresAtSeconds = Math.floor(issuedAt / 1000) + QR_LIFETIME_SECONDS;
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
