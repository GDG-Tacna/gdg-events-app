import type { ReactNode } from "react";
import { SignOutButton } from "@/features/auth";
import { copy } from "@/shared/copy/es";
import { BrandMark, SpaceBackground } from "@/shared/ui";

/**
 * Frame of the staff screens: the brand and who is signed in with the way out, then the page. There is no
 * navigation: staff do one job at a time (pick a serving point, then serve), and the page offers the way back.
 */
export function StaffShell({ account, children }: { account: string | null; children: ReactNode }) {
  return (
    <>
      <SpaceBackground />
      <div className="px-space-4 pt-safe-space-4 pb-safe-space-4 mx-auto w-full max-w-[760px]">
        <header className="gap-space-4 mb-space-6 flex flex-wrap items-center justify-between">
          <div className="min-w-0">
            <BrandMark />
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
    </>
  );
}
