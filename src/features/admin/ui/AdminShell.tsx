"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { copy } from "@/shared/copy/es";
import { cn } from "@/shared/lib/utils";
import { BrandMark, SpaceBackground } from "@/shared/ui";

export interface AdminNavItem {
  href: string;
  label: string;
  /** Match the path exactly (the home item), instead of any path below it. */
  exact?: boolean;
}

export interface AdminShellProps {
  items: readonly AdminNavItem[];
  /** The signed-in admin, shown under the navigation. */
  account: ReactNode;
  /** Controls placed next to the account (sign out). Composed by the app shell so this feature stays independent. */
  accountActions?: ReactNode;
  /** Which edition the control center works in (a picker), under the brand. Composed by the app shell. */
  edition?: ReactNode;
  /** A line above every screen (for example, that the edition being prepared is not the one in course). */
  notice?: ReactNode;
  /** Areas the person may only look at: their screens show with every control switched off. */
  readOnly?: readonly string[];
  children: ReactNode;
}

const isActive = (pathname: string | null, item: AdminNavItem) =>
  pathname === item.href || (!item.exact && pathname !== null && pathname.startsWith(`${item.href}/`));

/**
 * Frame of the admin area. Phones get the navigation as a scrollable row above the content; from
 * 760px it becomes a side rail (Design System). Each item is a plain link, so it works without
 * scripts, and the current one is marked for assistive tech.
 */
export function AdminShell({ items, account, accountActions, edition, notice, readOnly = [], children }: AdminShellProps) {
  const pathname = usePathname();
  const viewOnly = readOnly.some((href) => pathname === href || pathname?.startsWith(`${href}/`));

  return (
    <>
      <SpaceBackground />
      <div className="mx-auto w-full min-[760px]:grid min-[760px]:max-w-[1120px] min-[760px]:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="print:hidden pt-safe px-space-4 py-space-4 min-[760px]:py-space-8 min-[760px]:sticky min-[760px]:top-0 min-[760px]:h-dvh min-[760px]:overflow-y-auto">
          <div className="gap-space-4 flex flex-col min-[760px]:h-full">
            <BrandMark />
            <p className="type-label text-accent">{copy.admin.brand}</p>
            {edition}

            <nav aria-label={copy.admin.navLabel}>
              <ul className="gap-space-2 -mx-space-1 px-space-1 flex overflow-x-auto pb-1 min-[760px]:flex-col min-[760px]:overflow-visible">
                {items.map((item) => {
                  const active = isActive(pathname, item);
                  return (
                    <li key={item.href} className="shrink-0">
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "type-label px-space-4 focus-visible:ring-ring flex h-12 items-center rounded-md border transition-colors focus-visible:ring-[3px] focus-visible:outline-none",
                          active
                            ? "border-primary bg-surface-raised text-foreground"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground border-transparent",
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="gap-space-3 border-border pt-space-4 flex flex-col border-t min-[760px]:mt-auto">
              <p className="type-body-sm text-muted-foreground truncate" aria-label={copy.admin.accountLabel}>
                {account}
              </p>
              {accountActions}
            </div>
          </div>
        </aside>

        <main className="px-space-4 pb-safe py-space-6 min-[760px]:py-space-8 min-w-0">
          {notice}
          {viewOnly ? (
            <>
              <p role="note" className="type-body-sm border-line-strong bg-surface text-muted-foreground p-space-3 mb-space-6 rounded-md border">
                {copy.admin.viewOnly}
              </p>
              {/* A disabled fieldset switches off every control inside (links still navigate); the server refuses changes anyway. */}
              <fieldset disabled className="contents">
                {children}
              </fieldset>
            </>
          ) : (
            children
          )}
        </main>
      </div>
    </>
  );
}
