import type { ReactNode } from "react";
import { SignOutButton } from "@/features/auth";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { BottomNav, BrandMark, SpaceBackground, ThemeToggle, type BottomNavItem } from "@/shared/ui";

// "Puestos" is /staff and everything under it that serves a station; the ticket change and the staff's code are tabs of their own.
const START: BottomNavItem[] = [{ href: ROUTES.staff, label: copy.staff.nav.stations, icon: "flag", exclude: [ROUTES.staffTickets, ROUTES.teamCode] }];
const END: BottomNavItem[] = [{ href: ROUTES.teamCode, label: copy.staff.nav.code, icon: "person" }];

/**
 * Frame of the staff screens: the brand and who is signed in with the way out, then the page, and the same kind of bottom
 * bar the cadets have (a side rail from 760px): the stations, the ticket change in the middle (it scans a cadet's QR) and
 * the staff's own code. Each station's page still offers the way back to the list.
 */
export function StaffShell({ account, children }: { account: string | null; children: ReactNode }) {
  return (
    <>
      <SpaceBackground />
      <div className="pb-[calc(6rem+env(safe-area-inset-bottom))] min-[760px]:pb-0 min-[760px]:pl-24">
        <div className="px-space-4 pt-safe-space-4 pb-safe-space-4 mx-auto w-full max-w-[760px]">
          <header className="gap-space-4 mb-space-6 flex flex-wrap items-center justify-between">
            <div className="min-w-0">
              <div className="gap-space-3 flex items-center">
                <BrandMark />
                <ThemeToggle />
              </div>
              <p className="type-label text-accent mt-space-2">{copy.staff.brand}</p>
            </div>
            <div className="gap-space-2 flex min-w-[160px] flex-col">
              <p className="type-body-sm text-muted-foreground truncate" aria-label={copy.staff.accountLabel}>
                {account ?? copy.staff.accountLabel}
              </p>
              <SignOutButton />
            </div>
          </header>
          <main>{children}</main>
        </div>
      </div>
      <BottomNav label={copy.staff.nav.label} start={START} action={{ href: ROUTES.staffTickets, label: copy.staff.nav.tickets, icon: "qr" }} end={END} />
    </>
  );
}
