import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { avatarDeps } from "@/app-shell/composition/avatar.server";
import { dashboardDeps } from "@/app-shell/composition/dashboard.server";
import { requireAttendee } from "@/app-shell/guards";
import { resetAvatarAction, saveAvatarAction } from "@/app-shell/avatar/avatar.actions";
import { AvatarEditor } from "@/features/avatar";
import { getAvatarLook } from "@/features/avatar/server";
import { getAttendeeOverview } from "@/features/dashboard";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";

export const metadata: Metadata = { title: `${copy.avatar.title} · ${copy.brand.name}` };

/** "Mi avatar": the editor, starting from the look the cadet chose or the one their alias gives. */
export default async function AvatarPage() {
  const session = await requireAttendee();
  const [overview, chosen] = await Promise.all([getAttendeeOverview(dashboardDeps, session.uid), getAvatarLook(avatarDeps, session.uid)]);
  if (!overview.ok) throw new Error("Could not read the attendee profile");
  if (overview.value === null) redirect(ROUTES.onboarding);

  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-safe-space-6 pb-safe-space-6 mx-auto w-full max-w-[520px]">
        <ScreenEnter>
          <AvatarEditor alias={overview.value.alias} chosen={chosen} save={saveAvatarAction} reset={resetAvatarAction} backHref={ROUTES.dashboard} />
        </ScreenEnter>
      </main>
    </>
  );
}
