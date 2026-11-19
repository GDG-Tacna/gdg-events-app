import type { Role } from "@/features/auth";
import type { TicketSource, TicketType } from "@/features/tickets";
import type { SquadId } from "@/shared/types/squad";
import type { Alias } from "./alias";

/** Which ticket the cadet has and where it came from. The tickets feature owns the fields; registration writes them once. */
export interface AttendeeTicket {
  type: TicketType;
  source: TicketSource;
}

export const DEFAULT_ATTENDEE_TICKET: AttendeeTicket = { type: "general", source: "default" };

export interface Attendee {
  uid: string;
  alias: string;
  role: Role;
  squad: SquadId | null;
  xp: number;
  credits: number;
  ticket: AttendeeTicket;
  createdAt: Date;
}

/**
 * A new attendee always starts with safe defaults. XP, credits and squad are never
 * taken from the request: only server-side use cases of later phases change them.
 */
export function createNewAttendee(input: { uid: string; alias: Alias; now: Date; ticket?: AttendeeTicket }): Attendee {
  return {
    uid: input.uid,
    alias: input.alias.display,
    role: "attendee",
    squad: null,
    xp: 0,
    credits: 0,
    // Resolved by the server from the edition's list of ticket holders; general when it was not given.
    ticket: input.ticket ?? DEFAULT_ATTENDEE_TICKET,
    createdAt: input.now,
  };
}
