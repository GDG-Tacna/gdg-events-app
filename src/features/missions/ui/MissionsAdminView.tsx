"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, ButtonLink, Card, Icon, InlineAlert, SortableList, type IconName } from "@/shared/ui";
import type { Mission, MissionType } from "../domain/mission";
import type { AdminOption, MissionAdminActionResult, MoveMissionAction, SeedMissionsAction, SetMissionActiveAction } from "./admin-actions";

export interface MissionsAdminViewProps {
  missions: readonly Mission[];
  /** Active quadrants of the edition, to name each mission's quadrant. */
  quadrants: readonly AdminOption[];
  /** How many bundled missions attendees see while the edition has none of its own. */
  defaultsCount: number;
  seed: SeedMissionsAction;
  setActive: SetMissionActiveAction;
  move: MoveMissionAction;
  /** Plain paths (a client component cannot receive functions from the server): a mission is edited at `${editBase}/${id}`. */
  hrefs: { create: string; editBase: string; suggest?: string };
}

type Notice = { kind: "success" | "error"; text: string } | null;

const TYPE_ICON: Record<MissionType, IconName> = {
  talk: "qr",
  stand: "map-pin",
  quiz: "question",
  keyword: "key",
};
/** A non-breaking space keeps the dot on the line of the item before it. */
const SEPARATOR = " · ";
const chip ="type-caption border-line-strong text-foreground px-space-3 rounded-full border py-1";

/**
 * The Misiones screen: every mission of the edition in the order attendees see them, with its quadrant, type, XP
 * and state, a handle to drag it to another place, and buttons to edit and activate or deactivate. While the edition
 * has no missions of its own it offers to load the bundled set. Nothing is deleted; the server decides everything.
 */
export function MissionsAdminView({ missions, quadrants, defaultsCount, seed, setActive, move, hrefs }: MissionsAdminViewProps) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const quadrantName = (id: string) => quadrants.find((quadrant) => quadrant.id === id)?.name ?? copy.admin.missions.otherQuadrant;

  async function run(key: string, action: () => Promise<MissionAdminActionResult>, success?: string) {
    setBusy(key);
    setNotice(null);
    let result: MissionAdminActionResult;
    try {
      result = await action();
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setBusy(null);
    if (!result.ok) {
      setNotice({ kind: "error", text: copy.admin.missions.errors[result.code] });
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
          <h1 className="type-title-xl text-foreground">{copy.admin.missions.title}</h1>
          <p className="type-body text-muted-foreground">{copy.admin.missions.subtitle}</p>
        </div>
        <div className="gap-space-2 flex flex-wrap">
          {hrefs.suggest ? (
            <ButtonLink href={hrefs.suggest} variant="secondary">
              {copy.admin.missions.suggest}
            </ButtonLink>
          ) : null}
          {missions.length > 0 ? <ButtonLink href={hrefs.create}>{copy.admin.missions.create}</ButtonLink> : null}
        </div>
      </header>

      {notice?.kind === "success" ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice.text}
        </p>
      ) : null}
      {notice?.kind === "error" ? <InlineAlert>{notice.text}</InlineAlert> : null}

      {missions.length === 0 ? (
        <Card className="gap-space-4 flex flex-col">
          <p className="type-body text-muted-foreground">{interpolate(copy.admin.missions.usingDefaults, { n: String(defaultsCount) })}</p>
          <Button loading={busy === "seed"} disabled={busy !== null} onClick={() => void run("seed", seed, copy.admin.missions.seeded)}>
            {busy === "seed" ? copy.admin.missions.seeding : copy.admin.missions.seed}
          </Button>
          <p className="type-caption text-text-subtle">{copy.admin.missions.createWarning}</p>
          <ButtonLink href={hrefs.create} variant="ghost">
            {copy.admin.missions.create}
          </ButtonLink>
        </Card>
      ) : (
        <SortableList
          items={missions}
          getId={(mission) => mission.id}
          getLabel={(mission) => mission.title}
          label={copy.admin.missions.listLabel}
          disabled={busy !== null}
          onMove={(id, to) => run(`move:${id}`, () => move({ id, to }))}
          renderItem={(mission, handle) => {
            const label = (action: string) => `${action}: ${mission.title}`;
            return (
              <Card pad={false} className={cn("gap-space-3 p-space-3 flex flex-col", !mission.active && "opacity-75")}>
                <div className="gap-space-3 flex items-start">
                  {handle}
                  <span aria-hidden="true" className="bg-bg-deep border-line-strong text-cyan relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border">
                    {mission.image ? <Image src={mission.image.url} alt="" fill unoptimized sizes="48px" className="object-cover" /> : <Icon name={TYPE_ICON[mission.config.type]} size={22} />}
                  </span>
                  <div className="gap-space-1 flex min-w-0 flex-1 flex-col">
                    <p className="type-label text-foreground">{mission.title}</p>
                    {/* Inline text: a line only breaks after a separator, never before one. */}
                    <p className="type-caption text-muted-foreground">
                      <span>{copy.missions.types[mission.config.type]}</span>
                      <span aria-hidden="true">{SEPARATOR}</span>
                      <span>{quadrantName(mission.quadrantId)}</span>
                      <span aria-hidden="true">{SEPARATOR}</span>
                      <span className="whitespace-nowrap">{interpolate(copy.admin.missions.xp, { xp: formatNumber(mission.xp) })}</span>
                      {mission.minigame && mission.minigame in copy.minigames.names ? (
                        <>
                          <span aria-hidden="true">{SEPARATOR}</span>
                          <span>{interpolate(copy.admin.missions.minigame, { name: copy.minigames.names[mission.minigame as keyof typeof copy.minigames.names] })}</span>
                        </>
                      ) : null}
                    </p>
                    <p className="type-caption text-text-subtle">{mission.id}</p>
                  </div>
                  <span className={cn(chip, "shrink-0", mission.active ? "border-accent/70" : "text-text-subtle")}>
                    {mission.active ? copy.admin.missions.active : copy.admin.missions.inactive}
                  </span>
                </div>

                <div className="gap-space-2 flex flex-wrap items-center justify-end">
                  <Link
                    href={`${hrefs.editBase}/${mission.id}`}
                    aria-label={label(copy.admin.missions.edit)}
                    className="type-label text-primary hover:bg-secondary focus-visible:ring-ring px-space-4 gap-space-2 inline-flex h-9 items-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
                  >
                    <Icon name="edit" size={16} />
                    {copy.admin.missions.edit}
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    loading={busy === `active:${mission.id}`}
                    aria-label={label(mission.active ? copy.admin.missions.deactivate : copy.admin.missions.activate)}
                    onClick={() =>
                      void run(
                        `active:${mission.id}`,
                        () => setActive({ id: mission.id, active: !mission.active }),
                        interpolate(mission.active ? copy.admin.missions.deactivatedDone : copy.admin.missions.activatedDone, { title: mission.title }),
                      )
                    }
                  >
                    {mission.active ? copy.admin.missions.deactivate : copy.admin.missions.activate}
                  </Button>
                </div>
              </Card>
            );
          }}
        />
      )}
    </div>
  );
}
