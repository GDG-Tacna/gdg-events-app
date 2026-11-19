// Public API (client-safe). Server-only exports live in `./server`.
export {
  DEFAULT_TICKET,
  TICKET_PERKS,
  TICKET_SOURCES,
  TICKET_TYPES,
  includesCertificate,
  includesLunch,
  isTicketSource,
  isTicketType,
  parseTicketType,
  ticketRank,
  ticketTypeOf,
  type TicketSource,
  type TicketType,
} from "./domain/ticket";
export { HOLDERS_MAX_ROWS, parseHolderRows, type DuplicateHolder, type ImportSummary, type InvalidHolderRow, type ParsedHolders } from "./domain/holders";
export { ChangeTicketScreen, type ChangeTicketScreenProps } from "./ui/ChangeTicketScreen";
export { ImportTicketsView, type ImportTicketsViewProps } from "./ui/ImportTicketsView";
export { TicketBadge, TicketChip, ticketIncludes, ticketName } from "./ui/TicketChip";
export type { TicketHolder } from "./domain/ports";
export type { ChangeCadetTicketAction, ImportTicketHoldersAction, ImportTicketsActionResult, LookupTicketAction, LookupTicketActionResult, TicketActionResult } from "./ui/actions";
export type { TicketsError, TicketsErrorCode } from "./domain/error";
