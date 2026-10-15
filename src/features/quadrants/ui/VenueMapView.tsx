"use client";

import { useEffect, useId, useRef, useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, Card, Icon, PixelPlanet } from "@/shared/ui";
import type { GalaxyMap, GalaxyQuadrant } from "../domain/galaxy";
import type { VenueArea } from "../domain/venue";
import { ON_PLAN, PlanBackground } from "./PlanBackground";
import { AREA_STYLE, PLANET_ACCENT, percent } from "./plan-style";

export interface VenueMapViewProps {
  galaxy: GalaxyMap;
}


/**
 * The galaxy map: the venue plan drawn from the edition's data, stands colored by quadrant. Stands are
 * real buttons placed over the plan, so they work by touch, keyboard and screen reader; choosing one
 * shows its quadrant below the plan. The quadrant list after it says the same in text.
 */
export function VenueMapView({ galaxy }: VenueMapViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const detailId = useId();

  const { venue, quadrants } = galaxy;
  const quadrantOf = (area: VenueArea) => quadrants.find((quadrant) => quadrant.id === area.quadrantId) ?? null;
  const selected = venue.areas.find((area) => area.id === selectedId) ?? null;

  // On a phone the detail sits below the plan, often past the fold: bring it into view (no animation).
  useEffect(() => {
    if (selectedId !== null) detailRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId]);

  function choose(area: VenueArea) {
    setSelectedId((current) => (current === area.id ? null : area.id));
  }

  return (
    <div className="gap-space-6 flex flex-col">
      <header className="gap-space-2 flex flex-col">
        <h1 className="type-title text-foreground">{copy.map.title}</h1>
        <p className="type-body text-muted-foreground">{copy.map.subtitle}</p>
      </header>

      <Card className="gap-space-3 flex flex-col">
        <div
          role="group"
          aria-label={copy.map.planLabel}
          aria-describedby={helpId}
          className="bg-bg-deep border-border relative mx-auto w-full max-w-[420px] overflow-hidden rounded-md border"
          style={{ aspectRatio: `${venue.width} / ${venue.height}` }}
        >
          {venue.background ? <PlanBackground url={venue.background.url} /> : null}
          {venue.areas.map((area) => {
            const position = {
              left: percent(area.rect.x, venue.width),
              top: percent(area.rect.y, venue.height),
              width: percent(area.rect.width, venue.width),
              height: percent(area.rect.height, venue.height),
            };
            if (area.kind !== "stand") {
              return (
                <div
                  key={area.id}
                  className={cn("type-caption text-foreground p-space-1 absolute grid place-items-center overflow-hidden rounded-sm border text-center leading-tight", AREA_STYLE[area.kind], venue.background && ON_PLAN)}
                  style={position}
                >
                  {area.label}
                </div>
              );
            }

            const quadrant = quadrantOf(area);
            const isSelected = area.id === selectedId;
            return (
              <button
                key={area.id}
                type="button"
                aria-label={quadrant ? `${area.label}, ${interpolate(copy.map.quadrantOf, { name: quadrant.name })}` : area.label}
                aria-expanded={isSelected}
                aria-controls={detailId}
                onClick={() => choose(area)}
                className={cn(
                  "bg-surface focus-visible:ring-ring absolute grid place-items-center rounded-sm border-2 transition-transform focus-visible:ring-[3px] focus-visible:outline-none active:scale-95 motion-reduce:transition-none",
                  quadrant ? PLANET_ACCENT[quadrant.planet] : "border-line-strong",
                  venue.background && ON_PLAN,
                  isSelected && "ring-primary ring-offset-bg-deep bg-surface-raised ring-2 ring-offset-2",
                )}
                style={position}
              >
                {quadrant ? (
                  <PixelPlanet kind={quadrant.planet} scale={2} />
                ) : (
                  <span className="type-caption text-muted-foreground">{copy.map.plainStand}</span>
                )}
              </button>
            );
          })}
        </div>
        <p id={helpId} className="type-caption text-text-subtle text-center">
          {copy.map.planHelp}
        </p>

        <div id={detailId} ref={detailRef} aria-live="polite" className="scroll-mb-28 min-[760px]:scroll-mb-4">
          {selected ? <StandDetail area={selected} quadrant={quadrantOf(selected)} onClose={() => setSelectedId(null)} /> : null}
        </div>
      </Card>

      <section aria-labelledby={`${helpId}-quadrants`} className="gap-space-3 flex flex-col">
        <h2 id={`${helpId}-quadrants`} className="type-heading text-foreground">
          {copy.map.quadrantsTitle}
        </h2>
        <ul className="gap-space-3 grid min-[760px]:grid-cols-2">
          {quadrants.map((quadrant) => (
            <li key={quadrant.id}>
              <QuadrantCard quadrant={quadrant} selectedId={selectedId} onChoose={choose} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StandDetail({ area, quadrant, onClose }: { area: VenueArea; quadrant: GalaxyQuadrant | null; onClose: () => void }) {
  return (
    <div className={cn("bg-surface-raised p-space-4 gap-space-3 flex items-start rounded-md border-2", quadrant ? PLANET_ACCENT[quadrant.planet] : "border-line-strong")}>
      {quadrant ? <PixelPlanet kind={quadrant.planet} scale={3} /> : null}
      <div className="gap-space-1 flex min-w-0 flex-1 flex-col">
        <p className="type-label text-foreground">{area.label}</p>
        {quadrant ? (
          <>
            <p className="type-caption text-muted-foreground">{interpolate(copy.map.quadrantOf, { name: quadrant.name })}</p>
            <p className="type-body text-muted-foreground">{quadrant.tagline}</p>
          </>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={copy.map.close}
        onClick={onClose}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -m-space-2 grid size-12 shrink-0 place-items-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
      >
        <Icon name="close" size={22} />
      </button>
    </div>
  );
}

function QuadrantCard({ quadrant, selectedId, onChoose }: { quadrant: GalaxyQuadrant; selectedId: string | null; onChoose: (area: VenueArea) => void }) {
  return (
    <Card className={cn("gap-space-3 flex h-full flex-col border-l-4", PLANET_ACCENT[quadrant.planet])}>
      <div className="gap-space-3 flex items-center">
        <PixelPlanet kind={quadrant.planet} scale={3} />
        <div className="flex min-w-0 flex-col">
          <h3 className="type-label text-foreground">{quadrant.name}</h3>
          <p className="type-caption text-muted-foreground">{quadrant.tagline}</p>
        </div>
      </div>
      {quadrant.stands.length > 0 ? (
        <ul aria-label={interpolate(copy.map.standsOf, { name: quadrant.name })} className="gap-space-2 flex flex-wrap">
          {quadrant.stands.map((stand) => (
            <li key={stand.id}>
              <Button type="button" variant={stand.id === selectedId ? "primary" : "secondary"} size="sm" aria-pressed={stand.id === selectedId} onClick={() => onChoose(stand)}>
                {stand.label}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-caption text-text-subtle">{copy.map.noStands}</p>
      )}
    </Card>
  );
}
