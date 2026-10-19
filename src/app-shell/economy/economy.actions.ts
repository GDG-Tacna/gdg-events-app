"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { economyDeps } from "@/app-shell/composition/economy.server";
import { getSession } from "@/app-shell/guards";
import type { SaveEconomyActionResult } from "@/features/economy";
import { saveEconomySettings } from "@/features/economy/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { mayEdit } from "@/app-shell/permissions.server";

/** Shape only; ranges are checked again by the use case. */
const settingsSchema = z.object({
  creditsEnabled: z.boolean(),
  missionCredits: z.object({ talk: z.number(), stand: z.number(), quiz: z.number(), keyword: z.number(), speaker: z.number() }),
  talkCredits: z.number(),
  squadCreditsEnabled: z.boolean(),
  squadRatio: z.number(),
  contactXp: z.number(),
  contactCredits: z.number(),
  contactCap: z.number(),
});

/**
 * Server Action behind the Economía screen. A public endpoint: the flag, the session and the input shape are
 * checked here, and the use case checks the admin role again.
 */
export async function saveEconomyAction(input: z.infer<typeof settingsSchema>): Promise<SaveEconomyActionResult> {
  if (!FEATURES.admin) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "economy"))) return { ok: false, code: "forbidden" };

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-settings" };
  const saved = await saveEconomySettings(economyDeps, { uid: session.uid, role: session.role }, parsed.data);
  if (!saved.ok) return { ok: false, code: saved.error.code };

  // Credits show on the dashboard and the missions board: drop any cached render of them.
  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.missions);
  return { ok: true };
}
