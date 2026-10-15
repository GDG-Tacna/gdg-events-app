"use client";

import { useState, type ReactNode } from "react";
import { BrowserConnectivity, BrowserPlatform, BrowserServiceWorkerHost, PwaProvider as FeaturePwaProvider } from "@/features/pwa";

/**
 * Client composition root for the PWA: binds the browser adapters. The service worker only runs in
 * production builds (a worker would fight hot reload in development); set NEXT_PUBLIC_ENABLE_SW=true
 * to try it locally.
 */
const ENABLED = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "true";

export function PwaProvider({ children }: { children: ReactNode }) {
  // Created once per page load: the adapters hold the registration and the listeners.
  const [adapters] = useState(() => ({
    host: new BrowserServiceWorkerHost(),
    connectivity: new BrowserConnectivity(),
    platform: new BrowserPlatform(),
  }));

  return (
    <FeaturePwaProvider
      host={adapters.host}
      connectivity={adapters.connectivity}
      platform={adapters.platform}
      enabled={ENABLED}
    >
      {children}
    </FeaturePwaProvider>
  );
}
