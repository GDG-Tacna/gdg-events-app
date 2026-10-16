"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ImageField, type ImageRef, type UploadImageAction } from "@/features/media";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Button, ButtonLink, Card, Icon, InlineAlert, TextField, Toggle } from "@/shared/ui";
import { POLL_OPTIONS_MAX, POLL_OPTIONS_MIN, POLL_OPTION_MAX, POLL_QUESTION_MAX, POLL_REWARD_KINDS, checkPollDraft, type Poll, type PollDraft, type PollRewardKind } from "../domain/poll";
import type { PollAdminErrorCode } from "../domain/manage";
import type { SavePollAction } from "./actions";

export interface PollFormProps {
  /** The draft being edited; absent to create one. */
  poll?: Poll;
  save: SavePollAction;
  upload: UploadImageAction;
  listHref: string;
}

const t = copy.admin.polls;
const f = t.form;

interface OptionState {
  key: number;
  text: string;
  image: ImageRef | null;
}

/**
 * Creates or edits a draft poll: the question, 2..6 options (text, and an optional picture the text describes),
 * whether a vote can change, and the prize. The form checks the same rules as the server to answer at once.
 */
export function PollForm({ poll, save, upload, listHref }: PollFormProps) {
  const router = useRouter();
  const [question, setQuestion] = useState(poll?.question ?? "");
  const [options, setOptions] = useState<OptionState[]>(
    poll ? poll.options.map((option, index) => ({ key: index, text: option.text, image: option.image })) : [{ key: 0, text: "", image: null }, { key: 1, text: "", image: null }],
  );
  const [nextKey, setNextKey] = useState(options.length);
  const [changeable, setChangeable] = useState(poll?.changeable ?? false);
  const [rewardKind, setRewardKind] = useState<PollRewardKind>(poll?.reward.kind ?? "none");
  const [amount, setAmount] = useState(poll && poll.reward.kind !== "none" ? String(poll.reward.amount) : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PollAdminErrorCode | null>(null);

  const setOption = (key: number, patch: Partial<OptionState>) => setOptions((prev) => prev.map((option) => (option.key === key ? { ...option, ...patch } : option)));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const draft: PollDraft = {
      question,
      options: options.map((option) => ({ text: option.text, imagePath: option.image?.path ?? null })),
      changeable,
      reward: { kind: rewardKind, amount: rewardKind === "none" ? 0 : Number(amount) },
    };
    const checked = checkPollDraft(draft);
    if (!checked.ok) return setError(checked.error);

    setPending(true);
    setError(null);
    let result;
    try {
      result = await save(poll ? { id: poll.id, draft } : { draft });
    } catch {
      result = { ok: false as const, code: "unknown" as const };
    }
    setPending(false);
    if (!result.ok) return setError(result.code);
    router.push(listHref);
    router.refresh();
  }

  const fieldError = (codes: readonly PollAdminErrorCode[]) => (error && codes.includes(error) ? t.errors[error] : null);
  const otherError = error && !["invalid-question", "invalid-options", "invalid-reward"].includes(error) ? t.errors[error] : null;

  return (
    <div className="gap-space-4 flex flex-col">
      <div>
        <ButtonLink href={listHref} variant="ghost" size="sm" className="-ml-space-4">
          {f.back}
        </ButtonLink>
      </div>
      <h1 className="type-title-xl text-foreground">{poll ? f.editTitle : f.createTitle}</h1>
      <Card>
        <form onSubmit={submit} noValidate className="gap-space-5 flex flex-col">
          {otherError ? <InlineAlert>{otherError}</InlineAlert> : null}
          <TextField label={f.question} hint={f.questionHint} value={question} maxLength={POLL_QUESTION_MAX} readOnly={pending} error={fieldError(["invalid-question"])} onChange={(event) => setQuestion(event.target.value)} />

          <fieldset className="gap-space-3 flex flex-col" disabled={pending}>
            <legend className="type-label text-foreground mb-space-1">{f.optionsLegend}</legend>
            <p className="type-caption text-text-subtle">{f.optionsHint}</p>
            {fieldError(["invalid-options", "invalid-image"]) ? <InlineAlert>{fieldError(["invalid-options", "invalid-image"])}</InlineAlert> : null}
            <ol className="gap-space-3 flex flex-col">
              {options.map((option, index) => (
                <li key={option.key} className="border-line-strong bg-bg-deep p-space-3 gap-space-3 flex flex-col rounded-md border">
                  <div className="gap-space-2 flex items-end">
                    <div className="min-w-0 flex-1">
                      <TextField label={interpolate(f.option, { n: String(index + 1) })} value={option.text} maxLength={POLL_OPTION_MAX} onChange={(event) => setOption(option.key, { text: event.target.value })} />
                    </div>
                    {options.length > POLL_OPTIONS_MIN ? (
                      <Button type="button" variant="ghost" size="sm" aria-label={interpolate(f.removeOption, { n: String(index + 1) })} onClick={() => setOptions((prev) => prev.filter((candidate) => candidate.key !== option.key))}>
                        <Icon name="close" size={18} />
                      </Button>
                    ) : null}
                  </div>
                  <ImageField label={interpolate(f.optionImage, { n: String(index + 1) })} purpose="poll-option" value={option.image} upload={upload} disabled={pending} onChange={(image) => setOption(option.key, { image })} />
                </li>
              ))}
            </ol>
            {options.length < POLL_OPTIONS_MAX ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon="plus"
                className="self-start"
                onClick={() => {
                  setOptions((prev) => [...prev, { key: nextKey, text: "", image: null }]);
                  setNextKey((key) => key + 1);
                }}
              >
                {f.addOption}
              </Button>
            ) : null}
          </fieldset>

          <Toggle label={f.changeable} help={f.changeableHint} checked={changeable} disabled={pending} onChange={setChangeable} />

          <fieldset className="gap-space-3 flex flex-col" disabled={pending}>
            <legend className="type-label text-foreground mb-space-1">{f.rewardLegend}</legend>
            <p className="type-caption text-text-subtle">{f.rewardHint}</p>
            <div className="gap-space-2 flex flex-wrap">
              {POLL_REWARD_KINDS.map((kind) => (
                <label key={kind} className="relative cursor-pointer">
                  <input type="radio" name="poll-reward" value={kind} checked={rewardKind === kind} onChange={() => setRewardKind(kind)} className="peer sr-only" />
                  <span className="type-label border-line-strong bg-bg-deep peer-checked:border-primary peer-checked:bg-surface-raised peer-focus-visible:ring-ring px-space-4 inline-flex h-11 items-center rounded-md border peer-focus-visible:ring-[3px]">
                    {f.rewardKinds[kind]}
                  </span>
                </label>
              ))}
            </div>
            {rewardKind !== "none" ? (
              <TextField
                label={rewardKind === "xp" ? f.xpAmount : f.creditsAmount}
                hint={rewardKind === "xp" ? f.xpHint : f.creditsHint}
                value={amount}
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                error={fieldError(["invalid-reward"])}
                onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))}
              />
            ) : null}
          </fieldset>

          <Button type="submit" block loading={pending}>
            {pending ? f.saving : f.save}
          </Button>
        </form>
      </Card>
    </div>
  );
}
