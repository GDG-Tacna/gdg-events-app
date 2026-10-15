"use server";

import { z } from "zod";
import { missionSuggestDeps } from "@/app-shell/composition/mission-suggest.server";
import { getSession } from "@/app-shell/guards";
import type { SuggestMissionsActionResult } from "@/features/missions";
import { suggestMissions } from "@/features/missions/server";
import { FEATURES } from "@/shared/config/features";
import { moduleOn } from "@/app-shell/modules.server";
import { mayEdit } from "@/app-shell/permissions.server";

const inputSchema = z.object({
  topic: z.string().max(3000),
  quadrantId: z.string().max(60),
  types: z.array(z.string().max(20)).max(4),
  count: z.number().int(),
});

/**
 * Server Action behind "Sugerir con IA". A public endpoint: the flags, the session and the input shape are
 * checked here, and the use case checks the admin role again and limits how often each admin asks. It only
 * returns drafts: nothing is saved until the admin reviews one and saves it as a mission.
 */
export async function suggestMissionsAction(input: { topic: string; quadrantId: string; types: string[]; count: number }): Promise<SuggestMissionsActionResult> {
  if (!FEATURES.admin || !(await moduleOn("missions")) || !FEATURES.missionSuggestions) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "missions"))) return { ok: false, code: "forbidden" };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-topic" };

  const result = await suggestMissions(missionSuggestDeps, { uid: session.uid, role: session.role }, parsed.data);
  return result.ok ? { ok: true, suggestions: [...result.value] } : { ok: false, code: result.error.code };
}
