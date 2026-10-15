"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ImageField, type ImageRef, type UploadImageAction } from "@/features/media";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Button, ButtonLink, Card, InlineAlert, SelectField, TextField } from "@/shared/ui";
import type { MissionAdminErrorCode, MissionDraft } from "../domain/manage";
import {
  checkMission,
  DEFAULT_XP,
  MINIGAME_DIFFICULTIES,
  MISSION_TYPES,
  QUIZ_OPTIONS_MAX,
  QUIZ_OPTIONS_MIN,
  type Mission,
  type MissionConfig,
  type MissionType,
} from "../domain/mission";
import type { AdminOption, MinigameOption, SaveMissionAction } from "./admin-actions";

export interface MissionFormProps {
  mode: "create" | "edit";
  /** The mission being edited (edit mode). */
  mission?: Mission;
  /** A mission to start from when creating (an AI suggestion): every field prefilled, its id suggested. */
  initial?: Mission;
  save: SaveMissionAction;
  /** Uploads the mission's picture. */
  upload: UploadImageAction;
  /** Active quadrants of the edition. */
  quadrants: readonly AdminOption[];
  /** Active checkpoints a talk or a stand mission can point to. */
  checkpoints: { talk: readonly AdminOption[]; stand: readonly AdminOption[] };
  listHref: string;
  /** The edition's G-Credits per mission type (Economía), shown as the default; absent when credits are off. */
  creditDefaults?: Partial<Record<MissionType, number>>;
  /** Every mini-game built, with whether the edition offers it; absent when mini-games are off (the mission keeps its own). */
  minigames?: readonly MinigameOption[];
}

/** "Desafío de Firebase" becomes "desafio-de-firebase". */
function suggestId(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** Which field each error belongs to; the rest are shown above the form. */
type Field =
  | "id"
  | "title"
  | "description"
  | "quadrant"
  | "xp"
  | "credits"
  | "checkpoint"
  | "question"
  | "options"
  | "answer"
  | "prompt"
  | "keywords"
  | "minigame"
  | "minigameDifficulty"
  | "image";
const FIELD_OF: Partial<Record<MissionAdminErrorCode, Field>> = {
  "invalid-id": "id",
  "already-exists": "id",
  "invalid-title": "title",
  "invalid-description": "description",
  "invalid-quadrant": "quadrant",
  "unknown-quadrant": "quadrant",
  "invalid-xp": "xp",
  "invalid-credits": "credits",
  "invalid-checkpoint": "checkpoint",
  "unknown-checkpoint": "checkpoint",
  "invalid-question": "question",
  "invalid-options": "options",
  "invalid-answer": "answer",
  "invalid-prompt": "prompt",
  "invalid-keywords": "keywords",
  "unknown-minigame": "minigame",
  "invalid-minigame-difficulty": "minigameDifficulty",
  "invalid-image": "image",
};

/** The mission's config when it is of the given type (to prefill that type's fields). */
const configOf = <T extends MissionType>(mission: Mission | undefined, type: T) =>
  mission?.config.type === type ? (mission.config as Extract<MissionConfig, { type: T }>) : null;

/**
 * Create or edit a mission: texts, quadrant, XP and what completes it, by type. The type is chosen once.
 * The same rules as the server are checked before sending, field by field; whether the quadrant and the
 * checkpoint exist is checked by the server. Goes back to the list once saved.
 */
export function MissionForm({ mode, mission, initial, save, upload, quadrants, checkpoints, listHref, creditDefaults, minigames }: MissionFormProps) {
  const router = useRouter();
  // What prefills the fields: the mission being edited, or a suggestion to start a new one from.
  const seed = mission ?? initial;
  const [type, setType] = useState<MissionType>(seed?.config.type ?? "quiz");
  const [title, setTitle] = useState(seed?.title ?? "");
  const [description, setDescription] = useState(seed?.description ?? "");
  const [idDraft, setIdDraft] = useState<string | null>(mode === "create" ? (initial?.id ?? null) : null);
  const [quadrantId, setQuadrantId] = useState(seed?.quadrantId ?? quadrants[0]?.id ?? "");
  const [xp, setXp] = useState(String(seed?.xp ?? DEFAULT_XP[type]));
  const [credits, setCredits] = useState(seed?.credits === null || seed?.credits === undefined ? "" : String(seed.credits));
  const [xpTouched, setXpTouched] = useState(mode === "edit" || initial !== undefined);

  const quiz = configOf(seed, "quiz");
  const keyword = configOf(seed, "keyword");
  const scan = seed && (seed.config.type === "talk" || seed.config.type === "stand") ? seed.config : null;
  const [checkpointId, setCheckpointId] = useState(scan?.checkpointId ?? "");
  const [question, setQuestion] = useState(quiz?.question ?? "");
  const [options, setOptions] = useState<string[]>(quiz ? [...quiz.options] : ["", ""]);
  const [answer, setAnswer] = useState(quiz?.answer ?? 0);
  const [prompt, setPrompt] = useState(keyword?.prompt ?? "");
  const [keywords, setKeywords] = useState(keyword ? keyword.keywords.join(", ") : "");
  // "" is no game, and no difficulty of its own (the edition's). A game no longer built could never be played: it starts as none.
  const [minigame, setMinigame] = useState(seed?.minigame && (!minigames || minigames.some((game) => game.id === seed.minigame)) ? seed.minigame : "");
  const [minigameDifficulty, setMinigameDifficulty] = useState<string>(seed?.minigameDifficulty ?? "");

  const [image, setImage] = useState<ImageRef | null>(mission?.image ?? null);
  // Only a changed picture is sent: an untouched form keeps the stored one.
  const [imageChanged, setImageChanged] = useState(false);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<MissionAdminErrorCode | null>(null);

  const id = mode === "edit" && mission ? mission.id : (idDraft ?? suggestId(title));
  const scanOptions = type === "talk" || type === "stand" ? checkpoints[type] : [];
  const field = error ? FIELD_OF[error] : undefined;
  const fieldError = (name: Field) => (field === name && error ? copy.admin.missions.errors[error] : null);

  function changeType(next: MissionType) {
    setType(next);
    // A fresh mission takes the default XP of its type until the admin types their own.
    if (!xpTouched) setXp(String(DEFAULT_XP[next]));
    setCheckpointId("");
  }

  function config(): MissionConfig | Record<string, unknown> {
    switch (type) {
      case "talk":
      case "stand":
        return { type, checkpointId: checkpointId || (scanOptions[0]?.id ?? "") };
      case "quiz":
        return { type, question, options, answer };
      case "keyword":
        return { type, prompt, keywords: keywords.split(",").map((word) => word.trim()).filter(Boolean) };
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const draft: MissionDraft = {
      title,
      description,
      quadrantId,
      xp: Number(xp),
      credits: credits === "" ? null : Number(credits),
      minigame: minigame || null,
      minigameDifficulty: minigame && minigameDifficulty ? minigameDifficulty : null,
      config: config(),
      ...(imageChanged ? { imagePath: image?.path ?? null } : {}),
    };

    const checked = checkMission(id, draft);
    if (!checked.ok) {
      setError(checked.code);
      return;
    }

    setPending(true);
    setError(null);
    let result;
    try {
      result = await save({ id, draft });
    } catch {
      result = { ok: false as const, code: "unknown" as const };
    }
    setPending(false);
    if (!result.ok) {
      setError(result.code);
      return;
    }
    router.push(listHref);
    router.refresh();
  }

  const typeOptions = MISSION_TYPES.map((value) => ({ value, label: copy.missions.types[value] }));

  return (
    <div className="gap-space-4 flex flex-col">
      <div>
        <ButtonLink href={listHref} variant="ghost" size="sm" className="-ml-space-4">
          {copy.admin.missions.form.back}
        </ButtonLink>
      </div>
      <h1 className="type-title-xl text-foreground">{mode === "create" ? copy.admin.missions.form.createTitle : copy.admin.missions.form.editTitle}</h1>

      {error && !field ? <InlineAlert>{copy.admin.missions.errors[error]}</InlineAlert> : null}

      <Card>
        <form onSubmit={handleSubmit} noValidate className="gap-space-5 flex flex-col">
          <SelectField
            label={copy.admin.missions.form.type}
            options={typeOptions}
            value={type}
            disabled={mode === "edit" || pending}
            hint={mode === "edit" ? copy.admin.missions.form.typeLocked : undefined}
            onChange={(event) => changeType(event.target.value as MissionType)}
          />
          <TextField
            label={copy.admin.missions.form.title}
            hint={copy.admin.missions.form.titleHint}
            value={title}
            maxLength={60}
            autoComplete="off"
            readOnly={pending}
            error={fieldError("title")}
            onChange={(event) => setTitle(event.target.value)}
          />
          <TextField
            label={copy.admin.missions.form.description}
            hint={copy.admin.missions.form.descriptionHint}
            value={description}
            maxLength={200}
            autoComplete="off"
            readOnly={pending}
            error={fieldError("description")}
            onChange={(event) => setDescription(event.target.value)}
          />
          <div className="gap-space-1 flex flex-col">
            <ImageField
              label={copy.admin.missions.form.image}
              purpose="mission"
              value={image}
              upload={upload}
              disabled={pending}
              onChange={(next) => {
                setImage(next);
                setImageChanged(true);
              }}
            />
            <p className="type-caption text-text-subtle">{copy.admin.missions.form.imageHint}</p>
            {fieldError("image") ? (
              <p role="alert" className="type-body-sm text-danger">
                {fieldError("image")}
              </p>
            ) : null}
          </div>
          {mode === "create" ? (
            <TextField
              label={copy.admin.missions.form.id}
              hint={copy.admin.missions.form.idHint}
              value={id}
              maxLength={40}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              readOnly={pending}
              error={fieldError("id")}
              onChange={(event) => setIdDraft(event.target.value)}
            />
          ) : null}
          <div className="gap-space-4 grid min-[520px]:grid-cols-2">
            <SelectField
              label={copy.admin.missions.form.quadrant}
              options={quadrants.map((quadrant) => ({ value: quadrant.id, label: quadrant.name }))}
              value={quadrantId}
              disabled={pending}
              error={fieldError("quadrant")}
              onChange={(event) => setQuadrantId(event.target.value)}
            />
            <TextField
              label={copy.admin.missions.form.xp}
              hint={interpolate(copy.admin.missions.form.xpHint, { xp: String(DEFAULT_XP[type]) })}
              value={xp}
              inputMode="numeric"
              maxLength={3}
              autoComplete="off"
              readOnly={pending}
              error={fieldError("xp")}
              onChange={(event) => {
                setXpTouched(true);
                setXp(event.target.value.replace(/[^0-9]/g, ""));
              }}
            />
          </div>
          {creditDefaults ? (
            <TextField
              label={copy.admin.missions.form.credits}
              hint={interpolate(copy.admin.missions.form.creditsHint, { n: String(creditDefaults[type] ?? 0) })}
              value={credits}
              inputMode="numeric"
              maxLength={4}
              autoComplete="off"
              readOnly={pending}
              error={fieldError("credits")}
              onChange={(event) => setCredits(event.target.value.replace(/[^0-9]/g, ""))}
            />
          ) : null}

          {type === "talk" || type === "stand" ? (
            scanOptions.length > 0 ? (
              <SelectField
                label={copy.admin.missions.form.checkpoint[type]}
                hint={copy.admin.missions.form.checkpointHint[type]}
                options={scanOptions.map((checkpoint) => ({ value: checkpoint.id, label: checkpoint.name }))}
                value={checkpointId || scanOptions[0].id}
                disabled={pending}
                error={fieldError("checkpoint")}
                onChange={(event) => setCheckpointId(event.target.value)}
              />
            ) : (
              <InlineAlert>{copy.admin.missions.form.noCheckpoints[type]}</InlineAlert>
            )
          ) : null}

          {type === "quiz" ? (
            <QuizFields
              question={question}
              options={options}
              answer={answer}
              pending={pending}
              errors={{ question: fieldError("question"), options: fieldError("options") ?? fieldError("answer") }}
              onQuestion={setQuestion}
              onOptions={setOptions}
              onAnswer={setAnswer}
            />
          ) : null}

          {type === "keyword" ? (
            <>
              <TextField
                label={copy.admin.missions.form.prompt}
                hint={copy.admin.missions.form.promptHint}
                value={prompt}
                maxLength={160}
                autoComplete="off"
                readOnly={pending}
                error={fieldError("prompt")}
                onChange={(event) => setPrompt(event.target.value)}
              />
              <TextField
                label={copy.admin.missions.form.keywords}
                hint={copy.admin.missions.form.keywordsHint}
                value={keywords}
                maxLength={200}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                readOnly={pending}
                error={fieldError("keywords")}
                onChange={(event) => setKeywords(event.target.value)}
              />
            </>
          ) : null}

          {minigames ? (
            <MinigameFields
              games={minigames}
              minigame={minigame}
              difficulty={minigameDifficulty}
              pending={pending}
              errors={{ minigame: fieldError("minigame"), difficulty: fieldError("minigameDifficulty") }}
              onMinigame={setMinigame}
              onDifficulty={setMinigameDifficulty}
            />
          ) : null}

          <Button type="submit" block loading={pending} disabled={(type === "talk" || type === "stand") && scanOptions.length === 0}>
            {pending ? copy.admin.missions.form.saving : copy.admin.missions.form.save}
          </Button>
        </form>
      </Card>
    </div>
  );
}

/**
 * The bonus game offered once the mission is done, and optionally its difficulty for this mission only. The games
 * the edition offers are listed; a game assigned before it was switched off stays listed (marked) so saving other
 * changes never drops it unseen.
 */
function MinigameFields({
  games,
  minigame,
  difficulty,
  pending,
  errors,
  onMinigame,
  onDifficulty,
}: {
  games: readonly MinigameOption[];
  minigame: string;
  difficulty: string;
  pending: boolean;
  errors: { minigame: string | null; difficulty: string | null };
  onMinigame: (value: string) => void;
  onDifficulty: (value: string) => void;
}) {
  const f = copy.admin.missions.form;
  const chosen = games.find((game) => game.id === minigame);
  const listed = games.filter((game) => game.enabled || game.id === minigame);
  const options = [
    { value: "", label: f.minigameNone },
    ...listed.map((game) => ({ value: game.id, label: game.enabled ? game.name : interpolate(f.minigameOff, { name: game.name }) })),
  ];

  return (
    <>
      <SelectField
        label={f.minigame}
        hint={f.minigameHint}
        options={options}
        value={minigame}
        disabled={pending}
        error={errors.minigame}
        onChange={(event) => onMinigame(event.target.value)}
      />
      {chosen && !chosen.enabled ? <InlineAlert>{f.minigameOffNote}</InlineAlert> : null}
      {chosen ? (
        <SelectField
          label={f.minigameDifficulty}
          hint={f.minigameDifficultyHint}
          options={[
            { value: "", label: interpolate(f.minigameDifficultyEdition, { level: copy.minigames.difficulty[chosen.difficulty] }) },
            ...MINIGAME_DIFFICULTIES.map((level) => ({ value: level, label: copy.minigames.difficulty[level] })),
          ]}
          value={difficulty}
          disabled={pending}
          error={errors.difficulty}
          onChange={(event) => onDifficulty(event.target.value)}
        />
      ) : null}
    </>
  );
}

function QuizFields({
  question,
  options,
  answer,
  pending,
  errors,
  onQuestion,
  onOptions,
  onAnswer,
}: {
  question: string;
  options: string[];
  answer: number;
  pending: boolean;
  errors: { question: string | null; options: string | null };
  onQuestion: (value: string) => void;
  onOptions: (value: string[]) => void;
  onAnswer: (value: number) => void;
}) {
  function remove(index: number) {
    onOptions(options.filter((_, current) => current !== index));
    // Keep the right answer on the same option, or on the first one if it was removed.
    if (answer === index) onAnswer(0);
    else if (answer > index) onAnswer(answer - 1);
  }

  return (
    <>
      <TextField
        label={copy.admin.missions.form.question}
        value={question}
        maxLength={160}
        autoComplete="off"
        readOnly={pending}
        error={errors.question}
        onChange={(event) => onQuestion(event.target.value)}
      />
      <fieldset className="gap-space-3 flex flex-col" disabled={pending}>
        <legend className="type-label text-foreground mb-space-2">{copy.admin.missions.form.options}</legend>
        <p className="type-caption text-text-subtle">{copy.admin.missions.form.correctLegend}</p>
        {options.map((option, index) => {
          const n = String(index + 1);
          return (
            <div key={index} className="gap-space-3 flex items-end">
              <label className="gap-space-2 type-caption text-muted-foreground flex h-12 shrink-0 items-center">
                <input
                  type="radio"
                  name="correct-option"
                  checked={answer === index}
                  onChange={() => onAnswer(index)}
                  aria-label={`${copy.admin.missions.form.correct}: ${interpolate(copy.admin.missions.form.option, { n })}`}
                  className="accent-primary size-5"
                />
                <span aria-hidden="true">{copy.admin.missions.form.correct}</span>
              </label>
              <div className="min-w-0 flex-1">
                <TextField
                  label={interpolate(copy.admin.missions.form.option, { n })}
                  value={option}
                  maxLength={80}
                  autoComplete="off"
                  onChange={(event) => onOptions(options.map((current, at) => (at === index ? event.target.value : current)))}
                />
              </div>
              {options.length > QUIZ_OPTIONS_MIN ? (
                <Button type="button" variant="ghost" size="sm" aria-label={interpolate(copy.admin.missions.form.removeOption, { n })} onClick={() => remove(index)}>
                  ✕
                </Button>
              ) : null}
            </div>
          );
        })}
        {options.length < QUIZ_OPTIONS_MAX ? (
          <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => onOptions([...options, ""])}>
            {copy.admin.missions.form.addOption}
          </Button>
        ) : null}
        {errors.options ? (
          <p role="alert" className="type-body-sm text-danger">
            {errors.options}
          </p>
        ) : null}
      </fieldset>
    </>
  );
}
