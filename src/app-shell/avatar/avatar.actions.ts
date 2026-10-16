"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { avatarDeps } from "@/app-shell/composition/avatar.server";
import { getSession } from "@/app-shell/guards";
import type { AvatarActionResult } from "@/features/avatar";
import { resetAvatarLook, saveAvatarLook } from "@/features/avatar/server";
import { ROUTES } from "@/shared/config/routes";

/** Shape only; every choice is checked against the editor's sets by the use case. */
const lookSchema = z.object({
  look: z.object({
    skin: z.number(),
    hairStyle: z.string().max(20),
    hairColor: z.number(),
    beard: z.string().max(20),
    glasses: z.string().max(20),
    helmet: z.number(),
    suit: z.number(),
  }),
});

/**
 * Server Actions behind "Mi avatar". Public endpoints: the session and the input shape are checked here, the person is
 * the session's account, and the use cases check the role and every choice again.
 */
export async function saveAvatarAction(input: { look: unknown }): Promise<AvatarActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  const parsed = lookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid-look" };
  const saved = await saveAvatarLook(avatarDeps, { uid: session.uid, role: session.role }, parsed.data.look);
  if (!saved.ok) return { ok: false, code: saved.error.code };
  revalidatePath(ROUTES.dashboard);
  return { ok: true };
}

export async function resetAvatarAction(): Promise<AvatarActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };
  const reset = await resetAvatarLook(avatarDeps, { uid: session.uid, role: session.role });
  if (!reset.ok) return { ok: false, code: reset.error.code };
  revalidatePath(ROUTES.dashboard);
  return { ok: true };
}
