import { copy } from "@/shared/copy/es";
import { ButtonLink } from "./ButtonLink";
import { MedalArt } from "./MedalArt";

export interface UnlockedBadgesProps {
  /** Badges a scan or a mission just unlocked; nothing is drawn when empty. */
  badges: ReadonlyArray<{ id: string; name: string; tone: string; imageUrl?: string | null }>;
  /** The Logros tab, or nothing to leave the link out. */
  href?: string;
}

/** "¡Logro desbloqueado!" with each new badge's medal and name, under a scan or a mission result. */
export function UnlockedBadges({ badges, href }: UnlockedBadgesProps) {
  if (badges.length === 0) return null;
  const t = copy.achievements.unlocked;
  return (
    <div className="border-accent/60 bg-accent/10 p-space-3 gap-space-3 flex flex-col rounded-md border">
      <p className="type-label text-foreground">{t.title}</p>
      <ul aria-label={t.label} className="gap-space-2 flex flex-col">
        {badges.map((badge) => (
          <li key={badge.id} className="gap-space-3 flex items-center">
            <MedalArt tone={badge.tone} imageUrl={badge.imageUrl} scale={2} className="shrink-0" />
            <span className="type-label text-foreground">{badge.name}</span>
          </li>
        ))}
      </ul>
      {href ? (
        <ButtonLink href={href} variant="secondary" size="sm" className="self-start">
          {t.see}
        </ButtonLink>
      ) : null}
    </div>
  );
}
