"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { unlockAchievements } from "@/app-shell/composition/achievements.server";
import { minigameDeps } from "@/app-shell/composition/minigames.server";
import { getSession } from "@/app-shell/guards";
import type { FinishMinigameActionResult, StartMinigameActionResult } from "@/features/minigames";
import { finishMinigame, startMinigame } from "@/features/minigames/server";
import { ROUTES } from "@/shared/config/routes";
import { moduleOn } from "@/app-shell/modules.server";

const startSchema = z.object({ missionId: z.string().min(1).max(60) });
const finishSchema = z.object({ missionId: z.string().min(1).max(60), won: z.boolean() });

/** Flags, session and role: a Server Action is a public endpoint, so each one checks them first. */
async function attendee(): Promise<{ ok: true; uid: string } | { ok: false; code: "disabled" | "unauthenticated" | "forbidden" | "not-registered" }> {
  if (!(await moduleOn("missions")) || !(await moduleOn("minigames"))) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "attendee") return { ok: false, code: session.role === null ? "not-registered" : "forbidden" };
  return { ok: true, uid: session.uid };
}

/**
 * Issues the ticket for a mission's mini-game. Only the mission comes from the client; whether the attendee
 * may play, which game and how hard are decided on the server.
 */
export async function startMinigameAction(input: { missionId: string }): Promise<StartMinigameActionResult> {
  const who = await attendee();
  if (!who.ok) return who;
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-available" };

  const ticket = await startMinigame(minigameDeps, who.uid, parsed.data.missionId);
  if (!ticket.ok) return { ok: false, code: ticket.error.code };
  const { gameId, difficulty, expiresAt, codeLanguages } = ticket.value;
  return { ok: true, gameId, difficulty, expiresAt: expiresAt.getTime(), codeLanguages };
}

/**
 * Takes the phone's result once (chosen by the organizer: results are trusted, the ticket limits them). A win
 * pays the bonus, refreshes the screens that show XP and may unlock badges.
 */
export async function finishMinigameAction(input: { missionId: string; won: boolean }): Promise<FinishMinigameActionResult> {
  const who = await attendee();
  if (!who.ok) return who;
  const parsed = finishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "no-ticket" };

  const result = await finishMinigame(minigameDeps, who.uid, parsed.data);
  if (!result.ok) return { ok: false, code: result.error.code };
  if (result.value.status === "lost") return { ok: true, status: "lost", xpBonus: 0, achievements: [] };

  revalidatePath(ROUTES.missions);
  revalidatePath(ROUTES.dashboard);
  const achievements = await unlockAchievements(who.uid);
  return { ok: true, status: "won", xpBonus: result.value.xpBonus, achievements };
}
