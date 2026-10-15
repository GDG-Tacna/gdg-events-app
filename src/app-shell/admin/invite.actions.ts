"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { forgetEditionRole, inviteDeps } from "@/app-shell/composition/admin.server";
import { getSession } from "@/app-shell/guards";
import type { AcceptInviteActionResult, CreateInviteActionResult, RevokeInviteActionResult } from "@/features/admin";
import { acceptInvite, createInvite, revokeInvite, splitInviteToken, type Actor } from "@/features/admin/server";
import { runInEdition } from "@/features/event/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { mayEdit } from "@/app-shell/permissions.server";

const createSchema = z.object({ email: z.string().max(254), role: z.string().max(20) });
const idSchema = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) });
const secretSchema = z.object({ secret: z.string().max(200) });

/** The team admin asking, from the verified session (an organizer acts with the edition's scope). */
async function admin(): Promise<Actor | { ok: false; code: "disabled" | "unauthenticated" | "forbidden" }> {
  if (!FEATURES.admin) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "team"))) return { ok: false, code: "forbidden" };
  return { uid: session.uid, role: session.role, adminScope: session.adminScope ?? "edition" };
}
const refused = (value: Actor | { ok: false }): value is { ok: false; code: "disabled" | "unauthenticated" | "forbidden" } => "ok" in value;

/** Invites someone by email to a role of the edition; answers the link to share (and whether it was emailed). */
export async function createInviteAction(input: { email: string; role: string }): Promise<CreateInviteActionResult> {
  const actor = await admin();
  if (refused(actor)) return actor;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-email" };
  const created = await createInvite(inviteDeps(), actor, parsed.data);
  if (!created.ok) return { ok: false, code: created.error.code };
  revalidatePath(ROUTES.adminTeam);
  return { ok: true, ...created.value };
}

export async function revokeInviteAction(input: { id: string }): Promise<RevokeInviteActionResult> {
  const actor = await admin();
  if (refused(actor)) return actor;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  const revoked = await revokeInvite(inviteDeps(), actor, parsed.data);
  if (!revoked.ok) return { ok: false, code: revoked.error.code };
  revalidatePath(ROUTES.adminTeam);
  return { ok: true };
}

/**
 * Accepts an invitation with the signed-in account (anyone signed in may try: the use case checks the link, its
 * state and that the account's verified email is the invited one). The screen renews the session afterwards.
 */
export async function acceptInviteAction(input: { secret: string }): Promise<AcceptInviteActionResult> {
  if (!FEATURES.admin) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  const parsed = secretSchema.safeParse(input);
  const link = parsed.success ? splitInviteToken(parsed.data.secret) : null;
  if (!link) return { ok: false, code: "not-found" };
  // Accepting files the role in the edition the link names (one being prepared may not be public yet).
  const accept = () => acceptInvite(inviteDeps(), { uid: session.uid, verifiedEmail: session.verifiedEmail ?? null, displayName: session.displayName, role: session.role }, link.secret);
  const accepted = link.eventId ? await runInEdition(link.eventId, accept) : await accept();
  if (!accepted.ok) return { ok: false, code: accepted.error.code };
  forgetEditionRole(session.uid);
  revalidatePath(ROUTES.adminTeam);
  return { ok: true, role: accepted.value.role };
}
