import { EVENT_CONFIG_COLLECTION, EVENTS_COLLECTION, PARTICIPANTS_COLLECTION } from "@/shared/lib/firebase/collections";

/** The stage document's id inside the edition's settings: `events/{eventId}/config/stage`. */
export const STAGE_DOC = "stage";

/** Where the stage screen listens, for the client SDK (the server reaches the same documents through `eventCollection`). */
export const CONFIG_STAGE_PATH = (eventId: string) => `${EVENTS_COLLECTION}/${eventId}/${EVENT_CONFIG_COLLECTION}/${STAGE_DOC}`;
export const PARTICIPANTS_PATH = (eventId: string) => `${EVENTS_COLLECTION}/${eventId}/${PARTICIPANTS_COLLECTION}`;
