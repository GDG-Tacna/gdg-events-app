"use server";

import { z } from "zod";
import { cadetsDeps } from "@/app-shell/composition/cadets.server";
import { getSession } from "@/app-shell/guards";
import type { CadetActionResult, DeleteCadetActionResult } from "@/features/cadets";
import { banCadet, changeCadetSquad, deleteCadet, renameCadet, unbanCadet, type CadetsActor, type CadetsErrorCode } from "@/features/cadets/server";
import { FEATURES } from "@/shared/config/features";
import { mayEdit } from "@/app-shell/permissions.server";

const uidSchema = z.string().min(1).max(128);
const renameSchema = z.object({ uid: uidSchema, alias: z.string().max(64) });
const squadSchema = z.object({ uid: uidSchema, squad: z.string().max(60).nullable() });
const banSchema = z.object({ uid: uidSchema, reason: z.string().max(400) });
const uidOnlySchema = z.object({ uid: uidSchema });

/**
 * Server Actions behind the Cadetes screens. They are public endpoints: the flag, the session, the permission over the
 * section and the input shape are checked here, the actor comes from the verified session, and every use case checks
 * the admin role again (deleting also checks that the admin is one of every edition).
 */
async function adminActor(): Promise<CadetsActor | { ok: false; code: CadetsErrorCode }> {
  if (!FEATURES.admin) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  if (session.role !== "admin" || !(await mayEdit(session, "cadets"))) return { ok: false, code: "forbidden" };
  return { uid: session.uid, role: session.role, adminScope: session.adminScope };
}

const refused = (value: unknown): value is { ok: false; code: CadetsErrorCode } => typeof value === "object" && value !== null && "ok" in value;
const answer = (result: { ok: true } | { ok: false; error: { code: CadetsErrorCode } }): CadetActionResult => (result.ok ? { ok: true } : { ok: false, code: result.error.code });

export async function renameCadetAction(input: { uid: string; alias: string }): Promise<CadetActionResult> {
  const actor = await adminActor();
  if (refused(actor)) return actor;
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-alias" };
  return answer(await renameCadet(cadetsDeps, actor, parsed.data));
}

export async function changeCadetSquadAction(input: { uid: string; squad: string | null }): Promise<CadetActionResult> {
  const actor = await adminActor();
  if (refused(actor)) return actor;
  const parsed = squadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "unknown-squad" };
  return answer(await changeCadetSquad(cadetsDeps, actor, parsed.data));
}

export async function banCadetAction(input: { uid: string; reason: string }): Promise<CadetActionResult> {
  const actor = await adminActor();
  if (refused(actor)) return actor;
  const parsed = banSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-reason" };
  return answer(await banCadet(cadetsDeps, actor, parsed.data));
}

export async function unbanCadetAction(input: { uid: string }): Promise<CadetActionResult> {
  const actor = await adminActor();
  if (refused(actor)) return actor;
  const parsed = uidOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  return answer(await unbanCadet(cadetsDeps, actor, parsed.data));
}

export async function deleteCadetAction(input: { uid: string }): Promise<DeleteCadetActionResult> {
  const actor = await adminActor();
  if (refused(actor)) return actor;
  const parsed = uidOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "not-found" };
  const result = await deleteCadet(cadetsDeps, actor, parsed.data);
  return result.ok ? { ok: true, alias: result.value.alias } : { ok: false, code: result.error.code };
}
