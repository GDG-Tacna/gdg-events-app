import "server-only";

// Public API (server-only). Client code must import from "@/features/speakers" instead.
export { checkSpeaker, compareSpeakers, isSpeakerId, type Speaker, type SpeakerDraft } from "./domain/speaker";
export {
  createSpeaker,
  listManagedSpeakers,
  setSpeakerActive,
  updateSpeaker,
  type SpeakerAdminActor,
  type SpeakerAdminDeps,
  type SpeakerAdminErrorCode,
  type SpeakerStore,
} from "./domain/manage";
export {
  issueSpeakerCode,
  verifySpeakerCode,
  type IssuedSpeakerCode,
  type SpeakerCodeDeps,
  type SpeakerCodeErrorCode,
  type SpeakerLookup,
} from "./domain/speaker-code";
export {
  acceptSpeakerInvite,
  inviteSpeaker,
  listSpeakerAccess,
  previewSpeakerInvite,
  speakerOfAccount,
  splitSpeakerToken,
  unlinkSpeaker,
  type SpeakerAccessDeps,
  type SpeakerAccessErrorCode,
  type SpeakerAccessState,
  type SpeakerAccessStore,
} from "./domain/access";
export { FirestoreSpeakerAccessStore } from "./data/server/firestore-speaker-access-store";
export { FirestoreSpeakerStore, toSpeaker } from "./data/server/firestore-speaker-store";
