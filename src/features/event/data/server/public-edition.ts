import "server-only";
import { forgetActiveEventId, getActiveEventId, getPublicEventId, runInEdition as runScoped, setRequestEditionSource } from "@/shared/lib/firebase/active-event";

/** Drops this server's cached public edition, right after an admin publishes another one (other servers catch up within a minute). */
export const forgetPublicEdition = (): void => forgetActiveEventId();

/** The edition cadets, staff and the stage use, whatever the request is working on. */
export const publicEditionId = (): Promise<string> => getPublicEventId();

/** The edition this request reads and writes (a working edition in the control center, else the public one). */
export const currentEditionOf = (): Promise<string> => getActiveEventId();

/** Runs `work` against an edition named explicitly (an invitation link names its own). */
export const runInEdition = <T,>(eventId: string, work: () => Promise<T>): Promise<T> => runScoped(eventId, work);

/** Lets the app say which edition a request works in, once it has checked the session (see the guard). */
export const registerRequestEdition = (source: (() => Promise<string | null>) | null): void => setRequestEditionSource(source);
