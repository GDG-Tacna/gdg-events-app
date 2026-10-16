import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { acceptInviteAction } from "@/app-shell/admin/invite.actions";
import { inviteDeps } from "@/app-shell/composition/admin.server";
import { getSession } from "@/app-shell/guards";
import { InviteAcceptPanel } from "@/features/admin";
import { previewInvite, splitInviteToken } from "@/features/admin/server";
import { runInEdition } from "@/features/event/server";
import { FEATURES } from "@/shared/config/features";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";

// The link is a secret: never indexed, never cached.
export const metadata: Metadata = { title: `${copy.invite.title} · ${copy.brand.name}`, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Opens an invitation link: who it is for (half hidden) and the role, then sign in and accept. */
export default async function InvitePage({ params }: { params: Promise<{ secret: string }> }) {
  if (!FEATURES.admin) notFound();
  const { secret } = await params;
  const link = splitInviteToken(decodeURIComponent(secret));
  if (!link) notFound();
  // The link names its edition (one being prepared may not be public yet); older links belong to the public one.
  const read = () => previewInvite(inviteDeps(), link.secret);
  const preview = link.eventId ? await runInEdition(link.eventId, read) : await read();
  if (!preview.ok) {
    if (preview.error.code === "not-found") notFound();
    throw new Error("Could not read the invitation");
  }
  const session = await getSession();

  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-safe-space-8 pb-safe-space-8 mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center">
        <ScreenEnter>
          <InviteAcceptPanel
            secret={secret}
            role={preview.value.role}
            maskedEmail={preview.value.email}
            state={preview.value.state}
            signedIn={session !== null}
            accept={acceptInviteAction}
          />
        </ScreenEnter>
      </main>
    </>
  );
}
