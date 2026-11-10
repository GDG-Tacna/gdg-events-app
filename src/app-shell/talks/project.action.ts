"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ephemeralQrDeps } from "@/app-shell/composition/ephemeral-qr.server";
import { stageDeps } from "@/app-shell/composition/leaderboard.server";
import { getSession } from "@/app-shell/guards";
import { moduleOn } from "@/app-shell/modules.server";
import { mayEdit } from "@/app-shell/permissions.server";
import { listTalks } from "@/features/ephemeral-qr/server";
import { updateStage } from "@/features/leaderboard/server";
import type { ProjectTalkResult } from "@/features/talks";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";

const inputSchema = z.object({ id: z.string().min(1).max(48) });

const fail = (text: string): ProjectTalkResult => ({ ok: false, text });

/**
 * Server Action behind "Proyectar" in Charlas: puts an open talk's attendance QR on the stage screen at once. A public
 * endpoint: the flags, the session and the input are checked here, the talk's name comes from the talk itself (never
 * from the request) and the stage use case checks the admin role again.
 */
export async function projectTalkAction(input: { id: string }): Promise<ProjectTalkResult> {
  const errors = copy.admin.stage.errors;
  if (!FEATURES.admin || !FEATURES.checkins || !(await moduleOn("leaderboard"))) return fail(errors.disabled);
  const session = await getSession();
  if (!session) return fail(errors.unauthenticated);
  if (session.role !== "admin" || !(await mayEdit(session, "stage")) || !(await mayEdit(session, "talks"))) return fail(errors.forbidden);

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return fail(errors["unknown-talk"]);

  const actor = { uid: session.uid, role: session.role };
  const talks = await listTalks(ephemeralQrDeps, actor);
  if (!talks.ok) return fail(errors.unknown);
  // Only an open talk has a code to project.
  const talk = talks.value.find((candidate) => candidate.id === parsed.data.id);
  if (!talk) return fail(errors["unknown-talk"]);

  const shown = await updateStage(stageDeps, actor, { type: "talk-qr", talkId: talk.id, name: talk.name });
  if (!shown.ok) return fail(errors[shown.error.code]);
  revalidatePath(ROUTES.adminStage);
  return { ok: true };
}
