import { logServerError } from "@/shared/lib/log";
import { err, ok, type Result } from "@/shared/lib/result";
import { isSpeakerId } from "./speaker";

/** How long a speaker's code can be scanned. Short on purpose, like a talk's: it proves meeting them in person. */
export const SPEAKER_CODE_LIFETIME_SECONDS = 120;

/** A code may not claim to expire further ahead than a fresh one would, plus a little clock slack. */
export const SPEAKER_CODE_MAX_FUTURE_SECONDS = SPEAKER_CODE_LIFETIME_SECONDS + 30;

const PREFIX = "devfest:sp:";
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const EXPIRY_PATTERN = /^[0-9]{1,12}$/;

/**
 * What is signed. The `speaker:` prefix keeps a speaker signature from ever being valid for another kind of code
 * (talk codes sign `<checkpoint>.<expiry>`, passes `pass:<uid>.<expiry>`), even though they share one secret.
 */
export const speakerSigningInput = (speakerId: string, expiresAt: number): string => `speaker:${speakerId}.${expiresAt}`;

export const formatSpeakerPayload = (speakerId: string, expiresAt: number, signature: string): string =>
  `${PREFIX}${speakerId}.${expiresAt}.${signature}`;

/** Whether a scanned text is a speaker's code at all (signed or not), so the scanner can route it. */
export const isSpeakerCode = (payload: string): boolean => payload.startsWith(PREFIX);

/** `null` for anything that is not shaped like a speaker's code. Shape only: the signature is checked elsewhere. */
export function parseSpeakerPayload(payload: string): { speakerId: string; expiresAt: number; signature: string } | null {
  if (!isSpeakerCode(payload)) return null;
  const parts = payload.slice(PREFIX.length).split(".");
  if (parts.length !== 3) return null;
  const [speakerId, expiry, signature] = parts;
  if (!isSpeakerId(speakerId) || !EXPIRY_PATTERN.test(expiry) || !SIGNATURE_PATTERN.test(signature)) return null;
  return { speakerId, expiresAt: Number(expiry), signature };
}

/** Signs and checks short messages with a server secret (the one the talk codes and passes use). */
export interface TokenSigner {
  sign(input: string): string;
  /** Constant-time comparison: a wrong guess reveals nothing about the right one. */
  verify(input: string, signature: string): boolean;
}

/** Draws a QR code. Rows of "1" (dark) and "0" (light), without the quiet zone. */
export interface QrEncoder {
  encode(text: string): readonly string[];
}

/** The slice of the catalog a code needs: who the speaker is, whether they are offered, and their linked account. */
export interface SpeakerLookup {
  find(id: string): Promise<Result<{ id: string; name: string; active: boolean; uid: string | null } | null, { code: string }>>;
}

export interface SpeakerCodeDeps {
  signer: TokenSigner;
  encoder: QrEncoder;
  speakers: SpeakerLookup;
  /** Milliseconds since the epoch. */
  now: () => number;
}

export type SpeakerCodeErrorCode = "not-found" | "inactive" | "unauthenticated" | "forbidden" | "disabled" | "unknown";

export interface IssuedSpeakerCode {
  speakerId: string;
  name: string;
  /** The picture: rows of "1" and "0" without the quiet zone. The signed text itself stays on the server. */
  cells: readonly string[];
  /** Server clock when it was issued and when it stops working, in ms. */
  issuedAt: number;
  expiresAt: number;
}

/**
 * A speaker's code for two minutes: cadets scan it to complete their «Conoce al speaker» missions. Shown by an
 * admin (from Speakers) or by the speaker themselves once their account is linked. Nothing is stored: the code
 * carries its own expiry and signature. Only an active speaker has a code.
 */
export async function issueSpeakerCode(
  deps: SpeakerCodeDeps,
  actor: { uid: string; role: "attendee" | "staff" | "admin" | null },
  input: { speakerId: string },
): Promise<Result<IssuedSpeakerCode, { code: SpeakerCodeErrorCode }>> {
  if (!isSpeakerId(input.speakerId)) return err({ code: "not-found" });
  const found = await deps.speakers.find(input.speakerId);
  if (!found.ok) return err({ code: "unknown" });
  const speaker = found.value;
  // Someone else's code is not even confirmed to exist.
  if (!speaker || (actor.role !== "admin" && speaker.uid !== actor.uid)) return err({ code: speaker ? "forbidden" : "not-found" });
  if (!speaker.active) return err({ code: "inactive" });

  try {
    const issuedAt = deps.now();
    const expiresAtSeconds = Math.floor(issuedAt / 1000) + SPEAKER_CODE_LIFETIME_SECONDS;
    const signature = deps.signer.sign(speakerSigningInput(speaker.id, expiresAtSeconds));
    const payload = formatSpeakerPayload(speaker.id, expiresAtSeconds, signature);
    return ok({ speakerId: speaker.id, name: speaker.name, cells: deps.encoder.encode(payload), issuedAt, expiresAt: expiresAtSeconds * 1000 });
  } catch (cause) {
    // Most likely the signing secret is missing or too short: say so in the server log.
    logServerError("speakers.code.issue", cause);
    return err({ code: "unknown" });
  }
}

export type VerifySpeakerCodeOutcome = { ok: true; speakerId: string } | { ok: false; code: "invalid-code" | "expired-code" };

/**
 * Checks a scanned speaker's code. The signature is checked before the expiry, so only a code we really issued can
 * ever be told "expired"; a forged or altered one is simply invalid. Whether the speaker is still offered is the
 * caller's to check (the catalog).
 */
export function verifySpeakerCode(deps: Pick<SpeakerCodeDeps, "signer" | "now">, payload: string): VerifySpeakerCodeOutcome {
  const parsed = parseSpeakerPayload(payload);
  if (parsed === null) return { ok: false, code: "invalid-code" };

  let genuine: boolean;
  try {
    genuine = deps.signer.verify(speakerSigningInput(parsed.speakerId, parsed.expiresAt), parsed.signature);
  } catch (cause) {
    logServerError("speakers.code.verify", cause);
    return { ok: false, code: "invalid-code" };
  }
  if (!genuine) return { ok: false, code: "invalid-code" };

  const nowSeconds = Math.floor(deps.now() / 1000);
  if (parsed.expiresAt < nowSeconds) return { ok: false, code: "expired-code" };
  if (parsed.expiresAt > nowSeconds + SPEAKER_CODE_MAX_FUTURE_SECONDS) return { ok: false, code: "invalid-code" };
  return { ok: true, speakerId: parsed.speakerId };
}
