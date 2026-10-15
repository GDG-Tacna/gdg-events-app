import "server-only";
import {
  FirebaseRoleGranter,
  FirestoreAttendeeRepository,
  type RegisterAttendeeDeps,
} from "@/features/attendee/server";
import { ConsoleAnalytics } from "@/shared/lib/analytics/console-analytics";

/** Composition root for the attendee feature: the only place that binds Firebase adapters to its use cases. */
export const attendeeDeps: RegisterAttendeeDeps = {
  attendees: new FirestoreAttendeeRepository(),
  roles: new FirebaseRoleGranter(),
  analytics: new ConsoleAnalytics(),
  now: () => new Date(),
};
