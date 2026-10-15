"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import type { UploadImageAction } from "@/features/media";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Button, ButtonLink, Card, Icon, InlineAlert, SelectField, TextAreaField } from "@/shared/ui";
import type { Mission, MissionConfig } from "../domain/mission";
import { SUGGEST_COUNT_MAX, SUGGEST_TOPIC_MAX, SUGGEST_TOPIC_MIN, SUGGESTABLE_TYPES, type SuggestErrorCode, type SuggestedMission } from "../domain/suggest";
import type { AdminOption, SaveMissionAction } from "./admin-actions";
import { MissionForm } from "./MissionForm";
import type { SuggestMissionsAction } from "./suggest-action";

export interface SuggestMissionsViewProps {
  quadrants: readonly AdminOption[];
  checkpoints: { talk: readonly AdminOption[]; stand: readonly AdminOption[] };
  suggest: SuggestMissionsAction;
  save: SaveMissionAction;
  /** Uploads a mission's picture (the form opened from a suggestion). */
  upload: UploadImageAction;
  listHref: string;
  creditDefaults?: Partial<Record<"talk" | "stand" | "quiz" | "keyword", number>>;
}

const toMission = (suggestion: SuggestedMission): Mission => ({
  id: suggestion.id,
  ...suggestion.draft,
  config: suggestion.draft.config as MissionConfig,
  credits: suggestion.draft.credits ?? null,
  order: 0,
  active: true,
  minigame: null,
  minigameDifficulty: null,
});

/**
 * "Sugerir con IA": the admin describes a talk or stand and gets quiz and keyword mission drafts. Each one is
 * shown in full (with the right answer marked) and opens in the mission form to be reviewed and saved; nothing
 * is published by the AI.
 */
export function SuggestMissionsView({ quadrants, checkpoints, suggest, save, upload, listHref, creditDefaults }: SuggestMissionsViewProps) {
  const s = copy.admin.missions.suggestions;
  const [quadrantId, setQuadrantId] = useState(quadrants[0]?.id ?? "");
  const [topic, setTopic] = useState("");
  const [types, setTypes] = useState<string[]>([...SUGGESTABLE_TYPES]);
  const [count, setCount] = useState("3");
  const [error, setError] = useState<SuggestErrorCode | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedMission[]>([]);
  const [reviewing, setReviewing] = useState<SuggestedMission | null>(null);
  const [pending, startTransition] = useTransition();
  const resultsRef = useRef<HTMLHeadingElement>(null);

  // New proposals replace the form's answer: move focus to them so they are read out.
  useEffect(() => {
    if (suggestions.length > 0 && !reviewing) resultsRef.current?.focus();
  }, [suggestions, reviewing]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = topic.trim();
    if (trimmed.length < SUGGEST_TOPIC_MIN || trimmed.length > SUGGEST_TOPIC_MAX) return setError("invalid-topic");
    if (types.length === 0) return setError("invalid-types");
    setError(null);
    startTransition(async () => {
      let result;
      try {
        result = await suggest({ topic: trimmed, quadrantId, types, count: Number(count) });
      } catch {
        result = { ok: false as const, code: "unknown" as const };
      }
      if (!result.ok) {
        setError(result.code);
        return;
      }
      setSuggestions(result.suggestions);
    });
  }

  if (reviewing) {
    return (
      <div className="gap-space-4 flex flex-col">
        <div>
          <Button type="button" variant="ghost" size="sm" className="-ml-space-4" onClick={() => setReviewing(null)}>
            {s.backToResults}
          </Button>
        </div>
        <p className="type-body text-muted-foreground">{s.reviewing}</p>
        <p className="type-body-sm text-foreground border-gold/60 bg-gold/10 p-space-3 rounded-md border">{s.warning}</p>
        <MissionForm mode="create" initial={toMission(reviewing)} save={save} upload={upload} quadrants={quadrants} checkpoints={checkpoints} listHref={listHref} creditDefaults={creditDefaults} />
      </div>
    );
  }

  return (
    <div className="gap-space-5 flex flex-col">
      <div>
        <ButtonLink href={listHref} variant="ghost" size="sm" className="-ml-space-4">
          {s.back}
        </ButtonLink>
      </div>
      <header className="gap-space-2 flex flex-col">
        <h1 className="type-title-xl text-foreground">{s.title}</h1>
        <p className="type-body text-muted-foreground">{s.intro}</p>
      </header>

      {error ? <InlineAlert>{s.errors[error]}</InlineAlert> : null}

      <Card>
        <form onSubmit={submit} noValidate className="gap-space-5 flex flex-col">
          <SelectField
            label={s.quadrant}
            options={quadrants.map((quadrant) => ({ value: quadrant.id, label: quadrant.name }))}
            value={quadrantId}
            disabled={pending}
            onChange={(event) => setQuadrantId(event.target.value)}
          />
          <TextAreaField
            label={s.topic}
            hint={s.topicHint}
            value={topic}
            maxLength={SUGGEST_TOPIC_MAX}
            counter={{ current: topic.length, max: SUGGEST_TOPIC_MAX }}
            readOnly={pending}
            onChange={(event) => setTopic(event.target.value)}
          />
          <fieldset className="gap-space-2 flex flex-col" disabled={pending}>
            <legend className="type-label text-foreground mb-space-2">{s.types}</legend>
            <div className="gap-space-4 flex flex-wrap">
              {SUGGESTABLE_TYPES.map((type) => (
                <label key={type} className="gap-space-2 type-body text-foreground flex min-h-12 items-center">
                  <input
                    type="checkbox"
                    checked={types.includes(type)}
                    onChange={(event) => setTypes((current) => (event.target.checked ? [...current, type] : current.filter((value) => value !== type)))}
                    className="accent-primary size-5"
                  />
                  {copy.missions.types[type]}
                </label>
              ))}
            </div>
          </fieldset>
          <SelectField
            label={s.count}
            options={Array.from({ length: SUGGEST_COUNT_MAX }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }))}
            value={count}
            disabled={pending}
            onChange={(event) => setCount(event.target.value)}
          />
          <Button type="submit" size="lg" block loading={pending}>
            {pending ? s.thinking : s.submit}
          </Button>
        </form>
      </Card>

      {suggestions.length > 0 ? (
        <section aria-labelledby="suggestions-title" className="gap-space-3 flex flex-col">
          <h2 id="suggestions-title" ref={resultsRef} tabIndex={-1} className="type-title text-foreground focus-visible:outline-none">
            {s.resultsTitle}
          </h2>
          <p className="type-body-sm text-foreground border-gold/60 bg-gold/10 p-space-3 rounded-md border">{s.warning}</p>
          <ul aria-label={s.resultsLabel} className="gap-space-3 flex flex-col">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <SuggestionCard suggestion={suggestion} onReview={() => setReviewing(suggestion)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SuggestionCard({ suggestion, onReview }: { suggestion: SuggestedMission; onReview: () => void }) {
  const s = copy.admin.missions.suggestions;
  const config = suggestion.draft.config as MissionConfig;
  return (
    <Card className="gap-space-3 flex flex-col">
      <p className="type-caption text-muted-foreground gap-space-1 inline-flex items-center">
        <Icon name={config.type === "quiz" ? "question" : "key"} size={16} />
        {copy.missions.types[config.type]}
      </p>
      <h3 className="type-label text-foreground">{suggestion.draft.title}</h3>
      {suggestion.draft.description ? <p className="type-body-sm text-muted-foreground">{suggestion.draft.description}</p> : null}
      {config.type === "quiz" ? (
        <div className="gap-space-2 flex flex-col">
          <p className="type-body text-foreground">{config.question}</p>
          <ol className="gap-space-1 flex flex-col">
            {config.options.map((option, index) => (
              <li key={option} className="type-body-sm text-muted-foreground gap-space-2 flex items-center">
                {index === config.answer ? (
                  <>
                    <Icon name="check" size={16} className="text-accent" title={s.correct} />
                    <span className="text-foreground">{option}</span>
                  </>
                ) : (
                  <span className="pl-6">{option}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {config.type === "keyword" ? (
        <div className="gap-space-1 flex flex-col">
          <p className="type-body text-foreground">{config.prompt}</p>
          <p className="type-body-sm text-muted-foreground">{interpolate(s.keywords, { words: config.keywords.join(", ") })}</p>
        </div>
      ) : null}
      <Button type="button" variant="secondary" size="sm" className="self-start" onClick={onReview}>
        {s.review}
      </Button>
    </Card>
  );
}
