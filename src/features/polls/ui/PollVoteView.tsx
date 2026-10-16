"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, ButtonLink, Card, InlineAlert, Thumbnail } from "@/shared/ui";
import type { CadetPoll, VoteErrorCode } from "../domain/vote";
import type { VoteAction } from "./actions";

const t = copy.poll;

/** What voting pays, in words; `null` when nothing. */
export function rewardLine(reward: { xp: number; credits: number }): string | null {
  if (reward.xp > 0) return interpolate(t.rewardXp, { n: String(reward.xp) });
  if (reward.credits > 0) return interpolate(t.rewardCredits, { n: String(reward.credits) });
  return null;
}

/** The live poll on the dashboard: its question and the way to vote (or that the cadet already did). */
export function LivePollCard({ poll, href }: { poll: CadetPoll; href: string }) {
  const reward = rewardLine(poll.reward);
  return (
    <Card className="gap-space-3 border-cyan/60 flex flex-col">
      <p className="type-caption text-cyan">{t.cardTitle}</p>
      <p className="type-heading text-foreground">{poll.poll.question}</p>
      {reward && !poll.myVote ? <p className="type-body-sm text-muted-foreground">{reward}</p> : null}
      <ButtonLink href={href} variant={poll.myVote ? "secondary" : "primary"}>
        {poll.myVote ? t.cardSee : t.cardAction}
      </ButtonLink>
    </Card>
  );
}

export interface PollVoteViewProps {
  /** The open poll, or `null` when none is. */
  current: CadetPoll | null;
  vote: VoteAction;
  homeHref: string;
}

/**
 * Voting in the live poll: the options (with their pictures), one choice, and the prize the first vote pays. A poll that
 * keeps the first vote shows the cadet's choice once cast; one that lets it change keeps the form. Whether the poll is
 * still open is decided by the server.
 */
export function PollVoteView({ current, vote, homeHref }: PollVoteViewProps) {
  const router = useRouter();
  const [choice, setChoice] = useState<string | null>(current?.myVote ?? null);
  const [voted, setVoted] = useState<string | null>(current?.myVote ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<VoteErrorCode | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (message) messageRef.current?.focus();
  }, [message]);

  if (!current) {
    return (
      <Card className="gap-space-4 flex flex-col">
        <h1 className="type-title text-foreground">{t.title}</h1>
        <p className="type-body text-muted-foreground">{t.none}</p>
        <ButtonLink href={homeHref} variant="secondary">
          {t.back}
        </ButtonLink>
      </Card>
    );
  }

  const { poll } = current;
  const locked = voted !== null && !poll.changeable;
  const closed = error === "closed";
  const reward = voted ? null : rewardLine(current.reward);
  const votedText = voted ? poll.options.find((option) => option.id === voted)?.text : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !choice || locked) return;
    setPending(true);
    setError(null);
    setMessage(null);
    let result;
    try {
      result = await vote({ pollId: poll.id, optionId: choice });
    } catch {
      result = { ok: false as const, code: "unknown" as const };
    }
    setPending(false);
    if (!result.ok) return setError(result.code);
    setVoted(choice);
    setMessage(result.xp > 0 ? interpolate(t.earnedXp, { n: String(result.xp) }) : result.credits > 0 ? interpolate(t.earnedCredits, { n: String(result.credits) }) : t.voted);
    router.refresh();
  }

  return (
    <div className="gap-space-4 flex flex-col">
      <div className="gap-space-1 flex flex-col">
        <p className="type-caption text-cyan">{t.title}</p>
        <h1 className="type-title text-foreground">{poll.question}</h1>
        <p className="type-body-sm text-muted-foreground">{poll.changeable ? t.changeable : t.fixed}</p>
        {reward ? <p className="type-body-sm text-foreground">{reward}</p> : null}
      </div>

      {message ? (
        <p ref={messageRef} tabIndex={-1} role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border outline-none">
          {message}
        </p>
      ) : null}
      {error ? <InlineAlert>{t.errors[error]}</InlineAlert> : null}

      <Card>
        <form onSubmit={submit} className="gap-space-4 flex flex-col">
          <fieldset className="gap-space-3 flex flex-col" disabled={pending || locked || closed}>
            <legend className="type-label text-foreground mb-space-2">{t.legend}</legend>
            {poll.options.map((option) => (
              <label key={option.id} className="relative cursor-pointer">
                <input type="radio" name="poll-option" value={option.id} checked={choice === option.id} onChange={() => setChoice(option.id)} className="peer sr-only" />
                <span
                  className={cn(
                    "gap-space-3 border-line-strong bg-bg-deep p-space-3 peer-checked:border-primary peer-checked:bg-surface-raised peer-focus-visible:ring-ring flex min-h-14 items-center rounded-md border peer-focus-visible:ring-[3px] peer-disabled:cursor-default",
                  )}
                >
                  {option.image ? <Thumbnail url={option.image.url} size={56} /> : null}
                  <span className="type-body text-foreground">{option.text}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {votedText ? <p className="type-body-sm text-muted-foreground">{interpolate(t.yourVote, { option: votedText })}</p> : null}
          {locked || closed ? null : (
            <Button type="submit" block loading={pending} disabled={!choice || choice === voted}>
              {pending ? t.sending : voted ? t.change : t.vote}
            </Button>
          )}
        </form>
      </Card>
    </div>
  );
}
