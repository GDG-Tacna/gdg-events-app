"use server";

import { z } from "zod";
import { voteDeps } from "@/app-shell/composition/polls.server";
import { getCadetSession } from "@/app-shell/guards";
import { moduleOn } from "@/app-shell/modules.server";
import type { PollTallyAction } from "@/features/polls";
import { getOpenPollTally } from "@/features/polls/server";
import { FEATURES } from "@/shared/config/features";

const inputSchema = z.object({ pollId: z.string().min(1).max(60) });

/**
 * Server Action behind the live results a cadet sees after voting: how the open poll's votes stand, asked every few
 * seconds. A public endpoint: the flag, the session and the input shape are checked here, and the use case answers
 * only the open poll's count (the crowd shares a short-lived copy of it).
 */
export async function pollTallyAction(input: { pollId: string }): ReturnType<PollTallyAction> {
  if (!FEATURES.polls || !(await moduleOn("polls"))) return { ok: false, code: "disabled" };
  const session = await getCadetSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "attendee") return { ok: false, code: session.role === null ? "not-registered" : "forbidden" };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  const tally = await getOpenPollTally(voteDeps, parsed.data.pollId);
  return tally.ok ? { ok: true, tally: tally.value } : { ok: false, code: tally.error.code };
}
