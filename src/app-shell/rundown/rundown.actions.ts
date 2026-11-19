"use server";

import { z } from "zod";
import { rundownDeps } from "@/app-shell/composition/rundown.server";
import { getSession } from "@/app-shell/guards";
import { moduleOn } from "@/app-shell/modules.server";
import { mayEdit } from "@/app-shell/permissions.server";
import type { SaveCuesResult, SaveMinutesAction, SavePointsAction } from "@/features/rundown";
import { saveExtraPoints, saveItemCues, saveItemMinutes } from "@/features/rundown/server";
import { FEATURES } from "@/shared/config/features";

/** Shape only; the use case checks every piece again (the path above all). */
const inputSchema = z.object({
  itemId: z.string().max(60),
  // Every field of every kind is listed, or zod would drop it before the use case sees it.
  cues: z.array(z.object({ id: z.string().max(60), kind: z.string().max(10), name: z.string().max(120), path: z.string().max(300).optional(), deckId: z.string().max(220).optional(), published: z.boolean().optional(), seconds: z.number().optional() })).max(60),
});

const pointsSchema = z.object({ points: z.array(z.object({ id: z.string().max(60), title: z.string().max(200), who: z.string().max(200), time: z.string().max(5) })).max(60) });
const minutesSchema = z.object({ itemId: z.string().max(60), minutes: z.number().nullable() });

/** The admin who may edit the stage, or the reason they may not. The same checks for every action of the console. */
async function consoleActor(): Promise<{ ok: true; actor: { uid: string; role: "admin" } } | { ok: false; code: "disabled" | "unauthenticated" | "forbidden" }> {
  if (!FEATURES.admin || !(await moduleOn("leaderboard"))) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "stage"))) return { ok: false, code: "forbidden" };
  return { ok: true, actor: { uid: session.uid, role: "admin" } };
}

/** Server Action behind the console's «Añadir punto», editing and removing: the points that are only in the console. */
export const savePointsAction: SavePointsAction = async (input) => {
  const who = await consoleActor();
  if (!who.ok) return who;
  const parsed = pointsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-points" };
  const saved = await saveExtraPoints(rundownDeps, who.actor, parsed.data);
  return saved.ok ? { ok: true, points: saved.value } : { ok: false, code: saved.error.code };
};

/** Server Action behind the minutes planned for each point of the agenda. */
export const saveMinutesAction: SaveMinutesAction = async (input) => {
  const who = await consoleActor();
  if (!who.ok) return who;
  const parsed = minutesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-minutes" };
  const saved = await saveItemMinutes(rundownDeps, who.actor, parsed.data);
  return saved.ok ? { ok: true } : { ok: false, code: saved.error.code };
};

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
