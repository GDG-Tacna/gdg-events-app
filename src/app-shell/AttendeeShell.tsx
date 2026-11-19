import type { ReactNode } from "react";
import { SignOutButton } from "@/features/auth";
import { FEATURES } from "@/shared/config/features";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { BottomNav, BrandMark, ThemeToggle, type BottomNavItem } from "@/shared/ui";
import { moduleOn } from "./modules.server";

/**
 * Frame of the attendee screens that come after onboarding (dashboard, scanner, map): the page, and the main
 * navigation with the scanner in the middle. It makes room for the bar (below it on phones, beside it from
 * 760px). Onboarding and the squad reveal do not use it: they happen before the attendee has an app to move around.
 * Tabs join as their phase ships: Misiones next to Inicio and Mapa on the right (phase 3), Logros after Mapa (phase 4).
 * A tab shows only while its module is on for the edition.
 *
 * Every tab starts with the same header: the event's brand and the way out, so the cadet can sign out from any view.
 * It stays on top while the page scrolls, like a phone app's bar, over a solid fill (the blur is only an extra). It
 * keeps the phone's top inset, so the pages below it only add their own spacing.
 */
export async function AttendeeShell({ children }: { children: ReactNode }) {
  const start: BottomNavItem[] = [
    { href: ROUTES.dashboard, label: copy.nav.home, icon: "home" },
    ...((await moduleOn("missions")) ? [{ href: ROUTES.missions, label: copy.nav.missions, icon: "target" } as const] : []),
  ];
  const end: BottomNavItem[] = [
    // Without the map the talks' agenda keeps its own tab (talks are part of the core).
    ...((await moduleOn("map"))
      ? [{ href: ROUTES.map, label: copy.nav.map, icon: "map" } as const]
      : FEATURES.checkins
        ? [{ href: `${ROUTES.map}?vista=agenda`, label: copy.nav.agenda, icon: "calendar" } as const]
        : []),
    ...((await moduleOn("achievements")) ? [{ href: ROUTES.achievements, label: copy.nav.achievements, icon: "trophy" } as const] : []),
  ];

  return (
    <div className="pb-[calc(6rem+env(safe-area-inset-bottom))] min-[760px]:pb-0 min-[760px]:pl-24">
      <header className="bg-surface border-border pt-safe sticky top-0 z-30 border-b supports-[backdrop-filter]:bg-surface/90 supports-[backdrop-filter]:backdrop-blur">
        <div className="px-space-4 py-space-2 gap-space-3 mx-auto flex w-full max-w-[520px] items-center justify-between min-[760px]:max-w-[880px]">
          <BrandMark compact />
          <div className="gap-space-2 flex shrink-0 items-center">
            <ThemeToggle />
            <SignOutButton variant="icon" />
          </div>
        </div>
      </header>
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
