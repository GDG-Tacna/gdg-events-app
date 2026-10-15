import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StaffShell } from "@/app-shell/StaffShell";
import { requireRole } from "@/app-shell/guards";
import { FEATURES } from "@/shared/config/features";
import { copy } from "@/shared/copy/es";

export const metadata: Metadata = {
  title: { default: copy.staff.brand, template: `%s · ${copy.staff.brand}` },
  robots: { index: false },
};

export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  if (!FEATURES.checkins) notFound();
  // Visitors go to /login, users without a role go to onboarding, attendees get not-found; admins may enter too.
  // Layouts do not re-run on every navigation, so each page checks the role again before reading data.
  const session = await requireRole(["staff"]);

  return <StaffShell account={session.displayName}>{children}</StaffShell>;
}
