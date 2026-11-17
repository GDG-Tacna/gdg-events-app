"use server";

import { z } from "zod";
import { ephemeralQrDeps } from "@/app-shell/composition/ephemeral-qr.server";
import { getSession } from "@/app-shell/guards";
import type { IssueQrActionResult } from "@/features/ephemeral-qr";
import { issueQr, type QrActor } from "@/features/ephemeral-qr/server";
import { FEATURES } from "@/shared/config/features";
import { mayEdit, staffCheckpoints, staffStations } from "@/app-shell/permissions.server";

const inputSchema = z.object({ checkpointId: z.string().min(1).max(48) });

/**
 * Server Action behind the screens that show a code: the projector (a talk), the admin's code screen and the staff's
 * (an entrance or a stand). It is a public endpoint: the flags, the session and the input are checked here, the actor
 * comes from the verified session, and the use case decides what each role may show (an admin a talk, an entrance or a
 * stand; staff only an entrance or a stand of a kind the edition lets them operate, and only their own stations when an
 * admin limited them). It returns the picture and timing of the code, never the signed payload as text. Every call is
 * its own code: screens share nothing.
 */
export async function issueQrAction(input: { checkpointId: string }): Promise<IssueQrActionResult> {
  if (!FEATURES.checkins) return { ok: false, code: "disabled" };

  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };

  let actor: QrActor;
  if (session.role === "admin") {
    if (!FEATURES.admin) return { ok: false, code: "disabled" };
    if (!(await mayEdit(session, ["checkpoints", "talks"]))) return { ok: false, code: "forbidden" };
    actor = { uid: session.uid, role: session.role };
  } else if (session.role === "staff") {
    actor = { uid: session.uid, role: session.role, kinds: await staffStations(), checkpointIds: await staffCheckpoints(session) };
  } else {
    return { ok: false, code: "forbidden" };
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "checkpoint-not-found" };

  const result = await issueQr(ephemeralQrDeps, actor, parsed.data);
  if (!result.ok) return { ok: false, code: result.error.code };

  const { checkpointId, name, cells, issuedAt, expiresAt } = result.value;
  return { ok: true, qr: { checkpointId, name, cells, issuedAt, expiresAt } };
}
