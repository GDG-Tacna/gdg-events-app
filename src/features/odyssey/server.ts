import "server-only";

// Public API (server-only). Client code must import from "@/features/odyssey" instead.
export { checkCommunication, parseCommunication, type Communication } from "./domain/communication";
export { STORY_TITLE_MAX, getStoryTitle, type StoryTitleSource, type StoryTitleStore } from "./domain/story";
export { getOdyssey, type CommunicationSource, type MissionProgress, type OdysseyDeps, type OdysseyLog, type Transmission } from "./domain/odyssey";
export {
  createCommunication,
  listManagedCommunications,
  moveCommunication,
  saveStoryTitle,
  seedCommunications,
  setCommunicationActive,
  updateCommunication,
  type CommunicationDraft,
  type CommunicationStore,
  type OdysseyAdminActor,
  type OdysseyAdminDeps,
  type OdysseyAdminErrorCode,
  type OdysseyDirectory,
  type StoryAdminDeps,
} from "./domain/manage";
export { DEFAULT_COMMUNICATIONS } from "./data/default-communications";
export { CachedCommunicationSource, CachedStoryTitle, FirestoreCommunicationStore } from "./data/server/firestore-communication-store";
