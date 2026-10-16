"use server";

import { z } from "zod";
import { speakerCodeDeps } from "@/app-shell/composition/speakers.server";
import { getSession } from "@/app-shell/guards";
import { mayEdit } from "@/app-shell/permissions.server";
import type { IssueQrActionResult } from "@/features/ephemeral-qr";
import { issueSpeakerCode, type SpeakerCodeErrorCode } from "@/features/speakers/server";
import { FEATURES } from "@/shared/config/features";

const inputSchema = z.object({ speakerId: z.string().min(1).max(48) });

/** The code screen is the talks' one: their error codes, with the speaker's own words (`copy.admin.speakers.qr`). */
const SCREEN_CODE = {
  "not-found": "checkpoint-not-found",
  inactive: "checkpoint-inactive",
  unauthenticated: "unauthenticated",
  forbidden: "forbidden",
  disabled: "disabled",
  unknown: "unknown",
} as const satisfies Record<SpeakerCodeErrorCode, string>;

/**
 * Server Action behind a speaker's code screen. A public endpoint: the flags, the session and the input are checked
 * here. An admin needs the talks section of the edition; anyone else only gets the code of the speaker linked to
 * their account (checked by the use case). It answers the picture and timing, never the signed payload as text.
 */
export async function issueSpeakerCodeAction(input: { speakerId: string }): Promise<IssueQrActionResult> {
  if (!FEATURES.checkins) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role === "admin" && !(await mayEdit(session, "talks"))) return { ok: false, code: "forbidden" };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "checkpoint-not-found" };

  const result = await issueSpeakerCode(speakerCodeDeps, { uid: session.uid, role: session.role }, parsed.data);
  if (!result.ok) return { ok: false, code: SCREEN_CODE[result.error.code] };
  const { speakerId, name, cells, issuedAt, expiresAt } = result.value;
  return { ok: true, qr: { checkpointId: speakerId, name, cells, issuedAt, expiresAt } };
}
