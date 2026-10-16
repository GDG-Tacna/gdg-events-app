import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { speakerAccessDeps } from "@/app-shell/composition/speakers.server";
import { getSession } from "@/app-shell/guards";
import { acceptSpeakerInviteAction } from "@/app-shell/speakers/access.actions";
import { runInEdition } from "@/features/event/server";
import { SpeakerInvitePanel } from "@/features/speakers";
import { previewSpeakerInvite, splitSpeakerToken } from "@/features/speakers/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";

// The link is a secret: never indexed, never cached.
export const metadata: Metadata = { title: `${copy.speakerInvite.title} · ${copy.brand.name}`, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Opens a speaker's link: whose code it is and for which email (half hidden), then sign in and see the code. */
export default async function SpeakerInvitePage({ params }: { params: Promise<{ token: string }> }) {
  if (!FEATURES.checkins) notFound();
  const { token } = await params;
  const link = splitSpeakerToken(decodeURIComponent(token));
  if (!link) notFound();
  const preview = await runInEdition(link.eventId, () => previewSpeakerInvite(speakerAccessDeps, link.secret));
  if (!preview.ok) {
    if (preview.error.code === "not-found") notFound();
    throw new Error("Could not read the speaker's link");
  }
  const session = await getSession();
  // The linked speaker coming back through their link goes straight to their code.
  if (session && preview.value.state === "accepted" && preview.value.accountUid === session.uid) redirect(ROUTES.speaker);

  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-safe-space-8 pb-safe-space-8 mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center">
        <ScreenEnter>
          <SpeakerInvitePanel
            token={link.eventId + "." + link.secret}
            name={preview.value.name}
            maskedEmail={preview.value.email}
            state={preview.value.state}
            signedIn={session !== null}
            accept={acceptSpeakerInviteAction}
            homeHref={ROUTES.speaker}
          />
        </ScreenEnter>
      </main>
    </>
  );
}
