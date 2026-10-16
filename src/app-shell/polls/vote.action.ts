"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { voteDeps } from "@/app-shell/composition/polls.server";
import { getSession } from "@/app-shell/guards";
import { moduleOn } from "@/app-shell/modules.server";
import type { VoteActionResult } from "@/features/polls";
import { castVote } from "@/features/polls/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";

const inputSchema = z.object({ pollId: z.string().min(1).max(60), optionId: z.string().min(1).max(4) });

/**
 * Server Action behind the cadet's vote. A public endpoint: the flag, the session and the input shape are checked
 * here, the voter is the session's account, and the use case checks the poll, the option and the prize.
 */
export async function votePollAction(input: { pollId: string; optionId: string }): Promise<VoteActionResult> {
  if (!FEATURES.polls || !(await moduleOn("polls"))) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "attendee") return { ok: false, code: session.role === null ? "not-registered" : "forbidden" };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-option" };
  const voted = await castVote(voteDeps, session.uid, parsed.data);
  if (!voted.ok) return { ok: false, code: voted.error.code };
  // The prize changes the cadet's XP or G-Credits on the dashboard.
  if (voted.value.xp + voted.value.credits > 0) revalidatePath(ROUTES.dashboard);
  return { ok: true, ...voted.value };
}
