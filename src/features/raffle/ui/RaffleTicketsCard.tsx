import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { Card, PixelCoin } from "@/shared/ui";
import type { CadetTickets } from "../domain/raffle";

/** The cadet's tickets for the final raffle, what they still need to enter, or the prize they won. */
export function RaffleTicketsCard({ tickets }: { tickets: CadetTickets }) {
  const t = copy.raffle.card;
  const missing = tickets.minCredits - tickets.tickets;
  const status =
    tickets.won.length > 0
      ? interpolate(t.won, { prize: tickets.won.join(", ") })
      : missing > 0
        ? interpolate(t.belowMin, { min: formatNumber(tickets.minCredits), missing: formatNumber(missing) })
        : !tickets.eligible
          ? t.drawnOut
          : null;
  return (
    <Card role="region" aria-label={t.title} className="gap-space-3 flex flex-col">
      <div className="gap-space-3 flex items-center">
        <PixelCoin scale={3} />
        <div className="gap-space-1 flex flex-col">
          <h2 className="type-title text-foreground">{t.title}</h2>
          <p className="type-label text-gold">{tickets.tickets === 1 ? t.oneTicket : interpolate(t.tickets, { n: formatNumber(tickets.tickets) })}</p>
        </div>
      </div>
      <p className="type-body-sm text-muted-foreground">{t.howItWorks}</p>
      {status ? <p className={tickets.won.length > 0 ? "type-label text-accent" : "type-body-sm text-foreground"}>{status}</p> : null}
    </Card>
  );
}
