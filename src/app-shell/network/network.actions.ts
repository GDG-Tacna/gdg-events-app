"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { unlockAchievements } from "@/app-shell/composition/achievements.server";
import { networkDeps } from "@/app-shell/composition/network.server";
import { getSession } from "@/app-shell/guards";
import type { ConnectContactActionResult, IssueContactCodeActionResult, SaveContactLinksActionResult } from "@/features/network";
import { connectCadets, issueContactCode, saveContactLinks, type NetworkActor } from "@/features/network/server";
import { ROUTES } from "@/shared/config/routes";
import { moduleOn } from "@/app-shell/modules.server";

/** A QR payload is short text; anything longer is not one of ours. */
const payloadSchema = z.string().min(1).max(512);
/** Shape only; each link is checked for its kind by the use case. */
const linksSchema = z.object({ linkedin: z.string().max(300), github: z.string().max(300), web: z.string().max(300) });

/**
 * The cadet of the session, or why there is none. These actions are public endpoints: the flag and the session
 * are checked here, the uid always comes from the verified session, and the use cases check the role again.
 */
async function cadet(): Promise<NetworkActor | { ok: false; code: "disabled" | "unauthenticated" }> {
  if (!(await moduleOn("network"))) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  return { uid: session.uid, role: session.role };
}

const isRefusal = (value: NetworkActor | { ok: false }): value is { ok: false; code: "disabled" | "unauthenticated" } => "ok" in value;

/** The cadet's own contact code: the picture and timing, never the signed text. */
export async function issueContactCodeAction(): Promise<IssueContactCodeActionResult> {
  const actor = await cadet();
  if (isRefusal(actor)) return actor;
  const issued = issueContactCode(networkDeps, actor);
  return issued.ok ? { ok: true, code: issued.value } : { ok: false, code: issued.error.code };
}

/** Makes the cadet of the session and the one whose code was scanned contacts; answers the other's card and the reward. */
export async function connectContactAction(payload: string): Promise<ConnectContactActionResult> {
  const actor = await cadet();
  if (isRefusal(actor)) return actor;
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, code: "invalid-code" };

  const connected = await connectCadets(networkDeps, actor, parsed.data);
  if (!connected.ok) return { ok: false, code: connected.error.code };
  // A new contact may unlock "contactos hechos" badges; the other cadet gets theirs on their next scan or visit to Logros.
  const achievements = await unlockAchievements(actor.uid);
  revalidatePath(ROUTES.network);
  return { ok: true, ...connected.value, achievements };
}

/** Saves the links the cadet shows on their card. */
export async function saveContactLinksAction(input: { linkedin: string; github: string; web: string }): Promise<SaveContactLinksActionResult> {
  const actor = await cadet();
  if (isRefusal(actor)) return actor;
  const parsed = linksSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "unknown" };

  const saved = await saveContactLinks(networkDeps, actor, parsed.data);
  if (!saved.ok) return { ok: false, code: saved.error.code };
  revalidatePath(ROUTES.network);
  return { ok: true, links: saved.value };
}
