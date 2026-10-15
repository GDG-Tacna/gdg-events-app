import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminNavItems, readOnlyAreas } from "@/app-shell/admin-nav";
import { chooseWorkingEditionAction } from "@/app-shell/event/working-edition.actions";
import { loadEditionSwitch } from "@/app-shell/event/working-edition.server";
import { requireRole } from "@/app-shell/guards";
import { moduleSwitches } from "@/app-shell/modules.server";
import { sectionLevels } from "@/app-shell/permissions.server";
import { AdminShell } from "@/features/admin";
import { SignOutButton } from "@/features/auth";
import { EditionSwitcher, WorkingEditionNotice } from "@/features/event";
import { FEATURES } from "@/shared/config/features";
import { copy } from "@/shared/copy/es";

export const metadata: Metadata = {
  title: { default: copy.admin.brand, template: `%s · ${copy.admin.brand}` },
  robots: { index: false },
};

export default async function AdminLayout({ children, modal }: LayoutProps<"/admin">) {
  if (!FEATURES.admin) notFound();
  // Visitors go to /login, users without a role go to onboarding, anyone who is not an admin gets not-found.
  // Layouts do not re-run on every navigation, so each page checks the role again before reading data.
  const session = await requireRole(["admin"]);
  const [editions, modules, levels] = await Promise.all([loadEditionSwitch(session), moduleSwitches(), sectionLevels(session)]);
  const live = editions?.choices.find((choice) => choice.isPublic) ?? null;

  return (
    <AdminShell
      items={adminNavItems((module) => modules[module], levels)}
      readOnly={readOnlyAreas(levels)}
      account={session.displayName ?? copy.admin.accountLabel}
      accountActions={<SignOutButton />}
      edition={editions?.current ? <EditionSwitcher choices={editions.choices} current={editions.current} choose={chooseWorkingEditionAction} /> : null}
      notice={editions?.current ? <WorkingEditionNotice current={editions.current} live={live} choose={chooseWorkingEditionAction} /> : null}
    >
      {children}
      {/* A create or edit screen opened from its list shows here, in a modal over the list (see @modal). */}
      {modal}
    </AdminShell>
  );
}
