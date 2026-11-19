import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { type TicketType } from "../domain/ticket";

/** Premium gold, Pro violet, General neutral: the border says it, the text stays readable on the surface. */
const CHIP_CLASSES: Record<TicketType, string> = {
  premium: "border-gold bg-gold/10 text-gold",
  pro: "border-violet bg-violet/10 text-violet-soft",
  general: "border-line-strong text-foreground",
};

export function ticketName(type: TicketType): string {
  return copy.tickets.names[type];
}

/** "Entrada Premium" as a pill. */
export function TicketChip({ type, className }: { type: TicketType; className?: string }) {
  return (
    <span className={cn("type-caption px-space-2 inline-flex w-fit max-w-full items-center rounded-full border py-0.5 font-semibold tracking-wider uppercase", CHIP_CLASSES[type], className)}>
      {interpolate(copy.tickets.chip, { name: ticketName(type) })}
    </span>
  );
}

/** What the ticket includes ("Incluye certificado y almuerzo"), or `null` for a ticket that includes nothing extra. */
export function ticketIncludes(type: TicketType): string | null {
  return copy.tickets.includes[type];
}

/** The chip with, under it, what the ticket includes (nothing for General). */
export function TicketBadge({ type, className, align = "start" }: { type: TicketType; className?: string; align?: "start" | "center" }) {
  const includes = ticketIncludes(type);
  return (
    <div className={cn("gap-space-1 flex flex-col", align === "center" ? "items-center text-center" : "items-start", className)}>
      <TicketChip type={type} />
      {includes ? <span className="type-caption text-text-subtle">{includes}</span> : null}
    </div>
  );
}
