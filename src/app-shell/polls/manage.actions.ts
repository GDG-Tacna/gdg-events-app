"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { keptOpenPoll, pollAdminDeps } from "@/app-shell/composition/polls.server";
import { getSession } from "@/app-shell/guards";
import { moduleOn } from "@/app-shell/modules.server";
import { mayEdit } from "@/app-shell/permissions.server";
import type { PollActionResult, PollDraft } from "@/features/polls";
import { closePoll, createPoll, deletePoll, openPoll, pollResults, updatePoll, type PollAdminActor, type PollAdminErrorCode, type PollTally } from "@/features/polls/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";

/** Shapes only; every rule (lengths, counts, the prize) is checked again by the use cases. */
const draftSchema = z.object({
  question: z.string().max(400),
  options: z.array(z.object({ text: z.string().max(200), imagePath: z.string().max(300).nullable() })).max(10),
  changeable: z.boolean(),
  reward: z.object({ kind: z.string().max(20), amount: z.number() }),
});
const saveSchema = z.object({ id: z.string().max(60).optional(), draft: draftSchema });
const changeSchema = z.object({ id: z.string().min(1).max(60), action: z.enum(["open", "close", "delete"]) });
const idSchema = z.object({ id: z.string().min(1).max(60) });

type Refusal = { ok: false; code: PollAdminErrorCode };

/**
 * Server Actions behind the "Encuestas" screen. Public endpoints: the flags, the session and the input shape are
 * checked here, the actor comes from the verified session, and every use case checks the admin role again.
 */
async function admin(): Promise<PollAdminActor | Refusal> {
  if (!FEATURES.admin || !(await moduleOn("polls"))) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "polls"))) return { ok: false, code: "forbidden" };
  return { uid: session.uid, role: session.role };
}
const refused = (value: PollAdminActor | Refusal): value is Refusal => "ok" in value;

/** What a change shows: the admin list, and the cadets' dashboard and poll screen (the open poll changed). */
function refresh() {
  keptOpenPoll.clear();
  revalidatePath(ROUTES.adminPolls);
  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.poll);
}

export async function savePollAction(input: { id?: string; draft: PollDraft }): Promise<PollActionResult> {
  const actor = await admin();
  if (refused(actor)) return actor;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-question" };
  const { id, draft } = parsed.data;
  const saved = id ? await updatePoll(pollAdminDeps, actor, { id, draft }) : await createPoll(pollAdminDeps, actor, { draft });
  if (!saved.ok) return { ok: false, code: saved.error.code };
  revalidatePath(ROUTES.adminPolls);
  return { ok: true };
}

/** Opens a draft, closes the open poll, or deletes a draft. */
export async function changePollAction(input: { id: string; action: "open" | "close" | "delete" }): Promise<PollActionResult> {
  const actor = await admin();
  if (refused(actor)) return actor;
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  const { id, action } = parsed.data;
  const done = action === "open" ? await openPoll(pollAdminDeps, actor, { id }) : action === "close" ? await closePoll(pollAdminDeps, actor, { id }) : await deletePoll(pollAdminDeps, actor, { id });
  if (!done.ok) return { ok: false, code: done.error.code };
  refresh();
  return { ok: true };
}

/** A poll's votes per option, for the results screen while it is open. */
export async function pollResultsAction(input: { id: string }): Promise<{ ok: true; tally: PollTally } | Refusal> {
  const actor = await admin();
  if (refused(actor)) return actor;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  const results = await pollResults(pollAdminDeps, actor, parsed.data);
  return results.ok ? { ok: true, tally: results.value.tally } : { ok: false, code: results.error.code };
}
