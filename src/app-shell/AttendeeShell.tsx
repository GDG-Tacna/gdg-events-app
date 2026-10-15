import type { ReactNode } from "react";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { BottomNav, type BottomNavItem } from "@/shared/ui";
import { moduleOn } from "./modules.server";

/**
 * Frame of the attendee screens that come after onboarding (dashboard, scanner, map): the page, and the main
 * navigation with the scanner in the middle. It makes room for the bar (below it on phones, beside it from
 * 760px). Onboarding and the squad reveal do not use it: they happen before the attendee has an app to move around.
 * Tabs join as their phase ships: Misiones next to Inicio and Mapa on the right (phase 3), Logros after Mapa (phase 4).
 * A tab shows only while its module is on for the edition.
 */
export async function AttendeeShell({ children }: { children: ReactNode }) {
  const start: BottomNavItem[] = [
    { href: ROUTES.dashboard, label: copy.nav.home, icon: "home" },
    ...((await moduleOn("missions")) ? [{ href: ROUTES.missions, label: copy.nav.missions, icon: "target" } as const] : []),
  ];
  const end: BottomNavItem[] = [
    ...((await moduleOn("map")) ? [{ href: ROUTES.map, label: copy.nav.map, icon: "map" } as const] : []),
    ...((await moduleOn("achievements")) ? [{ href: ROUTES.achievements, label: copy.nav.achievements, icon: "trophy" } as const] : []),
  ];

  return (
    <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] min-[760px]:pb-0 min-[760px]:pl-24">
      {children}
      <BottomNav
        label={copy.nav.label}
        start={start}
        action={{ href: ROUTES.scan, label: copy.nav.scan, icon: "qr" }}
        end={end}
      />
    </div>
  );
}
