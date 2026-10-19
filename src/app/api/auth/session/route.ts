import { NextResponse } from "next/server";
import { z } from "zod";
import { authDeps } from "@/app-shell/composition/auth.server";
import {
  clearSessionCookie,
  closeSession,
  openSession,
  readSessionCookie,
  refreshSessionCookie,
  writeSessionCookie,
} from "@/features/auth/server";
import type { AuthErrorCode } from "@/features/auth";

const bodySchema = z.object({ credential: z.string().min(1) });

const STATUS_BY_CODE: Record<AuthErrorCode, number> = {
  cancelled: 400,
  network: 502,
  "invalid-credential": 401,
  "recent-sign-in-required": 401,
  unauthenticated: 401,
  forbidden: 403,
  unknown: 500,
};

function failure(code: AuthErrorCode) {
  return NextResponse.json({ error: code }, { status: STATUS_BY_CODE[code] });
}

/**
 * Whether the request comes from the app's own pages. Browsers send Origin on every POST, PUT and DELETE, and another
 * site cannot fake it. Without this, a page elsewhere could post a form (text/plain needs no CORS preflight) with the
 * attacker's own credential and sign the visitor in as the attacker, crediting their scans to that account.
 */
function fromThisApp(request: Request, withBody: boolean): boolean {
  if (request.headers.get("origin") !== new URL(request.url).origin) return false;
  return !withBody || (request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");
}

/** Opens the session: exchanges a fresh sign-in credential for an HTTP-only session cookie. */
export async function POST(request: Request) {
  if (!fromThisApp(request, true)) return failure("forbidden");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure("invalid-credential");

  const opened = await openSession(authDeps, parsed.data.credential);
  if (!opened.ok) return failure(opened.error.code);

  await writeSessionCookie(opened.value);
  return NextResponse.json({ ok: true });
}

/** Refreshes the session: swaps the cookie for one that carries the user's current role claim. */
export async function PUT(request: Request) {
  if (!fromThisApp(request, true)) return failure("forbidden");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure("invalid-credential");

  const refreshed = await refreshSessionCookie(authDeps, parsed.data.credential, await readSessionCookie());
  if (!refreshed.ok) return failure(refreshed.error.code);

  await writeSessionCookie(refreshed.value);
  return NextResponse.json({ ok: true });
}

/** Closes the session: revokes the user's refresh tokens and clears the cookie. */
export async function DELETE(request: Request) {
  if (!fromThisApp(request, false)) return failure("forbidden");
  const closed = await closeSession(authDeps, await readSessionCookie());
  await clearSessionCookie();
  return closed.ok ? NextResponse.json({ ok: true }) : failure(closed.error.code);
}
