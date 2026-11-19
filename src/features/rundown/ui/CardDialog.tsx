"use client";

import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { Button, FormDialog, TextField } from "@/shared/ui";
import { CARD_KINDS, CARD_LINK_MAX, CARD_TEXT_MAX, CARD_TITLE_MAX, type CardKind, type LayerCard } from "../domain/layers";

const t = copy.stageConsole.layers.cardDialog;

export interface CardDraft {
  kind: CardKind;
  title: string;
  text: string;
  link: string;
  hideAfter: number | null;
}

export interface CardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` for a new card; otherwise the one being edited. */
  card: LayerCard | null;
  /** Saves the card; answers an error text to show, or `null` when it was saved. */
  onSave: (draft: CardDraft) => Promise<string | null>;
}

/** «Nueva tarjeta» and «Editar tarjeta». Mount it with a `key` per card, so each one starts from its own values. */
export function CardDialog({ open, onOpenChange, card, onSave }: CardDialogProps) {
  const [kind, setKind] = useState<CardKind>(card?.kind ?? "speaker");
  const [title, setTitle] = useState(card?.title ?? "");
  const [text, setText] = useState(card?.text ?? "");
  const [link, setLink] = useState(card?.link ?? "");
  const [hideAfter, setHideAfter] = useState(card?.hideAfter ? String(card.hideAfter) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const seconds = hideAfter.trim() === "" ? null : Number(hideAfter);
    if (!title.trim()) return setError(t.errors.title);
    if (seconds !== null && (!Number.isInteger(seconds) || seconds < 1 || seconds > 600)) return setError(t.errors.seconds);
    setPending(true);
    setError(null);
    const failed = await onSave({ kind, title: title.trim(), text: text.trim(), link: link.trim(), hideAfter: seconds });
    setPending(false);
    if (failed) return setError(failed);
    onOpenChange(false);
  }

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={card ? t.editTitle : t.newTitle} description={t.hint}>
      <form onSubmit={(event) => void submit(event)} className="gap-space-4 flex flex-col">
        {error ? (
          <p role="alert" className="type-body-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        <fieldset className="gap-space-2 flex flex-col">
          <legend className="type-label text-foreground">{t.kind}</legend>
          <div className="flex gap-2">
            {CARD_KINDS.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm font-semibold">
                <input type="radio" name="card-kind" value={option} checked={kind === option} onChange={() => setKind(option)} className="accent-ink size-5" />
                {t.kinds[option]}
              </label>
            ))}
          </div>
        </fieldset>
        <TextField label={kind === "speaker" ? t.titleSpeaker : t.titleNotice} value={title} maxLength={CARD_TITLE_MAX} autoComplete="off" onChange={(event) => setTitle(event.target.value)} />
        <TextField label={kind === "speaker" ? t.textSpeaker : t.textNotice} value={text} maxLength={CARD_TEXT_MAX} autoComplete="off" onChange={(event) => setText(event.target.value)} />
        <TextField label={t.link} hint={t.linkHint} value={link} maxLength={CARD_LINK_MAX} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(event) => setLink(event.target.value)} />
        <TextField label={t.hideAfter} hint={t.hideAfterHint} value={hideAfter} inputMode="numeric" maxLength={3} autoComplete="off" onChange={(event) => setHideAfter(event.target.value.replace(/\D/g, ""))} />
        <Button type="submit" loading={pending} disabled={pending}>
          {pending ? t.saving : t.save}
        </Button>
      </form>
    </FormDialog>
  );
}
