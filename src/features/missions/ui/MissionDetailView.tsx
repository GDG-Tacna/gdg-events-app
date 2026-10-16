"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, ButtonLink, Card, Icon, InlineAlert, TextField, UnlockedBadges, type PlanetKind } from "@/shared/ui";
import type { CompletionStatus } from "../domain/completion";
import type { MissionType } from "../domain/mission";
import type { BoardMission, MissionErrorCode } from "../domain/use-cases";
import type { MissionAnswer, SubmitMissionAction } from "./answer-action";
import { MISSION_TYPE_ICON, MissionTags } from "./MissionTags";

export interface MissionDetailViewProps {
  mission: BoardMission;
  answer: SubmitMissionAction;
  backHref: string;
  scanHref: string;
  /** The cadet's QR: at a stand the staff scan it (absent with check-ins off). */
  passHref?: string;
  /** The mission's quadrant, for its tag (absent when the plan cannot name it). */
  quadrant?: { name: string; planet: PlanetKind } | null;
  /** True when the mission offers a mini-game the edition has on. */
  minigame?: boolean;
  /** The Logros tab, linked from a badge an answer unlocked (absent when achievements are off). */
  achievementsHref?: string;
  /** The mini-game bonus of a completed mission, built by the app shell (the missions feature does not know mini-games). */
  bonusSlot?: ReactNode;
}

interface Progress {
  status: "open" | CompletionStatus;
  xpEarned: number;
  creditsEarned: number;
  attemptsLeft: number | null;
}

/** What the last answer means, in words; `null` before any answer. */
type Feedback = { tone: "success" | "info"; text: string } | null;

function feedbackFor(type: MissionType, next: Progress): Feedback {
  if (next.status === "completed") {
    if (next.xpEarned > 0 && next.creditsEarned > 0) {
      return { tone: "success", text: interpolate(copy.missions.result.correctBoth, { xp: formatNumber(next.xpEarned), credits: formatNumber(next.creditsEarned) }) };
    }
    return next.xpEarned > 0
      ? { tone: "success", text: interpolate(copy.missions.result.correct, { xp: formatNumber(next.xpEarned) }) }
      : { tone: "success", text: copy.missions.result.correctNoXp };
  }
  if (next.status === "failed") return { tone: "info", text: copy.missions.result.wrongClosed };
  if (type === "keyword") return { tone: "info", text: copy.missions.result.wrongKeyword };
  return { tone: "info", text: copy.missions.result.wrongRetry };
}

/**
 * One mission, and how to complete it: a quiz shows its options, a keyword mission a field, a talk or speaker mission
 * sends the cadet to the scanner and a stand mission to their own QR (the staff scan it at the stand). Whether an answer is right is decided on the
 * server; this screen shows the answer it gets back and refreshes the board behind it.
 */
export function MissionDetailView({ mission, answer, backHref, scanHref, passHref, quadrant, minigame, achievementsHref, bonusSlot }: MissionDetailViewProps) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress>({ status: mission.status, xpEarned: mission.xpEarned, creditsEarned: mission.creditsEarned, attemptsLeft: mission.attemptsLeft });
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [error, setError] = useState<MissionErrorCode | null>(null);
  const [unlocked, setUnlocked] = useState<ReadonlyArray<{ id: string; name: string; tone: string; imageUrl?: string | null }>>([]);
  const [pending, startTransition] = useTransition();
  const feedbackRef = useRef<HTMLParagraphElement>(null);

  const answerable = progress.status === "open" || progress.status === "in-progress";

  // An answer replaces the question with its result: move focus there so it is read out.
  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  function send(given: MissionAnswer) {
    setError(null);
    startTransition(async () => {
      let result;
      try {
        result = await answer({ missionId: mission.id, answer: given });
      } catch {
        result = { ok: false as const, code: "unknown" as const };
      }
      if (!result.ok) {
        setError(result.code);
        return;
      }
      const next: Progress = { status: result.status, xpEarned: result.xpEarned, creditsEarned: result.creditsEarned, attemptsLeft: result.attemptsLeft };
      setProgress(next);
      setFeedback(feedbackFor(mission.type, next));
      setUnlocked(result.achievements ?? []);
      router.refresh();
    });
  }

  return (
    <div className="gap-space-5 flex flex-col">
      <ButtonLink href={backHref} variant="ghost" size="sm" className="-ml-space-4 self-start">
        {copy.missions.back}
      </ButtonLink>

      <header className="gap-space-3 flex flex-col">
        <div className="gap-space-3 flex items-start">
          <span aria-hidden="true" className="border-cyan/50 text-cyan bg-bg-deep relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border">
            {mission.imageUrl ? <Image src={mission.imageUrl} alt="" fill unoptimized sizes="56px" className="object-cover" /> : <Icon name={MISSION_TYPE_ICON[mission.type]} size={26} />}
          </span>
          <div className="gap-space-1 flex min-w-0 flex-1 flex-col">
            <h1 className="type-title text-foreground">{mission.title}</h1>
            <span className="gap-space-2 flex items-center">
              <span className="type-pixel-tag text-primary">{interpolate(copy.missions.xp, { xp: formatNumber(mission.xp) })}</span>
              {mission.credits > 0 ? <span className="type-pixel-tag text-gold">{interpolate(copy.missions.credits, { n: formatNumber(mission.credits) })}</span> : null}
            </span>
          </div>
        </div>
        <MissionTags type={mission.type} quadrant={quadrant} minigame={minigame} />
        {mission.description ? <p className="type-body text-muted-foreground">{mission.description}</p> : null}
      </header>

      <div aria-live="polite">
        {feedback ? (
          <p
            ref={feedbackRef}
            tabIndex={-1}
            className={cn(
              "type-label gap-space-2 p-space-3 flex items-center rounded-md border focus-visible:outline-none",
              feedback.tone === "success" ? "border-accent/60 text-accent bg-accent/10" : "border-line-strong text-foreground bg-surface-raised",
            )}
          >
            <Icon name={feedback.tone === "success" ? "check" : progress.status === "failed" ? "failed" : "alert"} size={20} />
            {feedback.text}
          </p>
        ) : !answerable ? (
          <ClosedNote status={progress.status} xpEarned={progress.xpEarned} creditsEarned={progress.creditsEarned} />
        ) : null}
      </div>

      <UnlockedBadges badges={unlocked} href={achievementsHref} />

      {bonusSlot}

      {error ? <InlineAlert>{copy.missions.errors[error]}</InlineAlert> : null}

      {answerable && mission.config.type === "quiz" ? (
        <QuizForm key={progress.attemptsLeft ?? 0} options={mission.config.options} question={mission.config.question} pending={pending} onAnswer={(option) => send({ kind: "choice", option })} attemptsLeft={progress.attemptsLeft} />
      ) : null}

      {answerable && mission.config.type === "keyword" ? (
        <KeywordForm prompt={mission.config.prompt} pending={pending} onAnswer={(value) => send({ kind: "keyword", value })} />
      ) : null}

      {answerable && (mission.config.type === "talk" || mission.config.type === "stand" || mission.config.type === "speaker") ? (
        <Card className="gap-space-4 flex flex-col">
          <p className="type-body text-foreground">{copy.missions.howTo[mission.config.type]}</p>
          {mission.config.type !== "stand" ? (
            <ButtonLink href={scanHref} variant="primary">
              {copy.missions.scan}
            </ButtonLink>
          ) : passHref ? (
            <ButtonLink href={passHref} variant="primary">
              {copy.missions.showQr}
            </ButtonLink>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function ClosedNote({ status, xpEarned, creditsEarned }: { status: "open" | CompletionStatus; xpEarned: number; creditsEarned: number }) {
  const completed = status === "completed";
  return (
    <p
      className={cn(
        "type-label gap-space-2 p-space-3 flex items-center rounded-md border",
        completed ? "border-accent/60 text-accent bg-accent/10" : "border-line-strong text-muted-foreground bg-surface-raised",
      )}
    >
      <Icon name={completed ? "check" : "failed"} size={20} />
      {!completed
        ? copy.missions.result.failed
        : creditsEarned > 0
          ? interpolate(copy.missions.result.completedBoth, { xp: formatNumber(xpEarned), credits: formatNumber(creditsEarned) })
          : interpolate(copy.missions.result.completed, { xp: formatNumber(xpEarned) })}
    </p>
  );
}

function QuizForm({
  question,
  options,
  attemptsLeft,
  pending,
  onAnswer,
}: {
  question: string;
  options: readonly string[];
  attemptsLeft: number | null;
  pending: boolean;
  onAnswer: (option: number) => void;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const name = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (choice !== null) onAnswer(choice);
  }

  return (
    <Card>
      <form onSubmit={submit} className="gap-space-4 flex flex-col">
        <fieldset className="gap-space-3 flex flex-col" disabled={pending}>
          <legend className="type-heading text-foreground mb-space-3">{question}</legend>
          <p className="type-caption text-text-subtle">
            {attemptsLeft === 1 ? copy.missions.attemptsLeft.one : copy.missions.quiz.rule}
          </p>
          {options.map((option, index) => (
            <label
              key={option}
              className={cn(
                "gap-space-3 px-space-4 has-[:focus-visible]:ring-ring flex min-h-12 cursor-pointer items-center rounded-md border-2 py-2 has-[:focus-visible]:ring-[3px]",
                choice === index ? "border-primary bg-surface-raised" : "border-line-strong",
              )}
            >
              <input type="radio" name={name} value={index} checked={choice === index} onChange={() => setChoice(index)} className="accent-primary size-5" />
              <span className="type-body text-foreground">{option}</span>
            </label>
          ))}
        </fieldset>
        <Button type="submit" size="lg" block loading={pending} disabled={choice === null}>
          {pending ? copy.missions.quiz.sending : copy.missions.quiz.submit}
        </Button>
      </form>
    </Card>
  );
}

function KeywordForm({ prompt, pending, onAnswer }: { prompt: string; pending: boolean; onAnswer: (value: string) => void }) {
  const [value, setValue] = useState("");
  const [empty, setEmpty] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (value.trim().length === 0) {
      setEmpty(true);
      return;
    }
    setEmpty(false);
    onAnswer(value);
  }

  return (
    <Card>
      <form onSubmit={submit} className="gap-space-4 flex flex-col" noValidate>
        <p className="type-body text-foreground">{prompt}</p>
        <TextField
          label={copy.missions.keyword.label}
          hint={copy.missions.keyword.hint}
          error={empty ? copy.missions.keyword.empty : null}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={60}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={pending}
        />
        <Button type="submit" size="lg" block loading={pending}>
          {pending ? copy.missions.quiz.sending : copy.missions.keyword.submit}
        </Button>
      </form>
    </Card>
  );
}
