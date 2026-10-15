import { OFFLINE_PATH, serviceWorkerSource } from "@/features/pwa/server";

/** Built once per deploy: the version changes with `BUILD_ID` (or Vercel's commit, set by Vercel itself) and so does the worker. */
export const dynamic = "force-static";

/**
 * Files fetched when the worker installs. The offline page is a static route, so it never depends on a session.
 * The icons are the ones in the manifest, so the installed app still has its image offline.
 */
const PRECACHE = [OFFLINE_PATH, "/icons/icon-192.png", "/icons/icon-512.png"];

export function GET() {
  const source = serviceWorkerSource({ version: process.env.BUILD_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "1", precache: PRECACHE });

  return new Response(source, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
