import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // `npm run dev` uses `.next`. Verification builds (tests, CI, scripts) set NEXT_DIST_DIR to their own
  // folder so a build never overwrites the cache of a dev server that is running at the same time.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  experimental: {
    // Image uploads go through a Server Action: the largest is a 4 MB venue plan (the use case checks each limit).
    // Kept under 4.5 MB, the request limit of Vercel's functions, so the same build works there.
    serverActions: { bodySizeLimit: "4.5mb" },
  },

  /**
   * Google sign-in's handler pages served from this site, so the sign-in window and the app share one site. Browsers
   * that block third-party storage (Safari, Chrome on phones, Brave...) otherwise lose the result of the Google window
   * when it lives on firebaseapp.com: it closes and the login shows again. Firebase's recommended fix; it takes effect
   * where NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is this site's own domain (docs/deploy.md).
   */
  async rewrites() {
    const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!project) return [];
    return [
      { source: "/__/auth/:path*", destination: `https://${project}.firebaseapp.com/__/auth/:path*` },
      { source: "/__/firebase/:path*", destination: `https://${project}.firebaseapp.com/__/firebase/:path*` },
    ];
  },

  async headers() {
    return [
      {
        // Every route.
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The scanner is the only feature that needs a device; everything else stays off.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
        ],
      },
      {
        // The stage screen alone may be framed, and only by this same site: the console shows a small copy of it. It
        // comes after the rule above, and the last rule for a header wins.
        source: "/escenario",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        // Google sign-in's own pages, served from this site (see rewrites): Firebase frames its helper page from the
        // same site, so it may be framed here, by this site only.
        source: "/__/auth/:path*",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        // The service worker must never be cached, or users would not get new versions.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

/**
 * Sentry wraps the build: with SENTRY_AUTH_TOKEN (only in Vercel) it uploads the source maps, so errors show the real
 * code; without it the build is the same and nothing is uploaded. Events travel through the app's own /monitoring
 * route, so ad blockers on phones do not drop them.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || "gdg-tacna",
  project: process.env.SENTRY_PROJECT || "gdg-event-app",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Kept out of the proxy's matcher (src/proxy.ts), so reports are never redirected to the login.
  tunnelRoute: "/monitoring",
  telemetry: false,
});
