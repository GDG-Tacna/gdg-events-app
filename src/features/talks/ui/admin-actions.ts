import type { TalkAdminErrorCode } from "../domain/manage";
import type { TalkDraft } from "../domain/talk";

export type TalkAdminActionResult = { ok: true } | { ok: false; code: TalkAdminErrorCode };
export type SaveTalkAction = (input: { id: string; draft: TalkDraft }) => Promise<TalkAdminActionResult>;
/** Puts a talk's QR on the stage screen: on failure, the sentence to show the admin. */
export type ProjectTalkResult = { ok: true } | { ok: false; text: string };
export type ProjectTalkAction = (input: { id: string }) => Promise<ProjectTalkResult>;
/** Deleting answers with the title of what was deleted, for the message. */
export type DeleteTalkActionResult = { ok: true; title: string } | { ok: false; code: TalkAdminErrorCode };
export type DeleteTalkAction = (input: { id: string }) => Promise<DeleteTalkActionResult>;
export type SetTalkActiveAction = (input: { id: string; active: boolean }) => Promise<TalkAdminActionResult>;

/** A talk as it crosses to the admin screens: plain data, times as the venue's wall clock (`YYYY-MM-DDTHH:mm`). */
export interface TalkView {
  id: string;
  title: string;
  /** The talk's speakers, in order. */
  speakerIds: readonly string[];
  /** What to show as its speaker: the chosen speakers' names, or the name typed before the catalog existed. */
  speaker: string | null;
  /** The name typed before the catalog existed, while no speaker is chosen yet (a hint in the form). */
  legacySpeaker: string | null;
  startsAt: string | null;
  endsAt: string | null;
  roomId: string | null;
  description: string;
  active: boolean;
}
