/** Stable slug of one edition of the event (for example `devfest-2026`). It is a path segment in Firestore. */
export type EventId = string;

const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/;

export const isEventId = (value: unknown): value is EventId =>
  typeof value === "string" && EVENT_ID_PATTERN.test(value);
