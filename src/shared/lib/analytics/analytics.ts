/** Product events instrumented from the use cases (never from components). Key metric: check-ins. */
export type AnalyticsEvent =
  | { name: "attendee_registered"; uid: string }
  | { name: "squad_assigned"; uid: string; squad: string }
  | {
      name: "checkin_completed";
      uid: string;
      checkpointId: string;
      kind: string;
      /** Who made it happen: the attendee scanning a code, or staff scanning the attendee's pass. */
      source?: "self" | "staff";
    };

export interface Analytics {
  track(event: AnalyticsEvent): void;
}
