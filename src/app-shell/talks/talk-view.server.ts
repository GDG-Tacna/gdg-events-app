import "server-only";
import type { TalkView } from "@/features/talks";
import { toLocalDateTime, type Talk } from "@/features/talks/server";
import { EDITION } from "@/shared/config/edition";

/**
 * A talk as plain data for the admin screens, its times as the venue's wall clock (what the form edits), its speakers
 * named from the edition's catalog (`names`, by id).
 */
export function toTalkView(talk: Talk, names: ReadonlyMap<string, string> = new Map()): TalkView {
  const named = talk.speakerIds.map((id) => names.get(id)).filter((name): name is string => Boolean(name));
  return {
    id: talk.id,
    title: talk.title,
    speakerIds: talk.speakerIds,
    speaker: named.length > 0 ? named.join(", ") : talk.speaker,
    legacySpeaker: talk.speakerIds.length === 0 ? talk.speaker : null,
    startsAt: talk.startsAt ? toLocalDateTime(talk.startsAt, EDITION.utcOffset) : null,
    endsAt: talk.endsAt ? toLocalDateTime(talk.endsAt, EDITION.utcOffset) : null,
    roomId: talk.roomId,
    description: talk.description,
    active: talk.active,
  };
}
