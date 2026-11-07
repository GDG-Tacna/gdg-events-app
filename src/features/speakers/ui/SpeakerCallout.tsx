import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { ButtonLink, Card, Icon } from "@/shared/ui";

export interface SpeakerCalloutProps {
  /** The speaker's name as the edition lists it. */
  name: string;
  /** The speaker's code screen. */
  href: string;
}

/** On a cadet's home, for an account linked to a speaker: the way to their own code (speakers also play here). */
export function SpeakerCallout({ name, href }: SpeakerCalloutProps) {
  const t = copy.speakerHome.callout;
  return (
    <Card aria-label={t.label} role="region" className="gap-space-3 border-violet flex flex-col">
      <div className="gap-space-3 flex items-start">
        <span aria-hidden="true" className="bg-bg-deep border-border text-violet-soft grid size-12 shrink-0 place-items-center rounded-md border">
          <Icon name="qr" size={24} />
        </span>
        <div className="gap-space-1 flex min-w-0 flex-col">
          <p className="type-label text-foreground break-words">{interpolate(t.title, { name })}</p>
          <p className="type-body-sm text-muted-foreground">{t.body}</p>
        </div>
      </div>
      <ButtonLink href={href} className="self-stretch">
        {t.open}
      </ButtonLink>
    </Card>
  );
}
