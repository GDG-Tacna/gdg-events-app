"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";
import { Icon } from "./Icon";

export interface QuickCodeButtonProps {
  /** Where it leads: the team code screen. It is not shown on that screen itself. */
  href: string;
  /** What it says («Mi QR»). */
  label: string;
  /** Its accessible name («Mostrar mi código»). */
  accessibleLabel: string;
  /** Moves it up when something sits at the bottom of the screen (a bottom bar on phones). */
  className?: string;
}

/**
 * The team code button that always goes with an admin, an organizer or staff: a pill in the design's primary color
 * (solid ink, 56px) floating at the bottom right, within the safe-area insets, over the content and under dialogs. One
 * tap opens the code a cadet scans to meet them. It hides on the code's own screen, where it would lead to itself.
 */
export function QuickCodeButton({ href, label, accessibleLabel, className }: QuickCodeButtonProps) {
  const pathname = usePathname();
  if (pathname === href) return null;
  return (
    <Link
      href={href}
      aria-label={accessibleLabel}
      className={cn(
        "bg-ink text-on-ink border-ink focus-visible:ring-ring type-label print:hidden fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex h-14 items-center gap-2 rounded-full border-2 px-5 text-base font-bold focus-visible:ring-[3px] focus-visible:outline-none",
        className,
      )}
    >
      <Icon name="qr" size={22} />
      {label}
    </Link>
  );
}
