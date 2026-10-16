"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, ButtonLink, Card, InlineAlert } from "@/shared/ui";
import type { Poll, PollReward } from "../domain/poll";
import type { PollActionResult, PollStateAction } from "./actions";

export interface PollsAdminViewProps {
  polls: readonly Poll[];
  change: PollStateAction;
  hrefs: { create: string; base: string };
}

const t = copy.admin.polls;
const STATUS_STYLE = { draft: "border-line-strong text-muted-foreground", open: "border-accent/70 text-foreground", closed: "border-line-strong text-text-subtle" } as const;

/** The poll's prize in a few words. */
export function rewardLabel(reward: PollReward): string {
  if (reward.kind === "none") return t.reward.none;
  return interpolate(reward.kind === "xp" ? t.reward.xp : t.reward.credits, { n: String(reward.amount) });
}

/**
 * The Encuestas screen: every poll of the edition, the open one first. A draft is edited, opened or deleted; the open
 * one is closed; any poll that was opened shows its results. The server checks each change again.
 */
export function PollsAdminView({ polls, change, hrefs }: PollsAdminViewProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const anotherOpen = polls.some((poll) => poll.status === "open");

  async function run(poll: Poll, action: "open" | "close" | "delete") {
    if (action === "delete" && !window.confirm(t.confirmRemove)) return;
    setBusy(`${action}:${poll.id}`);
    setNotice(null);
    let result: PollActionResult;
    try {
      result = await change({ id: poll.id, action });
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setBusy(null);
    if (!result.ok) return setNotice({ kind: "error", text: t.errors[result.code] });
    const done = { open: t.openedDone, close: t.closedDone, delete: t.removedDone }[action];
    setNotice({ kind: "success", text: interpolate(done, { question: poll.question }) });
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

      {polls.length === 0 ? (
        <Card>
          <p className="type-body text-muted-foreground">{t.empty}</p>
        </Card>
      ) : (
        <ul aria-label={t.listLabel} className="gap-space-3 flex flex-col">
          {polls.map((poll) => (
            <li key={poll.id}>
              <Card className={cn("gap-space-3 flex flex-col", poll.status === "open" && "border-accent/60")}>
                <div className="gap-space-3 flex items-start justify-between">
                  <p className="type-label text-foreground min-w-0">{poll.question}</p>
                  <span className={cn("type-caption px-space-3 shrink-0 rounded-full border py-1", STATUS_STYLE[poll.status])}>{t.status[poll.status]}</span>
                </div>
                <p className="type-caption text-text-subtle">
                  {[interpolate(t.options, { n: String(poll.options.length) }), poll.changeable ? t.changeable : t.fixed, rewardLabel(poll.reward)].join(" · ")}
                </p>
                <div className="gap-space-2 flex flex-wrap justify-end">
                  {poll.status === "draft" ? (
                    <>
                      <Button variant="ghost" size="sm" disabled={busy !== null} aria-label={`${t.remove}: ${poll.question}`} onClick={() => void run(poll, "delete")}>
                        {t.remove}
                      </Button>
                      <ButtonLink href={`${hrefs.base}/${poll.id}`} variant="ghost" size="sm" aria-label={`${t.edit}: ${poll.question}`}>
                        {t.edit}
                      </ButtonLink>
                      <Button size="sm" disabled={busy !== null || anotherOpen} loading={busy === `open:${poll.id}`} aria-label={`${t.open}: ${poll.question}`} onClick={() => void run(poll, "open")}>
                        {t.open}
                      </Button>
                    </>
                  ) : (
                    <ButtonLink href={`${hrefs.base}/${poll.id}`} variant="ghost" size="sm" aria-label={`${t.results}: ${poll.question}`}>
                      {t.results}
                    </ButtonLink>
                  )}
                  {poll.status === "open" ? (
                    <Button variant="secondary" size="sm" disabled={busy !== null} loading={busy === `close:${poll.id}`} aria-label={`${t.close}: ${poll.question}`} onClick={() => void run(poll, "close")}>
                      {t.close}
                    </Button>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
