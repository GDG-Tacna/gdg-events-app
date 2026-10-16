"use server";

import { z } from "zod";
import { pollAdminDeps } from "@/app-shell/composition/polls.server";
import { getSession } from "@/app-shell/guards";
import { moduleOn } from "@/app-shell/modules.server";
import { mayEdit } from "@/app-shell/permissions.server";
import type { StagePollAction } from "@/features/polls";
import { pollResults } from "@/features/polls/server";
import { FEATURES } from "@/shared/config/features";

const inputSchema = z.object({ id: z.string().min(1).max(60) });

/**
 * Server Action behind a poll on the stage screen: its question, options and votes, asked every few seconds by the
 * projector (an admin session, like the rest of the stage). Who runs the stage or the polls may read it.
 */
export async function stagePollAction(input: {
  id: string;
}): ReturnType<StagePollAction> {
  if (!FEATURES.polls || !(await moduleOn("polls")))
    return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, ["stage", "polls"])))
    return { ok: false, code: "forbidden" };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  const found = await pollResults(
    pollAdminDeps,
    { uid: session.uid, role: session.role },
    parsed.data,
  );
  if (!found.ok) return { ok: false, code: found.error.code };
  const { poll, tally } = found.value;
  return {
    ok: true,
    poll: {
      question: poll.question,
      status: poll.status,
      options: poll.options.map((option) => ({
        id: option.id,
        text: option.text,
        imageUrl: option.image?.url ?? null,
      })),
    },
    tally,
  };
}
