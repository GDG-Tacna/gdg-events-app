"use server";

import { passDeps } from "@/app-shell/composition/pass.server";
import { getSession } from "@/app-shell/guards";
import type { IssuePassActionResult } from "@/features/pass";
import { issuePass } from "@/features/pass/server";
import { FEATURES } from "@/shared/config/features";

/**
 * Server Action behind the attendee's pass screen. It is a public endpoint: the flag and the session are
 * checked here, and the uid comes from the verified session, so nobody can ask for another person's pass.
 * It returns the picture and timing, never the signed text.
 */
export async function issuePassAction(): Promise<IssuePassActionResult> {
  if (!FEATURES.checkins) return { ok: false, code: "disabled" };

  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };

  const result = issuePass(passDeps, { uid: session.uid, role: session.role });
  return result.ok ? { ok: true, pass: result.value } : { ok: false, code: result.error.code };
}
