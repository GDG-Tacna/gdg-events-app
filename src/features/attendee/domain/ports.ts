import type { Result } from "@/shared/lib/result";
import type { Alias } from "./alias";
import type { Attendee } from "./attendee";
import type { AttendeeError } from "./attendee-error";

export type RegisterOutcome = { kind: "created" } | { kind: "already-registered"; attendee: Attendee };

export interface AttendeeRepository {
  findByUid(uid: string): Promise<Result<Attendee | null, AttendeeError>>;
  /**
   * Atomically reserves the alias and creates the attendee. Safe to retry: when the uid is already
   * registered it resolves `already-registered` with the stored attendee instead of failing.
   * Fails with `alias-taken` when another attendee owns the alias.
   */
  register(attendee: Attendee, alias: Alias): Promise<Result<RegisterOutcome, AttendeeError>>;
}

/** Grants the attendee role in the identity provider (a custom claim). Idempotent; never downgrades staff or admin. */
export interface RoleGranter {
  grantAttendeeRole(uid: string): Promise<Result<void, AttendeeError>>;
}
