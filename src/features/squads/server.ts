import "server-only";

// Public API (server-only). Client code must import from "@/features/squads" instead.
export type { SquadCatalog, SquadPicker, SquadRepository } from "./domain/ports";
export type { Squad } from "./domain/squad";
export { createRandomPicker } from "./domain/picker";
export { assignSquad, listSquads, type AssignSquadDeps } from "./domain/use-cases";
export {
  createSquad,
  listManagedSquads,
  moveSquad,
  reactivateSquad,
  retireSquad,
  seedSquads,
  updateSquad,
  type EventClock,
  type ManagedSquad,
  type SquadAdminActor,
  type SquadAdminDeps,
  type SquadAudit,
  type SquadStore,
} from "./domain/manage";
export { STATIC_SQUADS, StaticSquadCatalog } from "./data/static-squad-catalog";
export { CachedSquadCatalog } from "./data/server/cached-squad-catalog";
export { FirestoreSquadRepository } from "./data/server/firestore-squad-repository";
export { FirestoreSquadStore } from "./data/server/firestore-squad-store";
