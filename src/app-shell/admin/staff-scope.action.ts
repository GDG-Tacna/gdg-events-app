"use server";

import { z } from "zod";
import { staffScopeDeps } from "@/app-shell/composition/checkpoint-admin.server";
import { getSession } from "@/app-shell/guards";
import { mayEdit } from "@/app-shell/permissions.server";
import type { SetStaffScopeActionResult } from "@/features/admin";
import { STAFF_SCOPE_MAX, setStaffScope } from "@/features/checkpoints/server";
import { FEATURES } from "@/shared/config/features";

const inputSchema = z.object({
  uid: z.string().min(1).max(128),
  checkpointIds: z.array(z.string().min(1).max(48)).max(STAFF_SCOPE_MAX).nullable(),
});

/**
 * Server Action behind «Elegir puestos» in Admin › Equipo: limits a staff account to some stations of the edition, or
 * lifts the limit. It is a public endpoint: the flag, the session (an admin who may edit the team, so an organizer
 * manages its staff as with roles) and the input are checked here; the use case checks the role again, accepts only
 * the edition's stations and writes the audit line.
 */
export async function setStaffScopeAction(input: { uid: string; checkpointIds: readonly string[] | null }): Promise<SetStaffScopeActionResult> {
  if (!FEATURES.admin) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "team"))) return { ok: false, code: "forbidden" };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-scope" };

  const result = await setStaffScope(staffScopeDeps, { uid: session.uid, role: session.role }, parsed.data);
  return result.ok ? { ok: true, checkpointIds: result.value } : { ok: false, code: result.error.code };
}
