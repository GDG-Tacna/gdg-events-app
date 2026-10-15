import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { ButtonLink, Card } from "@/shared/ui";
import type { MinigameOffer } from "../domain/plays";

export interface MinigameOfferCardProps {
  offer: MinigameOffer;
  /** The game's screen for this mission. */
  playHref: string;
}

/**
 * Under a completed mission: "Jugar por XP x2" while the single attempt is unused, "Continuar partida" while a
 * ticket is valid, then how it went. The only glowing element of the mission screen.
 */
export function MinigameOfferCard({ offer, playHref }: MinigameOfferCardProps) {
  const t = copy.minigames;
  const xp = formatNumber(offer.xpBonus);
  return (
    <Card tone={offer.state === "available" ? "cyan" : undefined} role="region" aria-label={t.offer.label} className="gap-space-3 flex flex-col">
      <div className="gap-space-1 flex flex-col">
        <p className="type-caption text-text-subtle">{t.offer.label}</p>
        <h2 className="type-heading text-foreground">{t.names[offer.gameId]}</h2>
      </div>
      {offer.state === "available" ? (
        <>
          <p className="type-body-sm text-muted-foreground">{interpolate(t.offer.body, { xp })}</p>
          <ButtonLink href={playHref} variant="primary" block>
            {t.offer.play}
          </ButtonLink>
        </>
      ) : null}
      {offer.state === "in-play" ? (
        <>
          <p className="type-body-sm text-muted-foreground">{t.offer.inPlay}</p>
          <ButtonLink href={playHref} variant="primary" block>
            {t.offer.continue}
          </ButtonLink>
        </>
      ) : null}
      {offer.state === "won" ? <p className="type-label text-accent">{interpolate(t.offer.won, { xp })}</p> : null}
      {offer.state === "lost" ? <p className="type-body-sm text-muted-foreground">{t.offer.lost}</p> : null}
    </Card>
  );
}
