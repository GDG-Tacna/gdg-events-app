/**
 * Test doubles for Firestore model flat collection names. Adapters reach per-event data through
 * `db.collection("events").doc(eventId).collection(name)`; this turns that call into the flat
 * collection `events/{eventId}/{name}` so a fake can keep keying its documents by plain paths.
 */
export function withEventScope<T>(leaf: (collectionPath: string) => T) {
  return (name: string): T | { doc: (eventId: string) => { collection: (child: string) => T } } =>
    name === "events"
      ? { doc: (eventId: string) => ({ collection: (child: string) => leaf(`events/${eventId}/${child}`) }) }
      : leaf(name);
}

/** The event id every adapter test runs against. */
export const TEST_EVENT_ID = "e1";
export const testEventResolver = async () => TEST_EVENT_ID;
