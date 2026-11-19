"use server";

import { z } from "zod";
import { rundownDeps } from "@/app-shell/composition/rundown.server";
import { getSession } from "@/app-shell/guards";
import { moduleOn } from "@/app-shell/modules.server";
import { mayEdit } from "@/app-shell/permissions.server";
import type { SaveCuesResult } from "@/features/rundown";
import { saveItemCues } from "@/features/rundown/server";
import { FEATURES } from "@/shared/config/features";

/** Shape only; the use case checks every piece again (the path above all). */
const inputSchema = z.object({
  itemId: z.string().max(60),
  cues: z.array(z.object({ id: z.string().max(60), kind: z.string().max(10), name: z.string().max(120), path: z.string().max(300) })).max(60),
});

/**
 * Server Action behind the console's «Añadir archivo», «Quitar» and the order of a point's pieces. A public endpoint: the
 * flags, the session and the input shape are checked here, and the use case checks the admin role and every piece again.
 * Only paths and names are saved: the files stay on the operator's computer.
 */
export async function saveCuesAction(input: { itemId: string; cues: unknown }): Promise<SaveCuesResult> {
  if (!FEATURES.admin || !(await moduleOn("leaderboard"))) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "stage"))) return { ok: false, code: "forbidden" };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-cues" };
  const saved = await saveItemCues(rundownDeps, { uid: session.uid, role: session.role }, parsed.data);
  return saved.ok ? { ok: true, cues: saved.value } : { ok: false, code: saved.error.code };
}
