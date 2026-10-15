import "server-only";

// Public API (server-only). Client code must import from "@/features/attendee" instead.
export type { Attendee } from "./domain/attendee";
export type { AttendeeRepository, RoleGranter } from "./domain/ports";
export type { AttendeeError } from "./domain/attendee-error";
export { getAttendee, registerAttendee, type RegisterAttendeeDeps } from "./domain/use-cases";
export { FirestoreAttendeeRepository } from "./data/server/firestore-attendee-repository";
export { FirebaseRoleGranter } from "./data/server/firebase-role-granter";
export {
  getEditionLadder,
  getRanksForEdit,
  saveRanks,
  type RankAdminActor,
  type RankAdminDeps,
  type RankAdminErrorCode,
  type RankAudit,
  type RankDeps,
  type RankStore,
  type RanksForEdit,
} from "./domain/rank-admin";
export { CachedRankStore, FirestoreRankStore } from "./data/server/firestore-rank-store";
