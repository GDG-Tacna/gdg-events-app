import type { Metadata } from "next";
import { rankDeps } from "@/app-shell/composition/ranks.server";
import { requireRole } from "@/app-shell/guards";
import { uploadImageAction } from "@/app-shell/media/upload.action";
import { saveRanksAction } from "@/app-shell/ranks/ranks.actions";
import { RanksEditor } from "@/features/attendee";
import { getRanksForEdit } from "@/features/attendee/server";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.ranks.title };

export default async function AdminRanksPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "ranks");

  const ranks = await getRanksForEdit(rankDeps, { uid: session.uid, role: session.role });
  if (!ranks.ok) throw new Error("Could not read the ranks");

  return (
    <ScreenEnter>
      <RanksEditor ranks={ranks.value.ranks} isDefault={ranks.value.isDefault} save={saveRanksAction} upload={uploadImageAction} />
    </ScreenEnter>
  );
}
