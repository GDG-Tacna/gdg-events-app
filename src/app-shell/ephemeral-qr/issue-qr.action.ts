"use server";

import { z } from "zod";
import { ephemeralQrDeps } from "@/app-shell/composition/ephemeral-qr.server";
import { getSession } from "@/app-shell/guards";
import type { IssueQrActionResult } from "@/features/ephemeral-qr";
import { issueQr } from "@/features/ephemeral-qr/server";
import { FEATURES } from "@/shared/config/features";
import { mayEdit } from "@/app-shell/permissions.server";

const inputSchema = z.object({ checkpointId: z.string().min(1).max(48) });

/**
 * Server Action behind the projector screen. It is a public endpoint: the flags, the session and the
 * input are checked here, the actor comes from the verified session, and the use case checks the admin
 * role again. It returns the picture and timing of the code, never the signed payload as text.
 */
export async function issueQrAction(input: { checkpointId: string }): Promise<IssueQrActionResult> {
  if (!FEATURES.admin || !FEATURES.checkins) return { ok: false, code: "disabled" };

  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, ["checkpoints", "talks"]))) return { ok: false, code: "forbidden" };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "checkpoint-not-found" };

  const result = await issueQr(ephemeralQrDeps, { uid: session.uid, role: session.role }, parsed.data);
  if (!result.ok) return { ok: false, code: result.error.code };

  const { checkpointId, name, cells, issuedAt, expiresAt } = result.value;
  return { ok: true, qr: { checkpointId, name, cells, issuedAt, expiresAt } };
}
