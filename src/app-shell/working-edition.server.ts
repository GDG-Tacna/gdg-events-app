import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getServerEnv } from "@/shared/config/env.server";
import { isEventId } from "@/shared/types/event";

/**
 * The edition an admin or organizer is preparing in the control center, when it is not the public one. It lives in
 * a cookie the browser only sends to `/admin` (so cadet, staff and stage requests never carry it), signed with a key
 * derived from the server's QR secret and bound to the account and an expiry. The guard still checks, on every
 * request, that the session may work in that edition before anything reads it.
 */
export const WORKING_EDITION_COOKIE = "admin_edition";
export const WORKING_EDITION_PATH = "/admin";
export const WORKING_EDITION_TTL_MS = 12 * 60 * 60 * 1000;

/** The signing key, or `null` without a QR secret (then nobody can pick another edition: everything stays public). */
export function workingEditionKey(secret: string | undefined = getServerEnv().qrSigningSecret): Buffer | null {
  return secret ? createHmac("sha256", secret).update("admin-edition").digest() : null;
}

const mac = (key: Buffer, uid: string, eventId: string, expires: number) => createHmac("sha256", key).update(`${uid}\n${eventId}\n${expires}`).digest("base64url");

/** `{eventId}.{expiry in seconds}.{signature}`; the account is part of the signature, not of the value. */
export function signWorkingEdition(key: Buffer, uid: string, eventId: string, expiresAtMs: number): string {
  const expires = Math.floor(expiresAtMs / 1000);
  return `${eventId}.${expires}.${mac(key, uid, eventId, expires)}`;
}

/** The edition named by a cookie value, only when it was signed for this account and has not expired. */
export function verifyWorkingEdition(key: Buffer, value: string | undefined, uid: string, nowMs: number): string | null {
  if (!value) return null;
  const [eventId, expiresText, signature, ...rest] = value.split(".");
  if (rest.length > 0 || !isEventId(eventId) || !/^\d{1,12}$/.test(expiresText ?? "") || !signature) return null;
  const expires = Number(expiresText);
  if (expires * 1000 <= nowMs) return null;
  const expected = Buffer.from(mac(key, uid, eventId, expires));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given) ? eventId : null;
}

/** The working edition this request names for this account, or `null` (outside a request, unsigned, expired, other account). */
export async function readWorkingEdition(uid: string, now: () => number = Date.now): Promise<string | null> {
  const key = workingEditionKey();
  if (!key) return null;
  try {
    return verifyWorkingEdition(key, (await cookies()).get(WORKING_EDITION_COOKIE)?.value, uid, now());
  } catch {
    // No request scope (a script, a test): there is no working edition.
    return null;
  }
}

/** Whether this request carries a working edition cookie at all (cheap: no signature or session check). */
export async function hasWorkingEditionCookie(): Promise<boolean> {
  try {
    return (await cookies()).has(WORKING_EDITION_COOKIE);
  } catch {
    return false;
  }
}

/** Saves the choice for this account, or clears it with `null` (back to the public edition). Server Actions only. */
export async function writeWorkingEdition(uid: string, eventId: string | null, now: () => number = Date.now): Promise<boolean> {
  const jar = await cookies();
  if (eventId === null) {
    jar.delete({ name: WORKING_EDITION_COOKIE, path: WORKING_EDITION_PATH });
    return true;
  }
  const key = workingEditionKey();
  if (!key) return false;
  const expiresAt = now() + WORKING_EDITION_TTL_MS;
  jar.set(WORKING_EDITION_COOKIE, signWorkingEdition(key, uid, eventId, expiresAt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: WORKING_EDITION_PATH,
    expires: new Date(expiresAt),
  });
  return true;
}
