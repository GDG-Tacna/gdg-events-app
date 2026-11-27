"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { unlockGlobalAchievements } from "@/app-shell/composition/achievements.server";
import { certificateDeps } from "@/app-shell/composition/certificates.server";
import { getSession } from "@/app-shell/guards";
import type { ClaimCertificateAction } from "@/features/certificates";
import { claimCertificate } from "@/features/certificates/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";

const claimSchema = z.object({
  eventId: z.string().min(2).max(60),
  templateId: z.string().min(2).max(60),
  recipientName: z.string(),
});

/**
 * Claims and locks a certificate for any signed-in user after validating full name and server-side eligibility.
 */
export const claimCertificateAction: ClaimCertificateAction = async (raw) => {
  if (!FEATURES.certificates) return { ok: false, code: "disabled" };
  const session = await getSession();
  if (!session) return { ok: false, code: "unauthenticated" };

  const parsed = claimSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "invalid-recipient-name" };

  const result = await claimCertificate(
    certificateDeps,
    { uid: session.uid, email: session.verifiedEmail ?? null, displayName: session.displayName },
    parsed.data,
  );
  if (!result.ok) return { ok: false, code: result.error.code };

  revalidatePath(ROUTES.certificates);
  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.achievements);
  revalidatePath(`${ROUTES.verify}/${result.value.code}`);
  // Claiming a certificate may unlock global community badges ("Certificado oficial"); never fails the claim.
  await unlockGlobalAchievements(session.uid).catch(() => undefined);
  return { ok: true, value: result.value };
};
