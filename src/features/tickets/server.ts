import "server-only";

// Public API (server-only). Client code must import from "@/features/tickets" instead.
export type {
  ParticipantTicket,
  ParticipantTicketStore,
  TicketAccounts,
  TicketAudit,
  TicketAuditEntry,
  TicketHolder,
  TicketHolderStore,
} from "./domain/ports";
export { changeCadetTicket, resolveTicketFor, type ChangeTicketDeps, type ResolvedTicket } from "./domain/assign";
export {
  HOLDERS_MAX_ROWS,
  importTicketHolders,
  summarizeTicketHolders,
  type ImportHoldersDeps,
  type ImportSummary,
  type TicketsActor,
} from "./domain/holders";
export { FirestoreTicketHolderStore } from "./data/server/firestore-ticket-holder-store";
export { FirestoreParticipantTicketStore, readTicket } from "./data/server/firestore-participant-ticket-store";
