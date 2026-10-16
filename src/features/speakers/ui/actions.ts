import type { SpeakerAccessErrorCode } from "../domain/access";
import type { SpeakerAdminErrorCode } from "../domain/manage";
import type { SpeakerDraft } from "../domain/speaker";

export type SpeakerActionResult = { ok: true } | { ok: false; code: SpeakerAdminErrorCode };
/** `photoPath` undefined keeps the photo, null removes it, a path sets an uploaded one. */
export type SaveSpeakerAction = (input: { id: string; draft: SpeakerDraft; photoPath?: string | null }) => Promise<SpeakerActionResult>;
export type SetSpeakerActiveAction = (input: { id: string; active: boolean }) => Promise<SpeakerActionResult>;

/** A speaker's access as the admin's card shows it (plain data: it crosses the client boundary). */
export type SpeakerAccessView =
  | { state: "none" }
  | { state: "invited"; email: string; expiresAt: Date; expired: boolean }
  | { state: "linked"; email: string | null };

export type SpeakerAccessActionResult = { ok: true } | { ok: false; code: SpeakerAccessErrorCode };
export type InviteSpeakerAction = (input: { speakerId: string; email: string }) => Promise<{ ok: true; path: string } | { ok: false; code: SpeakerAccessErrorCode }>;
export type UnlinkSpeakerAction = (input: { speakerId: string }) => Promise<SpeakerAccessActionResult>;
export type AcceptSpeakerInviteAction = (input: { token: string }) => Promise<SpeakerAccessActionResult>;
