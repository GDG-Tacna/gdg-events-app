import type { Role } from "@/features/auth";
import type { SquadId } from "@/shared/types/squad";
import type { Alias } from "./alias";

export interface Attendee {
  uid: string;
  alias: string;
  role: Role;
  squad: SquadId | null;
  xp: number;
  credits: number;
  createdAt: Date;
}

/**
 * A new attendee always starts with safe defaults. XP, credits and squad are never
 * taken from the request: only server-side use cases of later phases change them.
 */
export function createNewAttendee(input: { uid: string; alias: Alias; now: Date }): Attendee {
  return {
    uid: input.uid,
    alias: input.alias.display,
    role: "attendee",
    squad: null,
    xp: 0,
    credits: 0,
    createdAt: input.now,
  };
}
