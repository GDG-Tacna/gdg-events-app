import "server-only";

// Public API (server-only). Client code must import from "@/features/talks" instead.
export { checkTalk, compareTalks, parseLocalDateTime, toLocalDateTime, type Talk, type TalkDraft } from "./domain/talk";
export {
  createTalk,
  listManagedTalks,
  setTalkActive,
  updateTalk,
  type TalkAdminActor,
  type TalkAdminDeps,
  type TalkAdminErrorCode,
  type TalkDirectory,
  type TalkStore,
} from "./domain/manage";
export { FirestoreTalkStore, toTalk } from "./data/server/firestore-talk-store";
export { getAgenda, type AgendaDeps, type AgendaItem, type AgendaStatus } from "./domain/agenda";
