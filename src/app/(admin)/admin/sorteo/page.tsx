import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { raffleDeps } from "@/app-shell/composition/raffle.server";
import { requireRole } from "@/app-shell/guards";
import { createRafflePrizeAction, drawRafflePrizeAction, saveRaffleSettingsAction, updateRafflePrizeAction, voidRaffleDrawAction } from "@/app-shell/raffle/raffle.actions";
import { uploadImageAction } from "@/app-shell/media/upload.action";
import { RaffleAdminView } from "@/features/raffle";
import { getRaffleOverview } from "@/features/raffle/server";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { moduleOn } from "@/app-shell/modules.server";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.raffle.title };

export default async function AdminRafflePage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "raffle");
  if (!(await moduleOn("raffle"))) notFound();

  const overview = await getRaffleOverview(raffleDeps, { uid: session.uid, role: session.role });
  if (!overview.ok) throw new Error("Could not read the raffle");

  return (
    <ScreenEnter>
      <RaffleAdminView
        overview={overview.value}
        actions={{
          saveSettings: saveRaffleSettingsAction,
          createPrize: createRafflePrizeAction,
          updatePrize: updateRafflePrizeAction,
          draw: drawRafflePrizeAction,
          upload: uploadImageAction,
          voidDraw: voidRaffleDrawAction,
        }}
        stageHref={ROUTES.adminStage}
      />
    </ScreenEnter>
  );
}
