import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { editionsDeps } from "@/app-shell/composition/event.server";
import { chooseWorkingEditionAction } from "@/app-shell/event/working-edition.actions";
import { requireSession } from "@/app-shell/guards";
import { SignOutButton } from "@/features/auth";
import { MyEditionsView } from "@/features/event";
import { listEditionChoices } from "@/features/event/server";
import { ROUTES, homeFor } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";

export const metadata: Metadata = { title: `${copy.editions.mine.title} · ${copy.brand.name}`, robots: { index: false } };

/** For a staff or organizer whose role is in an edition not in course: open it to prepare it, or wait for it. */
export default async function MyEditionsPage() {
  const session = await requireSession();
  if (session.role !== null || !session.otherEditions?.length) redirect(homeFor(session.role));

  const roles = new Map(session.otherEditions.map((entry) => [entry.eventId, entry.role]));
  const choices = await listEditionChoices(editionsDeps, [...roles.keys()]);
  if (!choices.ok) throw new Error("Could not read the editions");

  return (
    <>
      <SpaceBackground />
      <main className="pt-safe pb-safe px-space-4 py-space-8 gap-space-6 mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center">
        <ScreenEnter>
          <MyEditionsView
            entries={choices.value.map((edition) => ({ edition, role: roles.get(edition.id) ?? "staff" }))}
            choose={chooseWorkingEditionAction}
            adminHref={ROUTES.admin}
          />
        </ScreenEnter>
        <div className="self-start">
          <SignOutButton />
        </div>
      </main>
    </>
  );
}
