import "server-only";
import { cookies } from "next/headers";
import type { SessionCookie } from "../../domain/ports";
import { SESSION_COOKIE_NAME } from "../session-cookie-name";

export async function readSessionCookie(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value;
}

export async function writeSessionCookie(cookie: SessionCookie): Promise<void> {
  (await cookies()).set(SESSION_COOKIE_NAME, cookie.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: cookie.expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE_NAME);
}
