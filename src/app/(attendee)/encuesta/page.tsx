import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { voteDeps } from "@/app-shell/composition/polls.server";
import { isPublicEventFinished } from "@/app-shell/event-status.server";
import { requireAttendee } from "@/app-shell/guards";
import { moduleOn } from "@/app-shell/modules.server";
import { pollTallyAction } from "@/app-shell/polls/cadet-tally.action";
import { votePollAction } from "@/app-shell/polls/vote.action";
import { PollVoteView } from "@/features/polls";
import { getCadetPoll, getOpenPollTally } from "@/features/polls/server";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";

export const metadata: Metadata = { title: `${copy.poll.title} · ${copy.brand.name}` };

/** The live poll, to vote in it (and, once voted, to watch how the votes stand); or that none is open now. */
export default async function PollPage() {
  if (!FEATURES.polls || !(await moduleOn("polls"))) notFound();
  const session = await requireAttendee();
  if (await isPublicEventFinished()) redirect(ROUTES.dashboard);
  const current = await getCadetPoll(voteDeps, session.uid);
  if (!current.ok) throw new Error("Could not read the poll");

  // Standings only for a cadet who already voted; a failed read just leaves them out (the vote itself still works).
  let initialTally = null;
  if (current.value?.myVote) {
    const tally = await getOpenPollTally(voteDeps, current.value.poll.id);
    if (tally.ok) initialTally = tally.value;
  }

  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-safe-space-6 pb-safe-space-6 mx-auto w-full max-w-[520px]">
        <ScreenEnter>
          <PollVoteView current={current.value} vote={votePollAction} homeHref={ROUTES.dashboard} initialTally={initialTally} tally={pollTallyAction} />
        </ScreenEnter>
      </main>
    </>
  );
}
