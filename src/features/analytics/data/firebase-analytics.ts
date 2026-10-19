"use client";

import type { Analytics } from "firebase/analytics";
import { getClientEnv } from "@/shared/config/env.client";
import type { AnalyticsEvent } from "@/shared/lib/analytics";
import { getFirebaseApp } from "@/shared/lib/firebase/client";

type LogEvent = (instance: Analytics, name: string, params?: Record<string, string>) => void;

/** The started instance and the module's logger (imported once, with Analytics itself). */
interface Measurer {
  instance: Analytics;
  logEvent: LogEvent;
}

let measurer: Promise<Measurer | null> | undefined;

/**
 * Analytics, loaded once and only where it measures something real: in a production build, in a browser that supports
 * it, with a measurement id and not against the emulators. Google signals and ad personalization are off: the app shows
 * no ads. Never throws: without Analytics the app works the same.
 */
function load(): Promise<Measurer | null> {
  measurer ??= (async () => {
    if (typeof window === "undefined" || process.env.NODE_ENV !== "production") return null;
    const env = getClientEnv();
    if (!env.measurementId || env.useEmulator) return null;
    const { initializeAnalytics, isSupported, logEvent } = await import("firebase/analytics");
    if (!(await isSupported())) return null;
    const instance = initializeAnalytics(getFirebaseApp(), { config: { allow_google_signals: false, allow_ad_personalization_signals: false } });
    return { instance, logEvent: logEvent as LogEvent };
  })().catch(() => null);
  return measurer;
}

/** Starts Analytics when the app opens, so page views are counted before any event. */
export function startFirebaseAnalytics(): void {
  void load();
}

/** The sink for `track` (shared/lib/analytics): records one event in Google Analytics, nothing where it is off. */
export function firebaseAnalyticsSink(event: AnalyticsEvent): void {
  void load()
    .then((ready) => ready?.logEvent(ready.instance, event.name, "params" in event ? event.params : undefined))
    .catch(() => undefined);
}
