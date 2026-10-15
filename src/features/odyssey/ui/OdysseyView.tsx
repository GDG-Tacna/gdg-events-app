import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { ButtonLink, Card, Icon, PixelPlanet, ProgressBar, type PlanetKind } from "@/shared/ui";
import type { OdysseyLog, Transmission } from "../domain/odyssey";

export interface OdysseyViewProps {
  /** The edition's story title; without one the screen says "Historia". */
  title?: string | null;
  log: OdysseyLog;
  /** Active quadrants in order; transmissions of a quadrant not listed go to "Otras transmisiones". */
  quadrants: ReadonlyArray<{ id: string; name: string; planet: PlanetKind }>;
  backHref: string;
}

/**
 * The attendee's log of the edition's story: how many transmissions they deciphered, then each quadrant's
 * transmissions in order. An open one shows its text; a locked one says which mission deciphers it (the
 * server never sends its text).
 */
export function OdysseyView({ title, log, quadrants, backHref }: OdysseyViewProps) {
  const groups = [
    ...quadrants.map((quadrant) => ({ key: quadrant.id, quadrant, items: log.transmissions.filter((t) => t.quadrantId === quadrant.id) })),
    { key: "other", quadrant: null, items: log.transmissions.filter((t) => !quadrants.some((quadrant) => quadrant.id === t.quadrantId)) },
  ].filter((group) => group.items.length > 0);
  const progress = interpolate(copy.odyssey.progress, { open: String(log.open), total: String(log.total) });

  return (
    <div className="gap-space-6 flex flex-col">
      <div>
        <ButtonLink href={backHref} variant="ghost" size="sm" className="-ml-space-4">
          {copy.odyssey.back}
        </ButtonLink>
      </div>
      <header className="gap-space-2 flex flex-col">
        <h1 className="type-title text-foreground">{title ?? copy.odyssey.title}</h1>
        <p className="type-body text-muted-foreground">{copy.odyssey.subtitle}</p>
      </header>

      {log.total === 0 ? (
        <Card>
          <p className="type-body text-muted-foreground">{copy.odyssey.empty}</p>
        </Card>
      ) : (
        <>
          <Card className="gap-space-3 flex flex-col">
            <p className="type-label text-foreground">{progress}</p>
            <ProgressBar value={log.open} max={log.total} label={copy.odyssey.progressLabel} valueText={progress} />
          </Card>
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`odyssey-${group.key}`} className="gap-space-3 flex flex-col">
              <div className="gap-space-3 flex items-center">
                {group.quadrant ? <PixelPlanet kind={group.quadrant.planet} scale={2} /> : null}
                <h2 id={`odyssey-${group.key}`} className="type-heading text-foreground">
                  {group.quadrant?.name ?? copy.odyssey.otherQuadrant}
                </h2>
              </div>
              <ol className="gap-space-3 flex flex-col">
                {group.items.map((transmission) => (
                  <li key={transmission.id}>
                    <TransmissionCard transmission={transmission} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function TransmissionCard({ transmission }: { transmission: Transmission }) {
  if (transmission.status === "locked") {
    return (
      <Card className="gap-space-2 bg-bg-deep flex flex-col border-dashed">
        <p className="type-caption text-text-subtle gap-space-1 inline-flex items-center">
          <Icon name="lock" size={16} />
          {copy.odyssey.locked}
        </p>
        <h3 className="type-label text-muted-foreground">{transmission.title}</h3>
        <p className="type-body-sm text-muted-foreground">{interpolate(copy.odyssey.unlockHint, { mission: transmission.unlockMission })}</p>
      </Card>
    );
  }
  return (
    <Card className="gap-space-2 flex flex-col">
      <p className="type-caption text-accent gap-space-1 inline-flex items-center">
        <Icon name="transmission" size={16} />
        {copy.odyssey.open}
      </p>
      <h3 className="type-label text-foreground">{transmission.title}</h3>
      <p className="type-body text-muted-foreground whitespace-pre-line">{transmission.body}</p>
    </Card>
  );
}
