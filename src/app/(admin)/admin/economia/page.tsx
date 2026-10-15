import type { Metadata } from "next";
import { economyDeps } from "@/app-shell/composition/economy.server";
import { currentEditionId } from "@/app-shell/composition/edition.server";
import { saveEconomyAction } from "@/app-shell/economy/economy.actions";
import { requireRole } from "@/app-shell/guards";
import { EconomySettingsView } from "@/features/economy";
import { getEconomyForEdit } from "@/features/economy/server";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.economy.title };

export default async function AdminEconomyPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "economy");

  const [economy, eventId] = await Promise.all([getEconomyForEdit(economyDeps, { role: session.role }), currentEditionId()]);
  if (!economy.ok) throw new Error("Could not read the economy settings");

  return (
    <ScreenEnter>
      <EconomySettingsView settings={economy.value.settings} isDefault={economy.value.isDefault} eventId={eventId} save={saveEconomyAction} />
    </ScreenEnter>
  );
}
