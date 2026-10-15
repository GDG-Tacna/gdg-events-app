"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, ButtonLink, Card, Icon, InlineAlert, SortableList, TextField } from "@/shared/ui";
import type { Communication } from "../domain/communication";
import { STORY_TITLE_MAX } from "../domain/story";
import type { MoveCommunicationAction, OdysseyAdminActionResult, SaveStoryTitleAction, SeedCommunicationsAction, SetCommunicationActiveAction } from "./admin-actions";

export interface CommunicationsAdminViewProps {
  communications: readonly Communication[];
  quadrants: ReadonlyArray<{ id: string; name: string }>;
  /** Every mission of the edition, to name what opens each transmission. */
  missions: ReadonlyArray<{ id: string; name: string }>;
  defaultsCount: number;
  seed: SeedCommunicationsAction;
  setActive: SetCommunicationActiveAction;
  move: MoveCommunicationAction;
  /** The story's title cadets see, or `null` for the generic "Historia". */
  storyTitle: string | null;
  saveTitle: SaveStoryTitleAction;
  /** Plain paths (a client component cannot receive functions from the server). */
  hrefs: { create: string; editBase: string };
}

const chip = "type-caption border-line-strong text-foreground px-space-3 rounded-full border py-1";

/**
 * The Historia screen: the story's title cadets see (blank for the generic name), then every transmission of
 * the edition in reading order, with its quadrant, what opens it and its state, a handle to drag it to another place, and buttons to edit and show or hide it. An empty edition offers the bundled set.
 */
export function CommunicationsAdminView({ communications, quadrants, missions, defaultsCount, seed, setActive, move, storyTitle, saveTitle, hrefs }: CommunicationsAdminViewProps) {
  const o = copy.admin.odyssey;
  const router = useRouter();
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState(storyTitle ?? "");
  const nameOf = (list: ReadonlyArray<{ id: string; name: string }>, id: string) => list.find((item) => item.id === id)?.name;

  async function run(key: string, action: () => Promise<OdysseyAdminActionResult>, success?: string) {
    setBusy(key);
    setNotice(null);
    let result: OdysseyAdminActionResult;
    try {
      result = await action();
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setBusy(null);
    if (!result.ok) {
      setNotice({ kind: "error", text: o.errors[result.code] });
      return false;
    }
    if (success) setNotice({ kind: "success", text: success });
    router.refresh();
    return true;
  }

  function handleTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy !== null) return;
    const clean = title.trim().replace(/\s+/g, " ");
    void run("title", () => saveTitle({ title: clean }), clean ? interpolate(o.story.saved, { title: clean }) : o.story.cleared);
  }

  return (
    <div className="gap-space-6 flex flex-col">
      <header className="gap-space-3 flex flex-wrap items-end justify-between">
        <div className="gap-space-1 flex flex-col">
          <h1 className="type-title-xl text-foreground">{o.title}</h1>
          <p className="type-body text-muted-foreground">{o.subtitle}</p>
        </div>
        {communications.length > 0 ? <ButtonLink href={hrefs.create}>{o.create}</ButtonLink> : null}
      </header>

      {notice?.kind === "success" ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice.text}
        </p>
      ) : null}
      {notice?.kind === "error" ? <InlineAlert>{notice.text}</InlineAlert> : null}

      <Card>
        <form onSubmit={handleTitle} className="gap-space-4 flex flex-col" aria-labelledby="story-title-heading">
          <h2 id="story-title-heading" className="type-heading text-foreground">
            {o.story.heading}
          </h2>
          <TextField
            label={o.story.label}
            hint={o.story.hint}
            value={title}
            maxLength={STORY_TITLE_MAX}
            autoComplete="off"
            readOnly={busy !== null}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button type="submit" variant="secondary" className="self-start" loading={busy === "title"} disabled={busy !== null}>
            {busy === "title" ? o.story.saving : o.story.save}
          </Button>
        </form>
      </Card>

      {communications.length === 0 ? (
        <Card className="gap-space-4 flex flex-col">
          <p className="type-body text-muted-foreground">{interpolate(o.usingDefaults, { n: String(defaultsCount) })}</p>
          <Button loading={busy === "seed"} disabled={busy !== null} onClick={() => void run("seed", seed, o.seeded)}>
            {busy === "seed" ? o.seeding : o.seed}
          </Button>
          <ButtonLink href={hrefs.create} variant="ghost">
            {o.create}
          </ButtonLink>
        </Card>
      ) : (
        <SortableList
          items={communications}
          getId={(communication) => communication.id}
          getLabel={(communication) => communication.title}
          label={o.listLabel}
          disabled={busy !== null}
          onMove={(id, to) => run(`move:${id}`, () => move({ id, to }))}
          renderItem={(communication, handle) => {
            const label = (action: string) => `${action}: ${communication.title}`;
            const opens = communication.unlockMissionId
              ? interpolate(o.opensWith, { mission: nameOf(missions, communication.unlockMissionId) ?? communication.unlockMissionId })
              : o.fromStart;
            return (
                <Card pad={false} className={cn("gap-space-3 p-space-3 flex flex-col", !communication.active && "opacity-75")}>
                  <div className="gap-space-3 flex items-start">
                    {handle}
                    <span aria-hidden="true" className="bg-bg-deep border-line-strong text-violet-soft grid size-12 shrink-0 place-items-center rounded-md border">
                      <Icon name="transmission" size={22} />
                    </span>
                    <div className="gap-space-1 flex min-w-0 flex-1 flex-col">
                      <p className="type-label text-foreground">{communication.title}</p>
                      <p className="type-caption text-muted-foreground">
                        {nameOf(quadrants, communication.quadrantId) ?? o.otherQuadrant} · {opens}
                      </p>
                      <p className="type-body-sm text-muted-foreground line-clamp-2">{communication.body}</p>
                    </div>
                    <span className={cn(chip, "shrink-0", communication.active ? "border-accent/70" : "text-text-subtle")}>{communication.active ? o.active : o.inactive}</span>
                  </div>
                  <div className="gap-space-2 flex flex-wrap items-center justify-end">
                    <Link
                      href={`${hrefs.editBase}/${communication.id}`}
                      aria-label={label(o.edit)}
                      className="type-label text-primary hover:bg-secondary focus-visible:ring-ring px-space-4 gap-space-2 inline-flex h-9 items-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
                    >
                      <Icon name="edit" size={16} />
                      {o.edit}
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null}
                      aria-label={label(communication.active ? o.deactivate : o.activate)}
                      onClick={() =>
                        void run(
                          `active:${communication.id}`,
                          () => setActive({ id: communication.id, active: !communication.active }),
                          interpolate(communication.active ? o.deactivatedDone : o.activatedDone, { title: communication.title }),
                        )
                      }
                    >
                      {communication.active ? o.deactivate : o.activate}
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
