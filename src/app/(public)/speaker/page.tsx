import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { speakerAccessDeps } from "@/app-shell/composition/speakers.server";
import { requireSession } from "@/app-shell/guards";
import { moduleOn } from "@/app-shell/modules.server";
import { SpeakerCodeScreen } from "@/app-shell/speakers/SpeakerCodeScreen";
import { SignOutButton } from "@/features/auth";
import { speakerOfAccount } from "@/features/speakers/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ButtonLink, Card, ScreenEnter, SpaceBackground } from "@/shared/ui";

export const metadata: Metadata = { title: `${copy.speakerHome.title} · ${copy.brand.name}`, robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * A speaker's own code, on their phone, for the event in course. Any signed-in account may open it (a speaker need not
 * be a cadet); only the account linked to a speaker of the edition gets a code, and the server checks it again. Where
 * speakers may also play («Speakers como cadetes»), it leads to the cadet's home, or to signing up as one.
 */
export default async function SpeakerHomePage() {
  if (!FEATURES.checkins) notFound();
  const session = await requireSession();
  const found = await speakerOfAccount(speakerAccessDeps, session.uid);
  if (!found.ok) throw new Error("Could not read the speakers");
  const speaker = found.value;
  // Only a cadet (or someone who could become one) is offered the game; staff and admins have their own home.
  const play = speaker?.active && (session.role === "attendee" || session.role === null) && (await moduleOn("speakerPlay"));

  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-safe-space-6 pb-safe-space-8 gap-space-5 mx-auto flex min-h-dvh w-full max-w-[520px] flex-col">
        <ScreenEnter>
          {speaker?.active ? (
            <div className="gap-space-4 flex flex-col">
              <p className="type-body text-muted-foreground text-center">{copy.speakerHome.intro}</p>
              <SpeakerCodeScreen speakerId={speaker.id} name={speaker.name} />
            </div>
          ) : (
            <Card className="gap-space-3 flex flex-col">
              <h1 className="type-title text-foreground">{copy.speakerHome.title}</h1>
              <p className="type-body text-muted-foreground">{speaker ? copy.speakerHome.inactive : copy.speakerHome.none}</p>
            </Card>
          )}
        </ScreenEnter>
        <div className="gap-space-3 flex flex-wrap items-center justify-between">
          <SignOutButton />
          {play ? (
            <ButtonLink href={session.role === "attendee" ? ROUTES.dashboard : ROUTES.onboarding} variant="secondary">
              {session.role === "attendee" ? copy.speakerHome.toDashboard : copy.speakerHome.play}
            </ButtonLink>
          ) : null}
        </div>
      </main>
    </>
  );
}
