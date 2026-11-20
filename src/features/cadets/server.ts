import "server-only";

// Public API (server-only). Client code must import from "@/features/cadets" instead.
export {
  BAN_REASON_MAX,
  CADETS_PAGE_SIZE,
  CADETS_SEARCH_MAX,
  CADETS_SEARCH_MIN,
  TICKET_SEARCH_LIMIT,
  TICKET_SEARCH_MIN,
  banCadet,
  changeCadetSquad,
  deleteCadet,
  findCadetsForTicket,
  getCadet,
  listCadets,
  maskEmail,
  renameCadet,
  unbanCadet,
  type AccountDirectory,
  type CadetAccount,
  type CadetActivity,
  type CadetAuditEntry,
  type CadetIdentity,
  type CadetListItem,
  type CadetListPage,
  type CadetPage,
  type CadetRecord,
  type CadetRemoval,
  type CadetStore,
  type CadetSummary,
  type CadetsActor,
  type CadetsDeps,
  type CadetsError,
  type CadetsErrorCode,
  type IndexedCadet,
  type TicketSearchHit,
} from "./domain/manage";
export { FirebaseAccountDirectory } from "./data/server/firebase-account-directory";
export { CachedAccountDirectory, type CachedAccountDirectoryOptions } from "./data/server/cached-account-directory";
export { CachedCadetStore, type CachedCadetStoreOptions } from "./data/server/cached-cadet-store";
export { FirestoreCadetStore, toCadet } from "./data/server/firestore-cadet-store";
