import "server-only";
import { NextResponse } from "next/server";
import { showFeedSecret } from "@/app-shell/composition/show-feed.server";
import { checkFeedAccess } from "@/features/show-feed/server";
import { FEATURES } from "@/shared/config/features";

/**
 * What every show feed response carries. The show runs from local files (its origin is `null`), so any origin may
 * read: the feed uses no cookies and answers nothing without the bearer secret. Nothing is cached anywhere.
 */
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization",
  "Cache-Control": "no-store",
};

/** A JSON answer with the server's clock, so the show counts a code's expiry against it. */
export function feedJson(body: Record<string, unknown>, status = 200): Response {
  return NextResponse.json({ serverNow: Date.now(), ...body }, { status, headers: HEADERS });
}

export const feedError = (code: string, status: number): Response => feedJson({ error: code }, status);

/** The CORS preflight: the bearer header makes the browser ask first. */
export function feedPreflight(): Response {
  return new Response(null, { status: 204, headers: { ...HEADERS, "Access-Control-Max-Age": "600" } });
}

/** `null` when the request may read the feed; otherwise the answer to send (switched off, or a wrong secret). */
export function feedDenied(request: Request): Response | null {
  if (!FEATURES.showFeed) return feedError("disabled", 503);
  const access = checkFeedAccess(request.headers.get("authorization"), showFeedSecret());
  if (access === "disabled") return feedError("disabled", 503);
  if (access === "unauthorized") return feedError("unauthorized", 401);
  return null;
}
