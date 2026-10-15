import { err, ok, type Result } from "@/shared/lib/result";

export const ALIAS_MIN_LENGTH = 3;
export const ALIAS_MAX_LENGTH = 16;

/** Letters (any language), digits, underscore and hyphen. No spaces so aliases read well on a leaderboard. */
const ALLOWED = /^[\p{L}\p{N}_-]+$/u;

/** Names that could impersonate the organization. Compared on the normalized key. */
const RESERVED = new Set([
  "admin",
  "administrador",
  "staff",
  "organizador",
  "gdg",
  "gdgtacna",
  "devfest",
  "moderador",
]);

export type AliasErrorCode = "too-short" | "too-long" | "invalid-characters" | "reserved";

/**
 * A validated alias. `display` keeps the user's casing; `key` is the lowercase form used
 * to guarantee uniqueness ("Nova" and "nova" are the same alias).
 */
export interface Alias {
  readonly display: string;
  readonly key: string;
}

export function createAlias(raw: string): Result<Alias, AliasErrorCode> {
  const display = raw.normalize("NFC").trim();
  const length = [...display].length;

  if (length < ALIAS_MIN_LENGTH) return err("too-short");
  if (length > ALIAS_MAX_LENGTH) return err("too-long");
  if (!ALLOWED.test(display)) return err("invalid-characters");

  const key = display.toLowerCase();
  if (RESERVED.has(key)) return err("reserved");

  return ok({ display, key });
}
