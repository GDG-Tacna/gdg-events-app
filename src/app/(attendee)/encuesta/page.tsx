import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { voteDeps } from "@/app-shell/composition/polls.server";
import { requireAttendee } from "@/app-shell/guards";
import { moduleOn } from "@/app-shell/modules.server";
import { votePollAction } from "@/app-shell/polls/vote.action";
import { PollVoteView } from "@/features/polls";
import { getCadetPoll } from "@/features/polls/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";

export const metadata: Metadata = { title: `${copy.poll.title} · ${copy.brand.name}` };

/** The live poll, to vote in it; or that none is open now. */
export default async function PollPage() {
  if (!FEATURES.polls || !(await moduleOn("polls"))) notFound();
  const session = await requireAttendee();
  const current = await getCadetPoll(voteDeps, session.uid);
  if (!current.ok) throw new Error("Could not read the poll");

  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-safe-space-6 pb-safe-space-6 mx-auto w-full max-w-[520px]">
        <ScreenEnter>
          <PollVoteView current={current.value} vote={votePollAction} homeHref={ROUTES.dashboard} />
        </ScreenEnter>
      </main>
    </>
  );
}
