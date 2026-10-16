import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/app-shell/guards";
import { uploadImageAction } from "@/app-shell/media/upload.action";
import { moduleOn } from "@/app-shell/modules.server";
import { requireSection } from "@/app-shell/permissions.server";
import { savePollAction } from "@/app-shell/polls/manage.actions";
import { PollForm } from "@/features/polls";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";

export const metadata: Metadata = { title: copy.admin.polls.form.createTitle };

export default async function AdminNewPollPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "polls");
  if (!(await moduleOn("polls"))) notFound();

  return (
    <ScreenEnter>
      <PollForm save={savePollAction} upload={uploadImageAction} listHref={ROUTES.adminPolls} />
    </ScreenEnter>
  );
}
