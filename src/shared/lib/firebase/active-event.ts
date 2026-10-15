import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Firestore } from "firebase-admin/firestore";
import { EDITION } from "@/shared/config/edition";
import { isEventId, type EventId } from "@/shared/types/event";
import { getAdminFirestore } from "./admin";
import { APP_CONFIG_DOC, CONFIG_COLLECTION } from "./collections";

export type ActiveEventResolver = () => Promise<EventId>;

/** The resolver the server uses, plus a way to drop its cached answer when an admin publishes another edition. */
export type ForgettingResolver = ActiveEventResolver & { forget: () => void };

export interface ActiveEventOptions {
  getDb?: () => Firestore;
  fallbackId?: EventId;
  ttlMs?: number;
  now?: () => number;
}

/**
 * Which edition the app serves right now: `config/app.activeEventId`, or the edition's default when
 * that document does not exist yet. The answer is cached for a short time so a scan does not pay an
 * extra read. A read failure is thrown (the caller's own error handling reports it) instead of
 * falling back, because writing into the wrong edition is worse than failing.
 */
export function createActiveEventResolver({
  getDb = getAdminFirestore,
  fallbackId = EDITION.defaultEventId,
  ttlMs = 60_000,
  now = Date.now,
}: ActiveEventOptions = {}): ForgettingResolver {
  let cached: { id: EventId; expiresAt: number } | undefined;

  const resolve = async () => {
    if (cached && cached.expiresAt > now()) return cached.id;

    const snapshot = await getDb().collection(CONFIG_COLLECTION).doc(APP_CONFIG_DOC).get();
    const configured: unknown = snapshot.exists ? snapshot.data()?.activeEventId : undefined;
    if (configured !== undefined && !isEventId(configured)) {
      throw new Error("config/app.activeEventId is not a valid event id");
    }

    const id = configured ?? fallbackId;
    cached = { id, expiresAt: now() + ttlMs };
    return id;
  };
  return Object.assign(resolve, {
    forget: () => {
      cached = undefined;
    },
  });
}

/**
 * The public edition: the one cadets, staff and the stage use. Other servers keep their answer for up to a
 * minute after an edition is published; `forget` only clears this server's.
 */
export const getPublicEventId: ForgettingResolver = createActiveEventResolver();

/** Drops this server's cached public edition, right after an admin publishes another one. */
export const forgetActiveEventId = (): void => getPublicEventId.forget();

/** An edition named explicitly for a piece of work (an invitation link names its own edition). */
const scope = new AsyncLocalStorage<EventId>();

/** Runs `work` (and everything it awaits) against `eventId` instead of the request's edition. */
export function runInEdition<T>(eventId: EventId, work: () => Promise<T>): Promise<T> {
  if (!isEventId(eventId)) return Promise.reject(new Error("not a valid event id"));
  return scope.run(eventId, work);
}

/**
 * Where the current request may point to another edition: the admin's working edition, already checked against the
 * verified session by the app's guard. Registered once by the app; it answers `null` outside a request or when the
 * request has none.
 */
type RequestEditionSource = () => Promise<EventId | null>;
let requestEdition: RequestEditionSource | null = null;

export function setRequestEditionSource(source: RequestEditionSource | null): void {
  requestEdition = source;
}

/**
 * The edition a piece of server work reads and writes: one named explicitly (`runInEdition`), else the request's
 * working edition (only in the control center, for an admin or organizer allowed in it), else the public one.
 * Every adapter resolves its paths through this, so a request never mixes editions.
 */
export const getActiveEventId: ForgettingResolver = Object.assign(
  async (): Promise<EventId> => {
    const named = scope.getStore();
    if (named) return named;
    const working = requestEdition ? await requestEdition() : null;
    return working ?? (await getPublicEventId());
  },
  { forget: () => getPublicEventId.forget() },
);
