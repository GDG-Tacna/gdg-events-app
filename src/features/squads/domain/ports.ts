import type { Result } from "@/shared/lib/result";
import type { SquadId } from "@/shared/types/squad";
import type { Squad } from "./squad";
import type { SquadError } from "./squad-error";

export type AssignOutcome =
  | { kind: "assigned"; squad: SquadId }
  | { kind: "already-assigned"; squad: SquadId };

export interface SquadRepository {
  /**
   * Atomically gives the attendee `squad` only if they have none. When a squad is already set it is
   * kept and returned as `already-assigned`, so calling this twice never changes the assignment.
   * Fails with `not-registered` when the attendee has no profile yet.
   */
  assignIfUnassigned(uid: string, squad: SquadId): Promise<Result<AssignOutcome, SquadError>>;
}

/**
 * The squads an attendee can be given and see. Asynchronous on purpose: the first adapter is a static
 * list, the phase 2 adapter reads the squads an admin maintains in the database.
 */
export interface SquadCatalog {
  /** Every squad of the edition, active and retired, in display order. Callers offer only the active ones. */
  list(): Promise<Result<readonly Squad[], SquadError>>;
}

/** Chooses one of the given squads for a new assignment. Injected so tests control the outcome. */
export type SquadPicker = (squadIds: readonly SquadId[]) => SquadId;
