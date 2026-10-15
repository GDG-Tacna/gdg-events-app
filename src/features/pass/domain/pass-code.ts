/** How long a pass on screen can be scanned. The screen renews it before it ends. */
export const PASS_LIFETIME_SECONDS = 60;

/** A pass may not claim to expire further ahead than a fresh one would, plus a little clock slack. */
export const PASS_MAX_FUTURE_SECONDS = PASS_LIFETIME_SECONDS + 30;

const PREFIX = "devfest:at:";

export interface ParsedPass {
  uid: string;
  /** Unix seconds. */
  expiresAt: number;
  signature: string;
}

const UID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const EXPIRY_PATTERN = /^[0-9]{1,12}$/;

/**
 * What is signed. The `pass:` prefix keeps a pass signature from ever being valid for another kind of
 * code (the talk codes sign `<checkpoint>.<expiry>`), even though they share one secret.
 */
export const passSigningInput = (uid: string, expiresAt: number): string => `pass:${uid}.${expiresAt}`;

export const formatPassPayload = (uid: string, expiresAt: number, signature: string): string =>
  `${PREFIX}${uid}.${expiresAt}.${signature}`;

/** `null` for anything that is not shaped like one of our passes. Shape only: the signature is checked elsewhere. */
export function parsePassPayload(payload: string): ParsedPass | null {
  if (!payload.startsWith(PREFIX)) return null;

  const parts = payload.slice(PREFIX.length).split(".");
  if (parts.length !== 3) return null;
  const [uid, expiry, signature] = parts;

  if (!UID_PATTERN.test(uid) || !EXPIRY_PATTERN.test(expiry) || !SIGNATURE_PATTERN.test(signature)) return null;
  return { uid, expiresAt: Number(expiry), signature };
}
