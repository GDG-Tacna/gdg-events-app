"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, ButtonLink, Card, InlineAlert } from "@/shared/ui";
import type { SetTalkActiveAction, TalkAdminActionResult, TalkView } from "./admin-actions";

export interface TalksAdminViewProps {
  /** In agenda order (by start time, undated last). */
  talks: readonly TalkView[];
  rooms: ReadonlyArray<{ id: string; name: string }>;
  setActive: SetTalkActiveAction;
  /** Plain paths (a client component cannot receive functions from the server). */
  hrefs: { create: string; editBase: string; projectBase: string };
}

const chip = "type-caption border-line-strong text-foreground px-space-3 rounded-full border py-1";
const linkClass =
  "type-label text-primary hover:bg-secondary focus-visible:ring-ring px-space-4 inline-flex h-9 items-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none";

/** A wall-clock time (`YYYY-MM-DDTHH:mm`) read as written, whatever the browser's time zone. */
const asWallClock = (value: string) => new Date(`${value}:00Z`);
const day = new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const time = new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });

/** "vie, 24 oct · 10:00–10:45", or `null` for a talk without a schedule. */
export function formatSlot(startsAt: string | null, endsAt: string | null): string | null {
  if (!startsAt || !endsAt) return null;
  const start = asWallClock(startsAt);
  return `${day.format(start)} · ${time.format(start)}–${time.format(asWallClock(endsAt))}`;
}

/**
 * The Charlas screen: the edition's agenda with each talk's time, speaker, room and state, and links to edit it
 * and project its QR, and to open or close it. Nothing is deleted: check-ins and missions point to the talk.
 */
export function TalksAdminView({ talks, rooms, setActive, hrefs }: TalksAdminViewProps) {
  const t = copy.admin.talks;
  const router = useRouter();
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const roomName = (id: string | null) => (id ? (rooms.find((room) => room.id === id)?.name ?? t.noRoom) : t.noRoom);

  async function toggle(talk: TalkView) {
    setBusy(talk.id);
    setNotice(null);
    let result: TalkAdminActionResult;
    try {
      result = await setActive({ id: talk.id, active: !talk.active });
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setBusy(null);
    if (!result.ok) return setNotice({ kind: "error", text: t.errors[result.code] });
    setNotice({ kind: "success", text: interpolate(talk.active ? t.deactivatedDone : t.activatedDone, { title: talk.title }) });
    router.refresh();
  }

  return (
    <div className="gap-space-6 flex flex-col">
      <header className="gap-space-3 flex flex-wrap items-end justify-between">
        <div className="gap-space-1 flex flex-col">
          <h1 className="type-title-xl text-foreground">{t.title}</h1>
          <p className="type-body text-muted-foreground">{t.subtitle}</p>
        </div>
        <ButtonLink href={hrefs.create}>{t.create}</ButtonLink>
      </header>

      {notice?.kind === "success" ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice.text}
        </p>
      ) : null}
      {notice?.kind === "error" ? <InlineAlert>{notice.text}</InlineAlert> : null}

      {talks.length === 0 ? (
        <Card>
          <p className="type-body text-muted-foreground">{t.empty}</p>
        </Card>
      ) : (
        <ul aria-label={t.listLabel} className="gap-space-3 flex flex-col">
          {talks.map((talk) => {
            const label = (action: string) => `${action}: ${talk.title}`;
            return (
              <li key={talk.id}>
                <Card className={cn("gap-space-3 flex flex-col", !talk.active && "opacity-75")}>
                  <div className="gap-space-3 flex flex-wrap items-start justify-between">
                    <div className="gap-space-1 flex min-w-0 flex-1 flex-col">
                      <p className="type-caption text-cyan tabular-nums">{formatSlot(talk.startsAt, talk.endsAt) ?? t.noSchedule}</p>
                      <p className="type-label text-foreground">{talk.title}</p>
                      <p className="type-caption text-muted-foreground">
                        {talk.speaker ?? t.noSpeaker} · {roomName(talk.roomId)}
                      </p>
                    </div>
                    <span className={cn(chip, talk.active ? "border-accent/70" : "text-text-subtle")}>{talk.active ? t.active : t.inactive}</span>
                  </div>
                  <div className="gap-space-2 -ml-space-4 flex flex-wrap items-center">
                    <Link href={`${hrefs.editBase}/${talk.id}`} aria-label={label(t.edit)} className={linkClass}>
                      {t.edit}
                    </Link>
                    {talk.active ? (
                      <Link href={`${hrefs.projectBase}/${talk.id}`} aria-label={label(t.project)} className={linkClass}>
                        {t.project}
                      </Link>
                    ) : null}
                    <Button variant="ghost" size="sm" disabled={busy !== null} aria-label={label(talk.active ? t.deactivate : t.activate)} onClick={() => void toggle(talk)}>
                      {talk.active ? t.deactivate : t.activate}
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
