import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `npm run dev` uses `.next`. Verification builds (tests, CI, scripts) set NEXT_DIST_DIR to their own
  // folder so a build never overwrites the cache of a dev server that is running at the same time.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  experimental: {
    // Image uploads go through a Server Action: the largest is a 4 MB venue plan (the use case checks each limit).
    // Kept under 4.5 MB, the request limit of Vercel's functions, so the same build works there.
    serverActions: { bodySizeLimit: "4.5mb" },
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

export default nextConfig;
