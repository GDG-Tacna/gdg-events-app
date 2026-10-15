import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Icon } from "@/shared/ui";
import { LINK_KINDS } from "../domain/links";
import type { CadetCard } from "../domain/network";

export interface CadetCardViewProps {
  card: CadetCard;
  /** The heading level of the alias, so the card fits wherever it is placed. */
  as?: "h2" | "h3";
  className?: string;
}

/**
 * A cadet's contact card: alias, squad and the links they chose to show. Links open in a new tab, without
 * passing on who sent them (`noopener noreferrer`) and without vouching for them (`nofollow`).
 */
export function CadetCardView({ card, as: Heading = "h3", className }: CadetCardViewProps) {
  const t = copy.network.card;
  const links = LINK_KINDS.flatMap((kind) => (card.links[kind] ? [{ kind, href: card.links[kind] }] : []));
  return (
    <div className={cn("gap-space-2 flex min-w-0 flex-col", className)}>
      <div className="gap-space-2 flex flex-wrap items-center justify-between">
        <Heading className="type-title text-foreground min-w-0 break-words">{card.alias}</Heading>
        <span className="type-caption border-line-strong text-muted-foreground px-space-3 rounded-full border py-1">{card.squad ?? t.noSquad}</span>
      </div>
      {links.length > 0 ? (
        <ul className="gap-space-2 flex flex-wrap">
          {links.map(({ kind, href }) => (
            <li key={kind}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                aria-label={interpolate(t.linkLabel, { kind: t.links[kind], alias: card.alias })}
                className="type-label text-primary hover:bg-secondary focus-visible:ring-ring border-line-strong gap-space-2 px-space-3 inline-flex min-h-11 items-center rounded-md border focus-visible:ring-[3px] focus-visible:outline-none"
              >
                {t.links[kind]}
                <Icon name="external" size={16} />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
