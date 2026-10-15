import type { Analytics } from "@/shared/lib/analytics/analytics";
import { err, ok, type Result } from "@/shared/lib/result";
import { createAlias } from "./alias";
import { createNewAttendee, type Attendee } from "./attendee";
import { attendeeError, type AttendeeError } from "./attendee-error";
import type { AttendeeRepository, RoleGranter } from "./ports";

export interface RegisterAttendeeDeps {
  attendees: AttendeeRepository;
  roles: RoleGranter;
  analytics: Analytics;
  now: () => Date;
}

export interface RegisterAttendeeResult {
  attendee: Attendee;
  /** False when the uid was already registered (a retry): nothing new was created. */
  created: boolean;
}

/**
 * Creates the attendee profile for a signed-in user and grants the role.
 * Safe to retry: a second call for the same uid keeps the stored alias and only re-applies the
 * (idempotent) role grant, which repairs a registration that stopped before the grant.
 */
export async function registerAttendee(
  deps: RegisterAttendeeDeps,
  input: { uid: string; rawAlias: string },
): Promise<Result<RegisterAttendeeResult, AttendeeError>> {
  const alias = createAlias(input.rawAlias);
  if (!alias.ok) return err(attendeeError("alias-invalid", alias.error));

  const attendee = createNewAttendee({ uid: input.uid, alias: alias.value, now: deps.now() });
  const registered = await deps.attendees.register(attendee, alias.value);
  if (!registered.ok) return registered;

  // Count the registration as soon as the profile exists, so a failed grant that is retried is not lost.
  const created = registered.value.kind === "created";
  if (created) deps.analytics.track({ name: "attendee_registered", uid: input.uid });

  const granted = await deps.roles.grantAttendeeRole(input.uid);
  if (!granted.ok) return granted;

  return ok({ attendee: registered.value.kind === "created" ? attendee : registered.value.attendee, created });
}

/** The attendee profile of a user, or null when onboarding is still pending. */
export async function getAttendee(
  deps: { attendees: AttendeeRepository },
  uid: string,
): Promise<Result<Attendee | null, AttendeeError>> {
  return deps.attendees.findByUid(uid);
}
