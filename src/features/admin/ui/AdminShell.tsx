"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { BrandMark, Icon, SpaceBackground, type IconName } from "@/shared/ui";

export interface AdminNavItem {
  href: string;
  label: string;
  /** Match the path exactly (the home item), instead of any path below it. */
  exact?: boolean;
  /** The menu group it belongs to (consecutive items of a group show together under its name); none for the home. */
  group?: string;
  /** Its line icon, the same as on the home shortcuts. */
  icon?: IconName;
}

export interface AdminShellProps {
  items: readonly AdminNavItem[];
  /** The signed-in admin, shown under the navigation. */
  account: ReactNode;
  /** Controls placed next to the account (sign out). Composed by the app shell so this feature stays independent. */
  accountActions?: ReactNode;
  /** The account's photo (Google's), shown as its avatar; its initial when there is none. */
  accountPhotoUrl?: string | null;
  /** A compact sign out for phones, at the top next to the avatar (the full one stays in the side rail). */
  compactAccountActions?: ReactNode;
  /** Which edition the control center works in (a picker), under the brand. Composed by the app shell. */
  edition?: ReactNode;
  /** A line above every screen (for example, that the edition being prepared is not the one in course). */
  notice?: ReactNode;
  /** Areas the person may only look at: their screens show with every control switched off. */
  readOnly?: readonly string[];
  children: ReactNode;
}

/** The account's photo, or the first letter of its name on a disc. Decoration: the name is always written next to it. */
function AccountAvatar({ name, photoUrl }: { name: ReactNode; photoUrl?: string | null }) {
  if (photoUrl) {
    // Google's photo: a plain image (no optimizer round trip), without sending the app's address along.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" referrerPolicy="no-referrer" className="border-line-strong size-10 shrink-0 rounded-full border object-cover" />;
  }
  const initial = typeof name === "string" ? name.trim().charAt(0).toUpperCase() : "";
  return (
    <span aria-hidden="true" className="bg-bg-deep border-line-strong type-label text-cyan grid size-10 shrink-0 place-items-center rounded-full border">
      {initial || "·"}
    </span>
  );
}

const isActive = (pathname: string | null, item: AdminNavItem) =>
  pathname === item.href || (!item.exact && pathname !== null && pathname.startsWith(`${item.href}/`));

/** Consecutive items of the same group, in order; items without a group form their own run. */
function groupsOf(items: readonly AdminNavItem[]): Array<{ label: string | null; items: AdminNavItem[] }> {
  const groups: Array<{ label: string | null; items: AdminNavItem[] }> = [];
  for (const item of items) {
    const label = item.group ?? null;
    const last = groups.at(-1);
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/**
 * Frame of the admin area. The menu is grouped by what each area is for, each group foldable. From 760px it is a side
 * rail (Design System); on phones it hides behind a "Menú" button that names the current area, so the screen starts
 * with its content. Each item is a plain link and the current one is marked for assistive tech.
 */
export function AdminShell({ items, account, accountActions, accountPhotoUrl, compactAccountActions, edition, notice, readOnly = [], children }: AdminShellProps) {
  const pathname = usePathname();
  const viewOnly = readOnly.some((href) => pathname === href || pathname?.startsWith(`${href}/`));
  const [menuOpen, setMenuOpen] = useState(false);
  const current = items.find((item) => isActive(pathname, item));

  const link = (item: AdminNavItem) => {
    const active = isActive(pathname, item);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          onClick={() => setMenuOpen(false)}
          className={cn(
            // 48px touch targets on phones; the desktop rail is denser so the whole menu fits.
            "type-label gap-space-3 px-space-3 focus-visible:ring-ring flex h-12 items-center rounded-md border transition-colors focus-visible:ring-[3px] focus-visible:outline-none min-[760px]:h-10",
            active ? "border-primary bg-surface-raised text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground border-transparent",
          )}
        >
          {item.icon ? <Icon name={item.icon} size={18} className={cn("shrink-0", active ? "text-primary" : "text-text-subtle")} /> : null}
          <span className="min-w-0 truncate">{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <>
      <SpaceBackground />
      <div className="mx-auto w-full min-[760px]:grid min-[760px]:max-w-[1120px] min-[760px]:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="print:hidden px-space-4 pt-safe-space-4 pb-space-4 min-[760px]:pt-safe-space-8 min-[760px]:pb-space-8 min-[760px]:sticky min-[760px]:top-0 min-[760px]:h-dvh min-[760px]:overflow-y-auto">
          <div className="gap-space-4 flex flex-col min-[760px]:h-full">
            <div className="gap-space-3 flex items-start justify-between">
              <BrandMark />
              {/* On phones the account sits at the top: its avatar and an icon to sign out. */}
              <div className="gap-space-2 flex shrink-0 items-center min-[760px]:hidden">
                <AccountAvatar name={account} photoUrl={accountPhotoUrl} />
                {compactAccountActions}
              </div>
            </div>
            <p className="type-label text-accent">{copy.admin.brand}</p>
            {edition}

            <nav aria-label={copy.admin.navLabel}>
              <button
                type="button"
                aria-expanded={menuOpen}
                aria-controls="admin-menu"
                onClick={() => setMenuOpen((open) => !open)}
                className="border-line-strong bg-bg-deep text-foreground hover:bg-secondary focus-visible:ring-ring gap-space-3 px-space-4 type-label flex h-12 w-full items-center rounded-md border focus-visible:ring-[3px] focus-visible:outline-none min-[760px]:hidden"
              >
                <Icon name={menuOpen ? "close" : "menu"} size={20} />
                <span className="min-w-0 truncate">{current ? interpolate(copy.admin.menuCurrent, { current: current.label }) : copy.admin.menu}</span>
              </button>
              <div id="admin-menu" className={cn("gap-space-3 flex-col min-[760px]:flex", menuOpen ? "mt-space-3 flex" : "hidden")}>
                {groupsOf(items).map((group) =>
                  group.label === null ? (
                    <ul key={group.items[0].href} className="gap-space-1 flex flex-col">
                      {group.items.map(link)}
                    </ul>
                  ) : (
                    <details key={group.label} open className="group/menu">
                      <summary className="type-caption text-text-subtle hover:text-foreground focus-visible:ring-ring gap-space-2 px-space-3 flex h-10 cursor-pointer list-none items-center rounded-md font-semibold tracking-wider uppercase focus-visible:ring-[3px] focus-visible:outline-none min-[760px]:h-9 [&::-webkit-details-marker]:hidden">
                        <Icon name="right" size={14} className="shrink-0 transition-transform group-open/menu:rotate-90" />
                        {group.label}
                      </summary>
                      {/* The group's areas hang from a guide line under its name, so they read as inside it. */}
                      <ul className="gap-space-1 border-line-strong/60 ml-[19px] pl-space-2 flex flex-col border-l min-[760px]:gap-0.5">{group.items.map(link)}</ul>
                    </details>
                  ),
                )}
              </div>
            </nav>

            <div className="gap-space-3 border-border pt-space-4 hidden flex-col border-t min-[760px]:mt-auto min-[760px]:flex">
              <div className="gap-space-3 flex min-w-0 items-center">
                <AccountAvatar name={account} photoUrl={accountPhotoUrl} />
                <p className="type-body-sm text-muted-foreground min-w-0 truncate" aria-label={copy.admin.accountLabel}>
                  {account}
                </p>
              </div>
              {accountActions}
            </div>
          </div>
        </aside>

        <main className="px-space-4 pt-space-6 pb-safe-space-6 min-[760px]:pt-space-8 min-[760px]:pb-safe-space-8 min-w-0">
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
