import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { ButtonLink, Card, Icon } from "@/shared/ui";

export interface TeamPlayCalloutProps {
  /** `toTeam`: on a cadet's home, the way to the team screen. `toCadet` and `join`: on a team screen, the way to the cadet panel or to sign up. */
  kind: "toTeam" | "toCadet" | "join";
  /** Where it leads. */
  href: string;
  /** For `toTeam`: the team role's name, as the app says it (Staff, Admin). */
  role?: string;
}

/** A team account that also plays: one card on each side so it can go from the cadet's home to its team screen and back. */
export function TeamPlayCallout({ kind, href, role }: TeamPlayCalloutProps) {
  const t = copy.teamPlay[kind];
  return (
    <Card aria-label={t.label} role="region" className="gap-space-3 border-violet flex flex-col">
      <div className="gap-space-3 flex items-start">
        <span aria-hidden="true" className="bg-bg-deep border-border text-violet-soft-ink grid size-12 shrink-0 place-items-center rounded-md border">
          <Icon name={kind === "join" ? "play" : "users"} size={24} />
        </span>
        <div className="gap-space-1 flex min-w-0 flex-col">
          <p className="type-label text-foreground break-words">{kind === "toTeam" ? interpolate(copy.teamPlay.toTeam.title, { role: role ?? "" }) : t.title}</p>
          <p className="type-body-sm text-muted-foreground">{t.body}</p>
        </div>
      </div>
      <ButtonLink href={href} className="self-stretch">
        {t.open}
      </ButtonLink>
    </Card>
  );
}
