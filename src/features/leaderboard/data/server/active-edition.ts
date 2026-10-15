import "server-only";
import { getActiveEventId } from "@/shared/lib/firebase/active-event";

/** The edition the app serves now, for the stage screen's listeners (they build their paths from it). */
export const currentEditionId = (): Promise<string> => getActiveEventId();
