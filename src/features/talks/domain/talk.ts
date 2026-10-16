import { isCheckpointId } from "@/features/checkins";
import { err, ok, type Result } from "@/shared/lib/result";

/**
 * A talk of the edition. It is stored as a checkpoint of kind `talk` (its id is the checkpoint id), so check-ins,
 * talk missions and the projected QR keep working; the talk adds what the agenda needs. Talks created before this
 * module (in Puestos) have only a title: the rest reads as missing.
 */
export interface Talk {
  id: string;
  title: string;
  /** The speakers who give it, from the edition's catalog, in order. */
  speakerIds: readonly string[];
  /** The speaker's name as typed before the catalog existed: shown only when the talk has no speakers yet. */
  speaker: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  /** The quadrant of the venue plan where it happens, or `null`. */
  roomId: string | null;
  description: string;
  /** An inactive talk is kept (check-ins point to it) but its code no longer checks anyone in. */
  active: boolean;
}

export const TALK_TITLE_MIN = 2;
export const TALK_TITLE_MAX = 80;
export const TALK_SPEAKER_MAX = 80;
/** At most this many speakers per talk (a panel). */
export const TALK_SPEAKERS_MAX = 6;
export const TALK_DESCRIPTION_MAX = 500;
/** No talk lasts longer than this: a longer span is a typo in the date. */
export const TALK_MAX_HOURS = 12;

/** What the admin edits. Times are the venue's wall clock as the form gives them (`YYYY-MM-DDTHH:mm`). */
export interface TalkDraft {
  title: string;
  /** Ids of the edition's speakers, in order; at least one. */
  speakerIds: readonly string[];
  startsAt: string;
  endsAt: string;
  roomId: string | null;
  description: string;
}

export type TalkDataErrorCode = "invalid-id" | "invalid-title" | "invalid-speaker" | "invalid-schedule" | "invalid-description";

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * A wall-clock time at the venue (`YYYY-MM-DDTHH:mm`, as a datetime-local field gives it) as an instant, with the
 * venue's fixed offset (`-05:00` for Peru). `null` for anything else, including impossible dates (31 February).
 */
export function parseLocalDateTime(value: string, utcOffset: string): Date | null {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return null;
  const date = new Date(`${value}:00${utcOffset}`);
  if (Number.isNaN(date.getTime())) return null;
  // Round-trip: a date that rolled over (2026-02-31 became 3 March) is not what was typed.
  return toLocalDateTime(date, utcOffset) === value ? date : null;
}

/** An instant as the venue's wall clock (`YYYY-MM-DDTHH:mm`), for a datetime-local field. */
export function toLocalDateTime(date: Date, utcOffset: string): string {
  const sign = utcOffset.startsWith("-") ? -1 : 1;
  const [hours, minutes] = utcOffset.slice(1).split(":").map(Number);
  const shifted = new Date(date.getTime() + sign * (hours * 60 + minutes) * 60_000);
  return shifted.toISOString().slice(0, 16);
}

const collapse = (value: string) => value.trim().replace(/\s+/g, " ");

const SPEAKER_ID = /^[a-z0-9][a-z0-9-]{1,47}$/;

/** Checks and normalizes a draft into a talk (active, no legacy speaker text), with the venue's offset for its times. */
export function checkTalk(id: string, draft: TalkDraft, utcOffset: string): Result<Omit<Talk, "active" | "speaker">, TalkDataErrorCode> {
  if (!isCheckpointId(id)) return err("invalid-id");

  const title = collapse(draft.title);
  if (title.length < TALK_TITLE_MIN || title.length > TALK_TITLE_MAX) return err("invalid-title");

  const speakerIds = [...new Set(draft.speakerIds)];
  if (speakerIds.length === 0 || speakerIds.length > TALK_SPEAKERS_MAX || !speakerIds.every((value) => SPEAKER_ID.test(value))) return err("invalid-speaker");

  const startsAt = parseLocalDateTime(draft.startsAt, utcOffset);
  const endsAt = parseLocalDateTime(draft.endsAt, utcOffset);
  if (!startsAt || !endsAt) return err("invalid-schedule");
  const minutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;
  if (minutes <= 0 || minutes > TALK_MAX_HOURS * 60) return err("invalid-schedule");

  const description = draft.description.trim();
  if (description.length > TALK_DESCRIPTION_MAX) return err("invalid-description");

  return ok({ id, title, speakerIds, startsAt, endsAt, roomId: draft.roomId === "" ? null : draft.roomId, description });
}

/** The agenda's order: by start time (talks without one last), then by title. */
export function compareTalks(a: Talk, b: Talk): number {
  const at = a.startsAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const bt = b.startsAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return at - bt || a.title.localeCompare(b.title, "es");
}

/** A suggestion for the id from the title ("Keynote: IA en 2026" becomes "keynote-ia-en-2026"); editable before saving. */
export function suggestTalkId(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}
