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

/** A tab is current by its path: the query it opens with (`?vista=agenda`) is not part of `usePathname`. */
const isActive = (pathname: string | null, href: string) => {
  const path = href.split("?")[0];
  return pathname === path || (pathname !== null && pathname.startsWith(`${path}/`));
};

function Tab({ item, pathname }: { item: BottomNavItem; pathname: string | null }) {
  const active = isActive(pathname, item.href);
  return (
    <li className="relative flex-1 min-[760px]:flex-none">
      {active ? (
        // A yellow mark over the bar's line (a vertical one on the side rail). A fill, not text: the bright yellow is fine here.
        <span
          aria-hidden="true"
          className="bg-gold absolute inset-x-4 -top-[11px] h-1 rounded-full min-[760px]:inset-x-auto min-[760px]:top-2 min-[760px]:-right-[10px] min-[760px]:bottom-2 min-[760px]:h-auto min-[760px]:w-1"
        />
      ) : null}
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "gap-space-1 type-caption focus-visible:ring-ring flex min-h-12 flex-col items-center justify-center rounded-md px-2 py-1 transition-colors focus-visible:ring-[3px] focus-visible:outline-none",
          // The current tab's icon and label are yellow. As text the yellow is `gold-ink`: the bright one is 1.7:1 on the light canvas.
          active ? "text-gold-ink font-semibold" : "text-muted-foreground hover:text-foreground",
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
 * Main navigation of the attendee app: a bottom bar on phones with the main action centered on the bar's top line
 * (half above it, half inside, with a ring of the bar's color that cuts the line around it), and a side rail from
 * 760px (Design System). The bar has a solid fill; the blur is only an extra where the browser supports it, so the
 * contrast never depends on it. Every target is at least 48px.
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
        "bg-surface border-ink fixed inset-x-0 bottom-0 z-40 border-t-2",
        "supports-[backdrop-filter]:bg-surface/90 supports-[backdrop-filter]:backdrop-blur",
        "min-[760px]:inset-y-0 min-[760px]:right-auto min-[760px]:w-24 min-[760px]:border-t-0 min-[760px]:border-r-2",
      )}
    >
      <ul
        className={cn(
          // At least half a rem below the tabs even where the phone reports no inset (Android's gesture bar, a desktop window).
          "px-space-2 flex items-end justify-around pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]",
          "min-[760px]:h-full min-[760px]:flex-col min-[760px]:items-stretch min-[760px]:justify-center min-[760px]:gap-6 min-[760px]:pt-0",
        )}
      >
        {Array.from({ length: startSpacers }, (_, index) => (
          <Spacer key={`start-${index}`} />
        ))}
        {start.map((item) => (
          <Tab key={item.href} item={item} pathname={pathname} />
        ))}

        {/* The slot keeps the middle free; the button hangs from the bar's line, so the bar itself stays slim. */}
        <li className="relative w-16 shrink-0 self-stretch min-[760px]:w-auto min-[760px]:flex-none min-[760px]:self-auto">
          <Link
            href={action.href}
            aria-current={actionActive ? "page" : undefined}
            aria-label={action.label}
            className={cn(
              "bg-gold text-on-accent border-ink hover:bg-pastel-yellow focus-visible:ring-ring grid size-16 place-items-center rounded-full border-2 transition-[background-color,scale] focus-visible:ring-[3px] focus-visible:outline-none active:scale-95",
              // The ring is the bar's own color: it hides the line behind the button, like a notch.
              "ring-surface absolute top-[-9px] left-1/2 -translate-x-1/2 -translate-y-1/2 ring-[6px]",
              "min-[760px]:static min-[760px]:mx-auto min-[760px]:translate-x-0 min-[760px]:translate-y-0 min-[760px]:ring-0",
              // Its own screen is open: the fill turns the pastel yellow (the ring is taken by the notch).
              actionActive && "bg-pastel-yellow",
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
