import type { Attendee, AttendeeError, RankLadder } from "@/features/attendee";
import { err, ok, type Result } from "@/shared/lib/result";
import { buildOverview, type DashboardOverview, type WalletView } from "./overview";

export interface DashboardError {
  code: "unknown";
}

/** The slice of the attendee repository the dashboard reads: a structural port, so no attendee internals are imported. */
export interface AttendeeSource {
  findByUid(uid: string): Promise<Result<Attendee | null, AttendeeError>>;
}

/**
 * The card of a signed-in attendee. Resolves null when the user has no attendee profile (the page decides
 * where that user goes), and a failed read is reported instead of drawing a card with made-up numbers.
 */
export async function getAttendeeOverview(
  deps: { attendees: AttendeeSource; ranks?: () => Promise<RankLadder>; wallet?: (uid: string) => Promise<WalletView> },
  uid: string,
): Promise<Result<DashboardOverview | null, DashboardError>> {
  const [found, ladder, wallet] = await Promise.all([deps.attendees.findByUid(uid), deps.ranks?.(), deps.wallet?.(uid)]);
  if (!found.ok) return err({ code: "unknown" });
  // The edition's ladder (which never fails: it falls back to the bundled one); the bundled one without it.
  return ok(found.value === null ? null : buildOverview(found.value, ladder, wallet));
}
