// Public API (client-safe). Server-only exports live in `./server`.
export { SPEAKER_NAME_MAX, compareSpeakers, isSpeakerId, suggestSpeakerId, type Speaker, type SpeakerDraft, type SpeakerLinks } from "./domain/speaker";
export type { SpeakerAdminErrorCode } from "./domain/manage";
export type {
  AcceptSpeakerInviteAction,
  InviteSpeakerAction,
  SaveSpeakerAction,
  SetSpeakerActiveAction,
  SpeakerAccessActionResult,
  SpeakerAccessView,
  SpeakerActionResult,
  UnlinkSpeakerAction,
} from "./ui/actions";
export { SpeakerInvitePanel, type SpeakerInvitePanelProps } from "./ui/SpeakerInvitePanel";
export { SpeakerAvatar, SpeakersAdminView, type SpeakersAdminViewProps } from "./ui/SpeakersAdminView";
export { SPEAKER_CODE_LIFETIME_SECONDS, isSpeakerCode, type SpeakerCodeErrorCode } from "./domain/speaker-code";
export type { SpeakerAccessErrorCode, SpeakerAccessState, SpeakerInviteState } from "./domain/access";
