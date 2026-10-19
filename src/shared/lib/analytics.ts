/**
 * The moments of the event that are measured (Google Analytics 4). A closed set, and no parameter ever says who the
 * person is: no uid, alias, email or links. Exact counts live on the server (admin panel); this is for how the app is
 * used, and ad blockers hide part of it.
 */
export type AnalyticsEvent =
  | { name: "sign_up"; params: { method: "google" } }
  | { name: "check_in"; params: { kind: string } }
  | { name: "mission_complete"; params: { via: "scan" | "answer" } }
  | { name: "minigame_play"; params: { game: string; result: "win" | "loss" } }
  | { name: "contact_made" }
  | { name: "poll_vote" };

/** Where events go (the app shell plugs in Firebase Analytics); it must never throw into the screen. */
export type AnalyticsSink = (event: AnalyticsEvent) => void;

/** Events recorded before the app shell plugged in a sink (the first render), kept up to a few. */
const MAX_PENDING = 20;

let sink: AnalyticsSink | null = null;
const pending: AnalyticsEvent[] = [];

/** Plugs in where events go, and hands it what was recorded before. */
export function setAnalyticsSink(next: AnalyticsSink): void {
  sink = next;
  for (const event of pending.splice(0)) send(event);
}

function send(event: AnalyticsEvent): void {
  try {
    sink?.(event);
  } catch {
    // Measuring never breaks a screen.
  }
}

/** Records one moment of the event. Without a sink (tests, a page that has not booted yet) it is kept or dropped. */
export function track(event: AnalyticsEvent): void {
  if (sink) send(event);
  else if (pending.length < MAX_PENDING) pending.push(event);
}
