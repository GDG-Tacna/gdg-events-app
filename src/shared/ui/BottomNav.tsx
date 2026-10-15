"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";
import { Icon, type IconName } from "./Icon";

export interface BottomNavItem {
  href: string;
  label: string;
  icon: IconName;
}

export interface BottomNavProps {
  /** Accessible name of the navigation. */
  label: string;
  /** Tabs to the left of the main action. */
  start: readonly BottomNavItem[];
  /** The main action, raised in the middle of the bar. */
  action: BottomNavItem;
  /** Tabs to the right of the main action (later phases add them). */
  end?: readonly BottomNavItem[];
}

const isActive = (pathname: string | null, href: string) =>
  pathname === href || (pathname !== null && pathname.startsWith(`${href}/`));

function Tab({ item, pathname }: { item: BottomNavItem; pathname: string | null }) {
  const active = isActive(pathname, item.href);
  return (
    <li className="flex-1 min-[760px]:flex-none">
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "gap-space-1 type-caption focus-visible:ring-ring flex min-h-12 flex-col items-center justify-center rounded-md px-2 py-1 transition-colors focus-visible:ring-[3px] focus-visible:outline-none",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon name={item.icon} size={24} />
        <span>{item.label}</span>
      </Link>
    </li>
  );
}

/** Takes the room of a missing tab so the main action stays centered. Not content: hidden from assistive tech. */
function Spacer() {
  return <li aria-hidden="true" className="flex-1 min-[760px]:hidden" />;
}

/**
 * Main navigation of the attendee app: a bottom bar on phones with the main action raised in the middle,
 * and a side rail from 760px (Design System). The bar has a solid fill; the blur is only an extra where the
 * browser supports it, so the contrast never depends on it. Every target is at least 48px.
 */
export function BottomNav({ label, start, action, end = [] }: BottomNavProps) {
  const pathname = usePathname();
  const actionActive = isActive(pathname, action.href);
  // The action stays in the true middle even when one side has fewer tabs (only Inicio exists at first):
  // empty slots take the room of the missing tabs on phones. The side rail has no use for them.
  const startSpacers = Math.max(0, end.length - start.length);
  const endSpacers = Math.max(0, start.length - end.length);

  return (
    <nav
      aria-label={label}
      className={cn(
        "bg-surface border-border fixed inset-x-0 bottom-0 z-40 border-t",
        "supports-[backdrop-filter]:bg-surface/90 supports-[backdrop-filter]:backdrop-blur",
        "min-[760px]:inset-y-0 min-[760px]:right-auto min-[760px]:w-24 min-[760px]:border-t-0 min-[760px]:border-r",
      )}
    >
      <ul
        className={cn(
          "px-space-2 pb-safe flex items-end justify-around pt-1",
          "min-[760px]:h-full min-[760px]:flex-col min-[760px]:items-stretch min-[760px]:justify-center min-[760px]:gap-6 min-[760px]:pt-0",
        )}
      >
        {Array.from({ length: startSpacers }, (_, index) => (
          <Spacer key={`start-${index}`} />
        ))}
        {start.map((item) => (
          <Tab key={item.href} item={item} pathname={pathname} />
        ))}

        <li className="flex justify-center min-[760px]:flex-none">
          <Link
            href={action.href}
            aria-current={actionActive ? "page" : undefined}
            aria-label={action.label}
            className={cn(
              "bg-primary text-primary-foreground border-surface focus-visible:ring-ring shadow-card grid size-16 -translate-y-4 place-items-center rounded-full border-4 transition-transform focus-visible:ring-[3px] focus-visible:outline-none active:scale-95",
              "min-[760px]:mx-auto min-[760px]:translate-y-0",
              actionActive && "ring-primary/60 ring-2",
            )}
          >
            <Icon name={action.icon} size={30} />
          </Link>
        </li>

        {end.map((item) => (
          <Tab key={item.href} item={item} pathname={pathname} />
        ))}
        {Array.from({ length: endSpacers }, (_, index) => (
          <Spacer key={`end-${index}`} />
        ))}
      </ul>
    </nav>
  );
}
