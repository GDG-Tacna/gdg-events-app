import Link from "next/link";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { Button, ButtonLink, Card } from "@/shared/ui";
import type { CadetRow } from "./actions";

export interface CadetsListViewProps {
  cadets: readonly CadetRow[];
  /** How many cadets the edition has in all. */
  total: number;
  /** What the search box holds now. */
  search: string;
  /** The address of the next page, or `null` at the end. */
  nextHref: string | null;
  /** Plain paths (a view cannot receive functions from a server page): a cadet opens at `${detailBase}/${uid}`. */
  hrefs: { list: string; detailBase: string };
}

const chip = "type-caption border-line-strong text-foreground px-space-3 rounded-full border py-1";

/**
 * The Cadetes screen: everyone registered in the edition, by alias, with a search by the start of the alias and a link
 * to each one's page. It only shows (the search is a plain form, the next page a plain link): no state, no client code.
 */
export function CadetsListView({ cadets, total, search, nextHref, hrefs }: CadetsListViewProps) {
  const t = copy.admin.cadets;
  return (
    <div className="gap-space-6 flex flex-col">
      <header className="gap-space-1 flex flex-col">
        <h1 className="type-title-xl text-foreground">{t.title}</h1>
        <p className="type-body text-muted-foreground">{interpolate(t.subtitle, { n: formatNumber(total) })}</p>
      </header>

      <form action={hrefs.list} method="get" role="search" className="gap-space-2 flex">
        <div className="gap-space-2 flex min-w-0 flex-1 flex-col">
          <label htmlFor="cadet-search" className="type-label text-foreground">
            {t.searchLabel}
          </label>
          <input
            id="cadet-search"
            name="q"
            type="search"
            defaultValue={search}
            maxLength={40}
            autoComplete="off"
            placeholder={t.searchPlaceholder}
            className="type-body bg-bg-deep text-foreground border-line-strong focus-visible:ring-ring h-12 w-full min-w-0 rounded-md border px-4 text-base focus-visible:ring-[3px] focus-visible:outline-none"
          />
        </div>
        <Button type="submit" className="self-end">
          {t.search}
        </Button>
      </form>

      {cadets.length === 0 ? (
        <Card>
          <p className="type-body text-muted-foreground">{search ? interpolate(t.noResults, { q: search }) : t.empty}</p>
          {search ? (
            <ButtonLink href={hrefs.list} variant="ghost" size="sm" className="mt-space-2 self-start">
              {t.clear}
            </ButtonLink>
          ) : null}
        </Card>
      ) : (
        <ul aria-label={t.listLabel} className="gap-space-3 flex flex-col">
          {cadets.map((cadet) => (
            <li key={cadet.uid}>
              <Card className="gap-space-2 has-[a:focus-visible]:ring-ring relative flex flex-wrap items-center justify-between has-[a:focus-visible]:ring-[3px]">
                <div className="min-w-0 flex-1">
                  <p className="type-label text-foreground truncate">
                    {/* The alias is the link; it stretches over the whole card so any tap opens the cadet. */}
                    <Link href={`${hrefs.detailBase}/${cadet.uid}`} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none">
                      {cadet.alias}
                    </Link>
                  </p>
                  <p className="type-caption text-muted-foreground">
                    {cadet.squadName ?? t.noSquad} · {interpolate(t.xp, { xp: formatNumber(cadet.xp) })}
                  </p>
                </div>
                <div className="gap-space-2 flex shrink-0 flex-wrap items-center">
                  {cadet.banned ? <span className={`${chip} border-danger text-danger`}>{t.banned}</span> : null}
                  <span className={chip}>{cadet.attended ? t.attended : t.notArrived}</span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {nextHref ? (
        <ButtonLink href={nextHref} variant="secondary" className="self-start">
          {t.more}
        </ButtonLink>
      ) : null}
    </div>
  );
}
