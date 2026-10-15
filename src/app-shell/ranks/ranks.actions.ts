"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rankDeps } from "@/app-shell/composition/ranks.server";
import { getSession } from "@/app-shell/guards";
import type { SaveRanksActionResult } from "@/features/attendee";
import { saveRanks } from "@/features/attendee/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { mayEdit } from "@/app-shell/permissions.server";

/** Shape and size only; the ladder rules are checked again by the use case. */
const ranksSchema = z.array(z.object({ id: z.string().max(60), name: z.string().max(80), minXp: z.number(), iconPath: z.string().max(300).nullable().optional() })).max(20);

/**
 * Server Action behind the Rangos screen. A public endpoint: the flag, the session and the input shape are
 * checked here, the actor comes from the verified session, and the use case checks the admin role again.
 */
export async function saveRanksAction(ranks: Array<{ id: string; name: string; minXp: number; iconPath?: string | null }>): Promise<SaveRanksActionResult> {
  if (!FEATURES.admin) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "ranks"))) return { ok: false, code: "forbidden" };

  const parsed = ranksSchema.safeParse(ranks);
  if (!parsed.success) return { ok: false, code: "invalid-ranks" };
  const result = await saveRanks(rankDeps, { uid: session.uid, role: session.role }, parsed.data);
  if (!result.ok) return { ok: false, code: result.error.code };

  // Every attendee's rank changes with the ladder: drop any cached render of the dashboard.
  revalidatePath(ROUTES.dashboard);
  return { ok: true };
}
