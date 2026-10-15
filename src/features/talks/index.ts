// Public API (client-safe). Server-only exports live in `./server`.
export type { Talk, TalkDraft } from "./domain/talk";
export { TALK_DESCRIPTION_MAX, TALK_SPEAKER_MAX, TALK_TITLE_MAX, compareTalks, suggestTalkId } from "./domain/talk";
export type { TalkAdminErrorCode } from "./domain/manage";
export type { SaveTalkAction, SetTalkActiveAction, TalkAdminActionResult, TalkView } from "./ui/admin-actions";
export { TalkForm, type TalkFormProps } from "./ui/TalkForm";
export { TalksAdminView, formatSlot, type TalksAdminViewProps } from "./ui/TalksAdminView";
export type { AgendaItem, AgendaStatus } from "./domain/agenda";
export { AgendaView, agendaTime, groupByDay, type AgendaViewProps } from "./ui/AgendaView";
