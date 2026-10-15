import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/features/auth/constants";

/** Surfaces that need a signed-in user. Later phases append their prefixes here. */
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/squad", "/scan", "/pass", "/map", "/missions", "/odyssey", "/achievements", "/minigame", "/red", "/escenario", "/staff", "/admin", "/mis-eventos"];

/**
 * Optimistic check only: it looks for the session cookie, never verifies it.
 * Real verification happens in `requireSession()` / `requireRole()` next to the data.
 * It deliberately does not bounce signed-in users away from /login: a stale cookie
 * would loop; the login page verifies the session itself.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\..*).*)"],
};
