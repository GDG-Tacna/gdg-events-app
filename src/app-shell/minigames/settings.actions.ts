"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { minigameAdminDeps } from "@/app-shell/composition/minigames.server";
import { getSession } from "@/app-shell/guards";
import type { SaveMinigameSettingsActionResult } from "@/features/minigames";
import { saveMinigameSettings } from "@/features/minigames/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { moduleOn } from "@/app-shell/modules.server";
import { mayEdit } from "@/app-shell/permissions.server";

/** Shape only; the known games, difficulties and languages are checked again by the use case. */
const settingsSchema = z.object({
  games: z.record(z.string().max(40), z.object({ enabled: z.boolean(), difficulty: z.string().max(20) })),
  codeLanguages: z.array(z.string().max(20)).max(10).readonly(),
});

/**
 * Server Action behind the Mini-juegos screen. A public endpoint: the flags, the session and the input shape
 * are checked here, and the use case checks the admin role again.
 */
export async function saveMinigameSettingsAction(input: z.infer<typeof settingsSchema>): Promise<SaveMinigameSettingsActionResult> {
  if (!FEATURES.admin || !(await moduleOn("minigames"))) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "minigames"))) return { ok: false, code: "forbidden" };

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-settings" };
  const saved = await saveMinigameSettings(minigameAdminDeps, { uid: session.uid, role: session.role }, parsed.data);
  if (!saved.ok) return { ok: false, code: saved.error.code };

  // A mission page offers its game only while the edition does: drop any cached render of them.
  revalidatePath(ROUTES.missions, "layout");
  return { ok: true };
}
