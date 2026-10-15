import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentEditionId } from "@/app-shell/composition/edition.server";
import { minigameAdminDeps } from "@/app-shell/composition/minigames.server";
import { requireRole } from "@/app-shell/guards";
import { saveMinigameSettingsAction } from "@/app-shell/minigames/settings.actions";
import { MinigameSettingsView } from "@/features/minigames";
import { getMinigameSettingsForEdit } from "@/features/minigames/server";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { moduleOn } from "@/app-shell/modules.server";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.minigames.title };

export default async function AdminMinigamesPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "minigames");
  if (!(await moduleOn("minigames"))) notFound();

  const [settings, eventId] = await Promise.all([getMinigameSettingsForEdit(minigameAdminDeps, { role: session.role }), currentEditionId()]);
  if (!settings.ok) throw new Error("Could not read the mini-game settings");

  return (
    <ScreenEnter>
      <MinigameSettingsView settings={settings.value.settings} isDefault={settings.value.isDefault} eventId={eventId} save={saveMinigameSettingsAction} />
    </ScreenEnter>
  );
}
