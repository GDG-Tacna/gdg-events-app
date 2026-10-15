"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, ButtonLink, Card, Icon, InlineAlert, PixelPlanet, SortableList } from "@/shared/ui";
import type { Quadrant } from "../domain/quadrant";
import type { MoveQuadrantAction, SeedLayoutAction, SetQuadrantActiveAction } from "./admin-actions";

export interface QuadrantsAdminViewProps {
  quadrants: readonly Quadrant[];
  /** How many bundled quadrants attendees see while the edition has none of its own. */
  defaultsCount: number;
  seed: SeedLayoutAction;
  setActive: SetQuadrantActiveAction;
  move: MoveQuadrantAction;
  /** Plain paths (a client component cannot receive functions from the server): a quadrant is edited at `${editBase}/${id}`. */
  hrefs: { create: string; editBase: string; plan: string };
}

type Notice = { kind: "success" | "error"; text: string } | null;
const chip = "type-caption border-line-strong text-foreground px-space-3 rounded-full border py-1";

/**
 * The Mapa screen: the edition's quadrants in order, with a handle to drag each and buttons to edit and show or hide them,
 * and the way into the plan editor. While the edition has no quadrants it offers to load the bundled
 * quadrants and plan (which also creates each stand's QR). Nothing is deleted; the server decides.
 */
export function QuadrantsAdminView({ quadrants, defaultsCount, seed, setActive, move, hrefs }: QuadrantsAdminViewProps) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<{ ok: true } | { ok: false; code: keyof typeof copy.admin.map.errors }>, success?: (result: unknown) => string) {
    setBusy(key);
    setNotice(null);
    let result: Awaited<ReturnType<typeof action>>;
    try {
      result = await action();
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setBusy(null);
    if (!result.ok) {
      setNotice({ kind: "error", text: copy.admin.map.errors[result.code] });
      return false;
    }
    if (success) setNotice({ kind: "success", text: success(result) });
    router.refresh();
    return true;
  }

  return (
    <div className="gap-space-6 flex flex-col">
      <header className="gap-space-1 flex flex-col">
        <h1 className="type-title-xl text-foreground">{copy.admin.map.title}</h1>
        <p className="type-body text-muted-foreground">{copy.admin.map.subtitle}</p>
      </header>

      {notice?.kind === "success" ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice.text}
        </p>
      ) : null}
      {notice?.kind === "error" ? <InlineAlert>{notice.text}</InlineAlert> : null}

      <Card className="gap-space-3 flex flex-col">
        <p className="type-body text-muted-foreground">{copy.admin.map.planCard}</p>
        <ButtonLink href={hrefs.plan} className="self-start">
          {copy.admin.map.editPlan}
        </ButtonLink>
      </Card>

      <section aria-labelledby="quadrants-title" className="gap-space-3 flex flex-col">
        <div className="gap-space-3 flex flex-wrap items-center justify-between">
          <h2 id="quadrants-title" className="type-title text-foreground">
            {copy.admin.map.quadrantsTitle}
          </h2>
          {quadrants.length > 0 ? (
            <ButtonLink href={hrefs.create} variant="secondary" size="sm">
              {copy.admin.map.createQuadrant}
            </ButtonLink>
          ) : null}
        </div>

        {quadrants.length === 0 ? (
          <Card className="gap-space-4 flex flex-col">
            <p className="type-body text-muted-foreground">{interpolate(copy.admin.map.usingDefaults, { n: String(defaultsCount) })}</p>
            <Button
              loading={busy === "seed"}
              disabled={busy !== null}
              onClick={() =>
                void run("seed", seed, (result) => interpolate(copy.admin.map.seeded, { n: String((result as { standQrs: string[] }).standQrs.length) }))
              }
            >
              {busy === "seed" ? copy.admin.map.seeding : copy.admin.map.seed}
            </Button>
          </Card>
        ) : (
          <SortableList
            items={quadrants}
            getId={(quadrant) => quadrant.id}
            getLabel={(quadrant) => quadrant.name}
            label={copy.admin.map.quadrantsLabel}
            disabled={busy !== null}
            onMove={(id, to) => run(`move:${id}`, () => move({ id, to }))}
            renderItem={(quadrant, handle) => {
              const label = (action: string) => `${action}: ${quadrant.name}`;
              return (
                  <Card pad={false} className={cn("gap-space-3 p-space-3 flex flex-col", !quadrant.active && "opacity-75")}>
                    <div className="gap-space-3 flex items-center">
                      {handle}
                      <PixelPlanet kind={quadrant.planet} scale={3} />
                      <div className="min-w-0 flex-1">
                        <p className="type-label text-foreground">{quadrant.name}</p>
                        <p className="type-body-sm text-muted-foreground">{quadrant.tagline}</p>
                        <p className="type-caption text-text-subtle">{quadrant.id}</p>
                      </div>
                      <span className={cn(chip, "shrink-0", quadrant.active ? "border-accent/70" : "text-text-subtle")}>
                        {quadrant.active ? copy.admin.map.active : copy.admin.map.inactive}
                      </span>
                    </div>
                    <div className="gap-space-2 flex flex-wrap items-center justify-end">
                      <Link
                        href={`${hrefs.editBase}/${quadrant.id}`}
                        aria-label={label(copy.admin.map.edit)}
                        className="type-label text-primary hover:bg-secondary focus-visible:ring-ring px-space-4 gap-space-2 inline-flex h-9 items-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
                      >
                        <Icon name="edit" size={16} />
                        {copy.admin.map.edit}
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy !== null}
                        loading={busy === `active:${quadrant.id}`}
                        aria-label={label(quadrant.active ? copy.admin.map.deactivate : copy.admin.map.activate)}
                        onClick={() =>
                          void run(`active:${quadrant.id}`, () => setActive({ id: quadrant.id, active: !quadrant.active }), () =>
                            interpolate(quadrant.active ? copy.admin.map.deactivatedDone : copy.admin.map.activatedDone, { name: quadrant.name }),
                          )
                        }
                      >
                        {quadrant.active ? copy.admin.map.deactivate : copy.admin.map.activate}
                      </Button>
                    </div>
                  </Card>
              );
            }}
          />
        )}
      </section>
    </div>
  );
}
