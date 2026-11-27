import { err, ok, type Result } from "@/shared/lib/result";

export const RECIPIENT_NAME_MIN = 4;
export const RECIPIENT_NAME_MAX = 90;

export type RecipientNameErrorCode = "empty" | "too-short" | "too-long" | "incomplete" | "invalid-characters";

/** Letters of any script, combining marks, spaces, hyphens, apostrophes and dots (e.g. "María J. O'Connor-Pérez"). */
const ALLOWED_NAME = /^[\p{L}\p{M}\s.'’-]+$/u;
const HAS_LETTER = /\p{L}/u;

/**
 * Validates and normalizes the full name printed on a certificate. Requires at least two words
 * (first name and last name) so people do not accidentally lock an alias or a single first name.
 */
export function validateRecipientName(raw: string): Result<string, RecipientNameErrorCode> {
  const normalized = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (normalized.length === 0) return err("empty");
  if (normalized.length < RECIPIENT_NAME_MIN) return err("too-short");
  if (normalized.length > RECIPIENT_NAME_MAX) return err("too-long");
  if (!ALLOWED_NAME.test(normalized)) return err("invalid-characters");

  const words = normalized.split(" ").filter((word) => HAS_LETTER.test(word));
  if (words.length < 2) return err("incomplete");
  return ok(normalized);
}

/**
 * Picks the best initial full-name suggestion before the user confirms and locks it:
 * 1) the imported ticket holder's full name, 2) the speaker profile name, 3) the Google account display name.
 */
export function suggestRecipientName(input: {
  ticketHolderName?: string | null;
  speakerName?: string | null;
  accountDisplayName?: string | null;
}): string {
  const candidates = [input.ticketHolderName, input.speakerName, input.accountDisplayName];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const cleaned = candidate.normalize("NFC").trim().replace(/\s+/g, " ");
    if (cleaned.length > 0) return cleaned.slice(0, RECIPIENT_NAME_MAX);
  }
  return "";
}
