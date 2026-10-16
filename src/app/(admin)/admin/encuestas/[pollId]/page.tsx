import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pollAdminDeps } from "@/app-shell/composition/polls.server";
import { requireRole } from "@/app-shell/guards";
import { uploadImageAction } from "@/app-shell/media/upload.action";
import { moduleOn } from "@/app-shell/modules.server";
import { requireSection } from "@/app-shell/permissions.server";
import { pollResultsAction, savePollAction } from "@/app-shell/polls/manage.actions";
import { PollForm, PollResultsView } from "@/features/polls";
import { pollResults } from "@/features/polls/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.admin.polls.title };

/** A draft is edited here; a poll that was opened shows its results instead (what was voted never changes). */
export default async function AdminPollPage({ params }: { params: Promise<{ pollId: string }> }) {
  const session = await requireRole(["admin"]);
  await requireSection(session, "polls");
  if (!(await moduleOn("polls"))) notFound();
  const { pollId } = await params;

  const found = await pollResults(pollAdminDeps, { uid: session.uid, role: session.role }, { id: pollId });
  if (!found.ok) {
    if (found.error.code === "not-found") notFound();
    throw new Error("Could not read the poll");
  }
  const { poll, tally } = found.value;

  return (
    <ScreenEnter>
      {poll.status === "draft" ? (
        <PollForm poll={poll} save={savePollAction} upload={uploadImageAction} listHref={ROUTES.adminPolls} />
      ) : (
        <PollResultsView poll={poll} tally={tally} refresh={pollResultsAction} listHref={ROUTES.adminPolls} />
      )}
    </ScreenEnter>
  );
}
