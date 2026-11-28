import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { isFinished } from "@/features/event/server";
import { logServerError } from "@/shared/lib/log";
import { eventDeps, publicEventInfo } from "./composition/event.server";

/** Current state of the public edition for attendee, speaker, staff and onboarding surfaces. */
export interface PublicEventState {
  id: string;
  name: string | null;
  venue: string | null;
  endsAt: Date | null;
  finished: boolean;
}

/**
 * Memoized per-request read of whether the active public edition has finished (marked `"finished"`
 * or past `endsAt`). Fails open (`finished: false`) on transient store errors so a live event is
 * never accidentally locked.
 */
export const getPublicEventState = cache(async (): Promise<PublicEventState> => {
  await connection();
  const read = await publicEventInfo();
  if (!read.ok) {
    logServerError("event.status.read", new Error("the public edition state could not be read"));
    return { id: "", name: null, venue: null, endsAt: null, finished: false };
  }
  const info = read.value;
  return {
    id: info.id,
    name: info.name ?? null,
    venue: info.venue ?? null,
    endsAt: info.endsAt,
    finished: isFinished(info, eventDeps.now()),
  };
});

/** Convenience check for pages, layouts and server actions gating live-event functionality. */
export async function isPublicEventFinished(): Promise<boolean> {
  return (await getPublicEventState()).finished;
}
