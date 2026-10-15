"use server";

import { getSession } from "@/app-shell/guards";
import { squadDeps } from "@/app-shell/composition/squads.server";
import type { AssignSquadActionResult } from "@/features/squads";
import { assignSquad } from "@/features/squads/server";
import { moduleOn } from "@/app-shell/modules.server";

/**
 * Server Action behind the "discover my squad" button. It is a public endpoint: the flag and the
 * session are checked here, and nothing comes from the client, so an attendee cannot choose a squad.
 * Idempotent: an attendee who already has a squad gets the same one back.
 */
export async function assignSquadAction(): Promise<AssignSquadActionResult> {
  if (!(await moduleOn("squads"))) return { ok: false, code: "disabled" };

  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  // Squads are for attendees; a user without a profile has not finished onboarding.
  if (session.role !== "attendee") return { ok: false, code: session.role === null ? "not-registered" : "forbidden" };

  const result = await assignSquad(squadDeps, session.uid);
  if (!result.ok) return { ok: false, code: result.error.code };
  return { ok: true, squad: result.value.squad, assigned: result.value.assigned };
}
