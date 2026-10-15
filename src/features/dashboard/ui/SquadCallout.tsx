import { copy } from "@/shared/copy/es";
import type { PixelSpriteData } from "@/shared/types/pixel";
import { ArtTile, ButtonLink, Card, SquadArt } from "@/shared/ui";

export interface SquadCalloutProps {
  /** Logos of the squads on offer. Structural, so this feature never imports the squads feature. */
  previews: ReadonlyArray<{ id: string; sprite: PixelSpriteData; logo?: { url: string } | null }>;
  /** Where the invitation leads (the reveal screen). */
  href: string;
}

/** Invites an attendee who has no squad yet to discover it. */
export function SquadCallout({ previews, href }: SquadCalloutProps) {
  return (
    <Card className="gap-space-4 flex flex-col">
      <div className="gap-space-2 flex flex-col">
        <h2 className="type-heading text-foreground">{copy.dashboard.squadCalloutTitle}</h2>
        <p className="type-body-sm text-muted-foreground">{copy.dashboard.squadCalloutBody}</p>
      </div>
      <div className="flex">
        <ArtTile className="gap-space-2 flex-wrap">
          {previews.map((squad) => (
            <SquadArt key={squad.id} sprite={squad.sprite} logoUrl={squad.logo?.url} scale={3} />
          ))}
        </ArtTile>
      </div>
      <ButtonLink href={href} variant="primary" block>
        {copy.reveal.discover}
      </ButtonLink>
    </Card>
  );
}
