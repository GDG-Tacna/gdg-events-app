import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pollAdminDeps } from "@/app-shell/composition/polls.server";
import { requireRole } from "@/app-shell/guards";
import { moduleOn } from "@/app-shell/modules.server";
import { requireSection } from "@/app-shell/permissions.server";
import { changePollAction } from "@/app-shell/polls/manage.actions";
import { PollsAdminView } from "@/features/polls";
import { listPolls } from "@/features/polls/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.admin.polls.title };

export default async function AdminPollsPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "polls");
  if (!(await moduleOn("polls"))) notFound();

  const polls = await listPolls(pollAdminDeps, { uid: session.uid, role: session.role });
  // A failed read goes to the route error boundary instead of showing an empty list that is not real.
  if (!polls.ok) throw new Error("Could not read the polls");

  return (
    <ScreenEnter>
      <PollsAdminView polls={polls.value} change={changePollAction} hrefs={{ create: `${ROUTES.adminPolls}/nueva`, base: ROUTES.adminPolls }} />
    </ScreenEnter>
  );
}
