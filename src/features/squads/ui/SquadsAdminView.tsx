"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, ButtonLink, Card, Icon, InlineAlert, SortableList, SquadArt } from "@/shared/ui";
import type { MoveSquadAction, SeedSquadsAction, SquadAdminActionResult, SquadIdAction, SquadView } from "./admin-actions";

export interface SquadsAdminViewProps {
  squads: readonly SquadView[];
  /** Whether the event is over: retiring is only possible then. */
  eventFinished: boolean;
  seed: SeedSquadsAction;
  retire: SquadIdAction;
  reactivate: SquadIdAction;
  move: MoveSquadAction;
  /** Plain paths (a client component cannot receive functions from the server): a squad is edited at `${editBase}/${id}`. */
  hrefs: { create: string; editBase: string; event: string };
}

type Notice = { kind: "success" | "error"; text: string } | null;

const chip = "type-caption border-line-strong text-foreground px-space-3 rounded-full border py-1";

/**
 * The Escuadrones screen: every squad of the edition with its logo, in the order attendees see them, with a
 * handle to drag it to another place and buttons to edit, retire (only once the event is over) and reactivate. An empty edition offers to
 * load DevFest's squads. Nothing is ever deleted; the server decides everything.
 */
export function SquadsAdminView({ squads, eventFinished, seed, retire, reactivate, move, hrefs }: SquadsAdminViewProps) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<SquadAdminActionResult>, success?: string) {
    setBusy(key);
    setNotice(null);
    let result: SquadAdminActionResult;
    try {
      result = await action();
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setBusy(null);
    if (!result.ok) {
      setNotice({ kind: "error", text: copy.admin.squads.errors[result.code] });
      return false;
    }
    if (success) setNotice({ kind: "success", text: success });
    router.refresh();
    return true;
  }

  return (
    <div className="gap-space-6 flex flex-col">
      <header className="gap-space-3 flex flex-wrap items-end justify-between">
        <div className="gap-space-1 flex flex-col">
          <h1 className="type-title-xl text-foreground">{copy.admin.squads.title}</h1>
          <p className="type-body text-muted-foreground">{copy.admin.squads.subtitle}</p>
        </div>
        {squads.length > 0 ? <ButtonLink href={hrefs.create}>{copy.admin.squads.create}</ButtonLink> : null}
      </header>

      {notice?.kind === "success" ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice.text}
        </p>
      ) : null}
      {notice?.kind === "error" ? <InlineAlert>{notice.text}</InlineAlert> : null}

      {squads.length === 0 ? (
        <Card className="gap-space-4 flex flex-col">
          <p className="type-body text-muted-foreground">{copy.admin.squads.empty}</p>
          <Button loading={busy === "seed"} onClick={() => void run("seed", seed, copy.admin.squads.seeded)}>
            {busy === "seed" ? copy.admin.squads.seeding : copy.admin.squads.seed}
          </Button>
          <ButtonLink href={hrefs.create} variant="ghost">
            {copy.admin.squads.create}
          </ButtonLink>
        </Card>
      ) : (
        <>
          <SortableList
            items={squads}
            getId={(squad) => squad.id}
            getLabel={(squad) => squad.name}
            label={copy.admin.squads.listLabel}
            disabled={busy !== null}
            onMove={(id, to) => run(`move:${id}`, () => move({ id, to }))}
            renderItem={(squad, handle) => {
              const rowBusy = busy !== null && busy.endsWith(`:${squad.id}`);
              return (
                  <Card pad={false} className="gap-space-3 p-space-3 flex flex-col">
                    <div className="gap-space-3 flex items-center">
                      {handle}
                      <div className={cn("bg-bg-deep border-border p-space-2 rounded-md border", !squad.active && "opacity-60")}>
                        <SquadArt sprite={squad.sprite} logoUrl={squad.logo?.url} scale={3} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="type-title text-foreground truncate">{squad.name}</p>
                        <p className="type-body-sm text-muted-foreground">{squad.tagline}</p>
                        <p className="type-caption text-text-subtle">{squad.id}</p>
                      </div>
                      <span className={cn(chip, "shrink-0", squad.active ? "border-accent/70" : "text-text-subtle")}>
                        {squad.active ? copy.admin.squads.active : copy.admin.squads.retired}
                      </span>
                    </div>

                    <div className="gap-space-2 flex flex-wrap items-center justify-end">
                      <Link
                        href={`${hrefs.editBase}/${squad.id}`}
                        aria-label={`${copy.admin.squads.edit}: ${squad.name}`}
                        className="type-label text-primary hover:bg-secondary focus-visible:ring-ring px-space-4 gap-space-2 inline-flex h-9 items-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
                      >
                        <Icon name="edit" size={16} />
                        {copy.admin.squads.edit}
                      </Link>
                      {squad.active ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy !== null || !eventFinished}
                          loading={rowBusy && busy?.startsWith("retire")}
                          aria-label={`${copy.admin.squads.retire}: ${squad.name}`}
                          aria-describedby={eventFinished ? undefined : "retire-locked"}
                          onClick={() =>
                            void run(`retire:${squad.id}`, () => retire({ id: squad.id }), interpolate(copy.admin.squads.retiredDone, { name: squad.name }))
                          }
                        >
                          {rowBusy && busy?.startsWith("retire") ? copy.admin.squads.retiring : copy.admin.squads.retire}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy !== null}
                          loading={rowBusy && busy?.startsWith("reactivate")}
                          aria-label={`${copy.admin.squads.reactivate}: ${squad.name}`}
                          onClick={() =>
                            void run(`reactivate:${squad.id}`, () => reactivate({ id: squad.id }), interpolate(copy.admin.squads.reactivatedDone, { name: squad.name }))
                          }
                        >
                          {rowBusy && busy?.startsWith("reactivate") ? copy.admin.squads.reactivating : copy.admin.squads.reactivate}
                        </Button>
                      )}
                    </div>
                  </Card>
              );
            }}
          />

          <Card className="gap-space-2 flex flex-col">
            <p className="type-body-sm text-muted-foreground">{copy.admin.squads.retireNote}</p>
            {eventFinished ? null : (
              <p id="retire-locked" className="type-body-sm text-foreground">
                {copy.admin.squads.retireLocked}{" "}
                <Link href={hrefs.event} className="text-primary underline underline-offset-4">
                  {copy.admin.squads.setEnd}
                </Link>
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
