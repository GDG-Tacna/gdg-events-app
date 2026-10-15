"use client";

import { OfflineBanner, UpdatePrompt } from "@/features/pwa";

/**
 * The app-wide PWA notices: the "no connection" strip and the "new version" prompt. The offline page
 * hides the strip with CSS (see `globals.css`), because it already says it has no connection.
 */
export function PwaChrome() {
  return (
    <>
      <OfflineBanner />
      <UpdatePrompt />
    </>
  );
}
