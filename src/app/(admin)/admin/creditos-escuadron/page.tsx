import type { Metadata } from "next";
import { currentEconomy, squadCreditsDeps } from "@/app-shell/composition/economy.server";
import {
  awardSquadBonusAction,
  createSquadPrizeAction,
  redeemSquadPrizeAction,
  setSquadPrizeActiveAction,
  updateSquadPrizeAction,
} from "@/app-shell/economy/squad-credits.actions";
import { requireRole } from "@/app-shell/guards";
import { uploadImageAction } from "@/app-shell/media/upload.action";
import { SquadCreditsAdminView } from "@/features/economy";
import { getSquadCreditsOverview } from "@/features/economy/server";
import { copy } from "@/shared/copy/es";
import { ScreenEnter } from "@/shared/ui";
import { requireSection } from "@/app-shell/permissions.server";

export const metadata: Metadata = { title: copy.admin.squadCredits.title };

export default async function AdminSquadCreditsPage() {
  const session = await requireRole(["admin"]);
  await requireSection(session, "squadCredits");

  const [overview, economy] = await Promise.all([getSquadCreditsOverview(squadCreditsDeps, { uid: session.uid, role: session.role }), currentEconomy()]);
  if (!overview.ok) throw new Error("Could not read the squad credits");

  return (
    <ScreenEnter>
      <SquadCreditsAdminView
        uploadImage={uploadImageAction}
        overview={overview.value}
        squadCreditsEnabled={economy.squadCreditsEnabled}
        awardBonus={awardSquadBonusAction}
        redeem={redeemSquadPrizeAction}
        createPrize={createSquadPrizeAction}
        updatePrize={updateSquadPrizeAction}
        setPrizeActive={setSquadPrizeActiveAction}
      />
    </ScreenEnter>
  );
}
