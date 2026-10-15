import "server-only";
import type { TalkView } from "@/features/talks";
import { toLocalDateTime, type Talk } from "@/features/talks/server";
import { EDITION } from "@/shared/config/edition";

/** A talk as plain data for the admin screens, its times as the venue's wall clock (what the form edits). */
export function toTalkView(talk: Talk): TalkView {
  return {
    id: talk.id,
    title: talk.title,
    speaker: talk.speaker,
    startsAt: talk.startsAt ? toLocalDateTime(talk.startsAt, EDITION.utcOffset) : null,
    endsAt: talk.endsAt ? toLocalDateTime(talk.endsAt, EDITION.utcOffset) : null,
    roomId: talk.roomId,
    description: talk.description,
    active: talk.active,
  };
}
