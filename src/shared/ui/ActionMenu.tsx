"use client";

import Link from "next/link";
import { Fragment } from "react";
import { cn } from "@/shared/lib/utils";
import { Icon, type IconName } from "./Icon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./primitives/dropdown-menu";

interface ActionMenuItemBase {
  label: string;
  icon: IconName;
  /** `danger` is for what deletes: red text, and it should go last. */
  tone?: "danger";
  /** A line above the entry, to set it apart from the ones before. */
  separatorBefore?: boolean;
}

/** An entry either leads somewhere (`href`) or does something (`onSelect`). */
export type ActionMenuItem = ActionMenuItemBase & ({ href: string; onSelect?: never } | { onSelect: () => void; href?: never });

export interface ActionMenuProps {
  /** Accessible name (and tooltip) of the icon button that opens it. */
  label: string;
  icon: IconName;
  /** A small heading at the top of the open menu. */
  title: string;
  items: ReadonlyArray<ActionMenuItem>;
  /** `tile` is the soft icon tile; `pill` is the round button with a 2 px ink border that sits beside a main button. */
  variant?: "tile" | "pill";
  /** Changes the look of the icon button (merged over the variant). */
  className?: string;
  /** Blocks opening the menu (while a change is running). */
  disabled?: boolean;
}

const TRIGGER_CLASSES = {
  tile: "border-cyan/50 bg-bg-deep text-cyan-ink hover:bg-secondary data-[state=open]:border-cyan rounded-md border",
  pill: "border-ink text-foreground hover:bg-pastel-blue hover:text-on-accent rounded-full border-2 bg-transparent",
} as const;

const ITEM_CLASSES = "type-label text-foreground focus:bg-secondary focus:text-foreground gap-space-3 h-12 cursor-pointer";

/**
 * Project adapter over the shadcn dropdown menu (Radix): a 48 px icon button that opens a list of entries, each a link
 * or an action. Keyboard, focus and screen reader support come from Radix.
 */
export function ActionMenu({ label, icon, title, items, variant = "tile", className, disabled }: ActionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={label}
        title={label}
        className={cn(
          "focus-visible:ring-ring inline-grid size-12 shrink-0 place-items-center focus-visible:ring-[3px] focus-visible:outline-none",
          TRIGGER_CLASSES[variant],
          className,
        )}
      >
        <Icon name={icon} size={22} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="bg-surface border-line-strong min-w-56 rounded-md">
        <DropdownMenuLabel className="type-caption text-text-subtle tracking-wider uppercase">{title}</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border" />
        {items.map((item) => {
          const danger = item.tone === "danger";
          const content = (
            <>
              <Icon name={item.icon} size={18} className={danger ? "text-danger-ink" : "text-cyan-ink"} />
              {item.label}
            </>
          );
          return (
            <Fragment key={item.href ?? item.label}>
              {item.separatorBefore ? <DropdownMenuSeparator className="bg-border" /> : null}
              {item.href !== undefined ? (
                <DropdownMenuItem asChild className={ITEM_CLASSES}>
                  <Link href={item.href}>{content}</Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={item.onSelect} className={cn(ITEM_CLASSES, danger && "text-danger-ink focus:text-danger-ink")}>
                  {content}
                </DropdownMenuItem>
              )}
            </Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
