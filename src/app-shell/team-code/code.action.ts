"use server";

import { getSession } from "@/app-shell/guards";
import { teamCodeDeps } from "@/app-shell/composition/team-code.server";
import type { IssueQrActionResult } from "@/features/ephemeral-qr";
import { issueTeamCode, type TeamCodeErrorCode } from "@/features/team-code/server";
import { FEATURES } from "@/shared/config/features";

/** The code screen is the talks' one: their error codes, with the team code's own words (`copy.teamCode.qr`). */
const SCREEN_CODE = {
  forbidden: "forbidden",
  unauthenticated: "unauthenticated",
  disabled: "disabled",
  unknown: "unknown",
} as const satisfies Record<TeamCodeErrorCode, string>;

/**
 * Server Action behind «Mi código» for staff and organizers. A public endpoint: the flag and the session are checked
 * here, the uid and role come from the verified session (never from the request), and the use case refuses anyone who
 * is not staff or an admin. It answers the picture and timing, never the signed payload as text.
 */
export async function issueTeamCodeAction(): Promise<IssueQrActionResult> {
  if (!FEATURES.checkins) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };

  const result = issueTeamCode(teamCodeDeps, { uid: session.uid, role: session.role });
  if (!result.ok) return { ok: false, code: SCREEN_CODE[result.error.code] };
  const { role, cells, issuedAt, expiresAt } = result.value;
  return { ok: true, qr: { checkpointId: role, name: role, cells, issuedAt, expiresAt } };
}
