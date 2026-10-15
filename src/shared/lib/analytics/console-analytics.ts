import type { Analytics, AnalyticsEvent } from "./analytics";

/** Structured log line per event. A real analytics backend (still TBD) replaces this adapter. */
export class ConsoleAnalytics implements Analytics {
  track(event: AnalyticsEvent): void {
    console.info(JSON.stringify({ type: "analytics", at: new Date().toISOString(), ...event }));
  }
}
