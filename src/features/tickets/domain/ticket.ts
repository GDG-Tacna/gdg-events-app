/** The tickets DevFest sells. The order is the order of value: each one includes what the one before it has. */
export const TICKET_TYPES = ["general", "pro", "premium"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

/** Where a cadet's ticket came from: the edition's list, the default (not on the list) or a person who set it by hand. */
export const TICKET_SOURCES = ["list", "default", "manual"] as const;
export type TicketSource = (typeof TICKET_SOURCES)[number];

export const DEFAULT_TICKET: TicketType = "general";

export const isTicketType = (value: unknown): value is TicketType => typeof value === "string" && (TICKET_TYPES as readonly string[]).includes(value);
export const isTicketSource = (value: unknown): value is TicketSource => typeof value === "string" && (TICKET_SOURCES as readonly string[]).includes(value);

/** A stored value as a ticket: anything that is not one (a document from before tickets existed) is `general`. */
export const ticketTypeOf = (value: unknown): TicketType => (isTicketType(value) ? value : DEFAULT_TICKET);

/** Position in the order of value (general 0, pro 1, premium 2), for "this ticket or better". */
export const ticketRank = (type: TicketType): number => TICKET_TYPES.indexOf(type);

/** What each ticket includes. Only the data: the certificates module (not built yet) reads `certificate`. */
export const TICKET_PERKS: Readonly<Record<TicketType, { certificate: boolean; lunch: boolean }>> = {
  general: { certificate: false, lunch: false },
  pro: { certificate: true, lunch: false },
  premium: { certificate: true, lunch: true },
};

/** Whether the ticket entitles its holder to the attendance certificate: the flag the certificates module will read. */
export const includesCertificate = (type: TicketType): boolean => TICKET_PERKS[type].certificate;
export const includesLunch = (type: TicketType): boolean => TICKET_PERKS[type].lunch;

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/**
 * Reads a ticket from the text of a list: any casing, with or without accents ("Premium", "PRO"). An empty cell is
 * `general`; anything else is not a ticket (`null`), so a typo is reported instead of silently becoming `general`.
 */
export function parseTicketType(text: string): TicketType | null {
  const folded = fold(text);
  if (folded === "") return DEFAULT_TICKET;
  return isTicketType(folded) ? folded : null;
}
