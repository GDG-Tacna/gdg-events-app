"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { unlockAchievements } from "@/app-shell/composition/achievements.server";
import { missionDeps } from "@/app-shell/composition/missions.server";
import { getSession } from "@/app-shell/guards";
import type { SubmitMissionActionResult } from "@/features/missions";
import { submitMissionProof } from "@/features/missions/server";
import { ROUTES } from "@/shared/config/routes";
import { moduleOn } from "@/app-shell/modules.server";

const inputSchema = z.object({
  missionId: z.string().min(1).max(60),
  answer: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("choice"), option: z.number().int().min(0).max(9) }),
    z.object({ kind: z.literal("keyword"), value: z.string().trim().min(1).max(60) }),
  ]),
});

/**
 * Server Action behind the quiz and keyword screens. A public endpoint: the flag, the session and the
 * input are checked here. The attendee only says which mission and what they answered; whether it is
 * right, how many tries are left and the XP are decided on the server.
 */
export async function submitMissionAnswerAction(input: unknown): Promise<SubmitMissionActionResult> {
  if (!(await moduleOn("missions"))) return { ok: false, code: "disabled" };

  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "attendee") return { ok: false, code: session.role === null ? "not-registered" : "forbidden" };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "wrong-proof" };

  const result = await submitMissionProof(missionDeps, session.uid, parsed.data.missionId, parsed.data.answer);
  if (!result.ok) return { ok: false, code: result.error.code };

  // The board and the dashboard show progress and XP: drop any cached render of them.
  revalidatePath(ROUTES.missions);
  revalidatePath(ROUTES.dashboard);
  const outcome = result.value;
  // A completed mission may unlock badges; never fails the answer.
  const achievements = outcome.status === "completed" ? await unlockAchievements(session.uid) : [];
  return outcome.kind === "closed"
    ? { ok: true, status: outcome.status, xpEarned: outcome.xpEarned, creditsEarned: outcome.creditsEarned, attemptsLeft: outcome.status === "in-progress" ? null : 0, closed: true, achievements }
    : { ok: true, status: outcome.status, xpEarned: outcome.xpEarned, creditsEarned: outcome.creditsEarned, attemptsLeft: outcome.attemptsLeft, closed: false, achievements };
}
