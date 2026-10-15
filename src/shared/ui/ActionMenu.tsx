"use client";

import Link from "next/link";
import { Icon, type IconName } from "./Icon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./primitives/dropdown-menu";

export interface ActionMenuProps {
  /** Accessible name (and tooltip) of the icon button that opens it. */
  label: string;
  icon: IconName;
  /** A small heading at the top of the open menu. */
  title: string;
  /** Each entry leads somewhere. */
  items: ReadonlyArray<{ href: string; label: string; icon: IconName }>;
}

/**
 * Project adapter over the shadcn dropdown menu (Radix): a 48 px icon button that opens a list of links. Keyboard,
 * focus and screen reader support come from Radix.
 */
export function ActionMenu({ label, icon, title, items }: ActionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        title={label}
        className="border-cyan/50 bg-bg-deep text-cyan hover:bg-secondary focus-visible:ring-ring data-[state=open]:border-cyan inline-grid size-12 place-items-center rounded-md border focus-visible:ring-[3px] focus-visible:outline-none"
      >
        <Icon name={icon} size={22} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="bg-surface border-line-strong min-w-56 rounded-md">
        <DropdownMenuLabel className="type-caption text-text-subtle tracking-wider uppercase">{title}</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border" />
        {items.map((item) => (
          <DropdownMenuItem key={item.href} asChild className="type-label text-foreground focus:bg-secondary focus:text-foreground gap-space-3 h-12 cursor-pointer">
            <Link href={item.href}>
              <Icon name={item.icon} size={18} className="text-cyan" />
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
