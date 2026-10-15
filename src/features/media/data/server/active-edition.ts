import "server-only";
import { getActiveEventId } from "@/shared/lib/firebase/active-event";

/** The edition new images are filed under. */
export const currentImageEventId = (): Promise<string> => getActiveEventId();
