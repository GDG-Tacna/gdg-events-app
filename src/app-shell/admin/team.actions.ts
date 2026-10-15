"use server";

import { z } from "zod";
import { teamDeps } from "@/app-shell/composition/admin.server";
import { getSession } from "@/app-shell/guards";
import { isManagedRole, type ChangeRoleActionResult } from "@/features/admin";
import { grantRole, revokeRole, type Actor } from "@/features/admin/server";
import { FEATURES } from "@/shared/config/features";
import { mayEdit } from "@/app-shell/permissions.server";

const emailSchema = z.string().max(254);
const grantSchema = z.object({
  email: emailSchema,
  role: z.custom<"staff" | "admin">(isManagedRole),
});
const revokeSchema = z.object({ email: emailSchema });

/**
 * Server Actions behind the team screen. They are public endpoints: the flag, the session and the
 * input are checked here, and the actor always comes from the verified session. The use case checks
 * the admin role again, so the rule does not depend on this wrapper alone.
 */
async function actor(): Promise<Actor | ChangeRoleActionResult> {
  if (!FEATURES.admin) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "team"))) return { ok: false, code: "forbidden" };
  // Least privilege when the scope is somehow missing.
  return { uid: session.uid, role: session.role, adminScope: session.adminScope ?? "edition" };
}

const isFailure = (value: unknown): value is ChangeRoleActionResult =>
  typeof value === "object" && value !== null && "ok" in value;

export async function grantRoleAction(input: { email: string; role: string }): Promise<ChangeRoleActionResult> {
  const who = await actor();
  if (isFailure(who)) return who;

  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-email" };

  const result = await grantRole(teamDeps, who, parsed.data);
  return result.ok ? { ok: true, member: result.value } : { ok: false, code: result.error.code };
}

export async function revokeRoleAction(input: { email: string }): Promise<ChangeRoleActionResult> {
  const who = await actor();
  if (isFailure(who)) return who;

  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-email" };

  const result = await revokeRole(teamDeps, who, parsed.data);
  return result.ok ? { ok: true, member: result.value } : { ok: false, code: result.error.code };
}
