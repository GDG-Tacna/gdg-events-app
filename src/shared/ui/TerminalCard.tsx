import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { Icon, type IconName } from "./Icon";

export interface TerminalCardProps {
  icon: IconName;
  title: string;
  body: ReactNode;
  /** A short status chip next to the title ("Listo"). */
  badge?: string;
  /** A pixel game tag next to the title ("+500 XP"). */
  tag?: string;
  /** Gold for the main call to action (missions); cyan otherwise. */
  tone?: "cyan" | "gold";
  /**
   * Where the card leads. "button" shows a full-width call to action under the text; "chevron" makes the whole card
   * a link with an arrow on the right.
   */
  action: { href: string; label: string; kind: "button" | "chevron" };
}

const TONES = {
  cyan: { card: "border-cyan/45 from-surface to-bg-violet/40", tile: "border-cyan/40 text-cyan", title: "text-foreground" },
  gold: { card: "border-gold/70 from-gold/10 to-surface", tile: "border-gold/60 text-gold", title: "text-gold" },
} as const;

/**
 * One entry of the dashboard's "Terminal de misión": an icon tile, an uppercase title with an optional status chip or
 * game tag, a line of text and where it leads. The frame stays modern (never pixel art); only the tag uses the pixel font.
 */
export function TerminalCard({ icon, title, body, badge, tag, tone = "cyan", action }: TerminalCardProps) {
  const t = TONES[tone];
  const content = (
    <>
      <span aria-hidden="true" className={cn("bg-bg-deep grid size-12 shrink-0 place-items-center rounded-md border", t.tile)}>
        <Icon name={icon} size={22} />
      </span>
      <span className="gap-space-1 flex min-w-0 flex-1 flex-col">
        <span className="gap-space-2 flex flex-wrap items-center">
          <span className={cn("type-label tracking-wide uppercase", t.title)}>{title}</span>
          {badge ? <span className="type-caption border-lime/60 text-lime rounded-sm border px-1.5 tracking-wider uppercase">{badge}</span> : null}
          {tag ? <span className="type-pixel-tag border-gold/60 text-gold bg-gold/10 rounded-sm border px-1.5 text-[14px] leading-5">{tag}</span> : null}
        </span>
        <span className="type-body-sm text-muted-foreground">{body}</span>
      </span>
    </>
  );
  const frame = cn("bg-gradient-to-br shadow-card rounded-lg border p-space-4", t.card);

  if (action.kind === "chevron") {
    return (
      <Link
        href={action.href}
        className={cn(frame, "gap-space-3 hover:border-cyan focus-visible:ring-ring flex items-center focus-visible:ring-[3px] focus-visible:outline-none")}
      >
        {content}
        <span aria-hidden="true" className={cn("border-line-strong grid size-10 shrink-0 place-items-center rounded-md border", tone === "gold" ? "text-gold" : "text-cyan")}>
          <Icon name="right" size={20} />
        </span>
      </Link>
    );
  }
  return (
    <section aria-label={title} className={cn(frame, "gap-space-4 flex flex-col")}>
      <div className="gap-space-3 flex items-start">{content}</div>
      <Link
        href={action.href}
        className="type-label from-primary to-cyan text-primary-foreground focus-visible:ring-ring gap-space-2 inline-flex h-12 items-center justify-center rounded-md bg-gradient-to-r tracking-wide uppercase focus-visible:ring-[3px] focus-visible:outline-none"
      >
        {action.label}
        <Icon name="right" size={18} />
      </Link>
    </section>
  );
}
