"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { stageDeps } from "@/app-shell/composition/leaderboard.server";
import { getSession } from "@/app-shell/guards";
import type { UpdateStageActionResult } from "@/features/leaderboard";
import { updateStage } from "@/features/leaderboard/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { moduleOn } from "@/app-shell/modules.server";
import { mayEdit } from "@/app-shell/permissions.server";

/** Shape only; the use case reads the command again. */
const commandSchema = z.object({ type: z.string().max(20), display: z.string().max(20).optional(), view: z.string().max(20).optional() });

/**
 * Server Action behind the "Escenario" screen. A public endpoint: the flags, the session and the input shape are
 * checked here, and the use case checks the admin role again.
 */
export async function updateStageAction(command: z.infer<typeof commandSchema>): Promise<UpdateStageActionResult> {
  if (!FEATURES.admin || !(await moduleOn("leaderboard"))) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "stage"))) return { ok: false, code: "forbidden" };

  const parsed = commandSchema.safeParse(command);
  if (!parsed.success) return { ok: false, code: "invalid-command" };
  const updated = await updateStage(stageDeps, { uid: session.uid, role: session.role }, parsed.data);
  if (!updated.ok) return { ok: false, code: updated.error.code };
  revalidatePath(ROUTES.adminStage);
  return { ok: true };
}
