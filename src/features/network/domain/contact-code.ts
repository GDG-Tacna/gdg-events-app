/** How long a contact code on screen can be scanned. The screen renews it before it ends. */
export const CONTACT_CODE_LIFETIME_SECONDS = 120;

/** A code may not claim to expire further ahead than a fresh one would, plus a little clock slack. */
export const CONTACT_CODE_MAX_FUTURE_SECONDS = CONTACT_CODE_LIFETIME_SECONDS + 30;

const PREFIX = "devfest:ct:";

export interface ParsedContactCode {
  uid: string;
  /** Unix seconds. */
  expiresAt: number;
  signature: string;
}

const UID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const EXPIRY_PATTERN = /^[0-9]{1,12}$/;

/**
 * What is signed. The `contact:` prefix keeps a contact signature from ever being valid as a pass or a talk code
 * (they share one secret), so a cadet's contact code never works at a food stand and the other way round.
 */
export const contactSigningInput = (uid: string, expiresAt: number): string => `contact:${uid}.${expiresAt}`;

export const formatContactCode = (uid: string, expiresAt: number, signature: string): string => `${PREFIX}${uid}.${expiresAt}.${signature}`;

/** Whether a scanned text is meant as a cadet's contact code (shape aside), so other scanners can point to Red. */
export const isContactCode = (text: string): boolean => text.startsWith(PREFIX);

/** `null` for anything that is not shaped like one of our contact codes. Shape only: the signature is checked elsewhere. */
export function parseContactCode(payload: string): ParsedContactCode | null {
  if (!isContactCode(payload)) return null;

  const parts = payload.slice(PREFIX.length).split(".");
  if (parts.length !== 3) return null;
  const [uid, expiry, signature] = parts;

  if (!UID_PATTERN.test(uid) || !EXPIRY_PATTERN.test(expiry) || !SIGNATURE_PATTERN.test(signature)) return null;
  return { uid, expiresAt: Number(expiry), signature };
}
