import type { TalkAdminErrorCode } from "../domain/manage";
import type { TalkDraft } from "../domain/talk";

export type TalkAdminActionResult = { ok: true } | { ok: false; code: TalkAdminErrorCode };
export type SaveTalkAction = (input: { id: string; draft: TalkDraft }) => Promise<TalkAdminActionResult>;
export type SetTalkActiveAction = (input: { id: string; active: boolean }) => Promise<TalkAdminActionResult>;

/** A talk as it crosses to the admin screens: plain data, times as the venue's wall clock (`YYYY-MM-DDTHH:mm`). */
export interface TalkView {
  id: string;
  title: string;
  speaker: string | null;
  startsAt: string | null;
  endsAt: string | null;
  roomId: string | null;
  description: string;
  active: boolean;
}
