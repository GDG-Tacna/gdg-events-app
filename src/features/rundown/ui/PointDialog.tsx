"use client";

import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { Button, FormDialog, TextField } from "@/shared/ui";
import { isMinutes } from "../domain/rundown";

const t = copy.stageConsole.point;

export interface PointDraft {
  title: string;
  who: string;
  time: string;
  minutes: number | null;
}

export interface PointDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` for a new point; otherwise the one being edited. */
  point: { title: string; who: string; time: string; minutes: number | null; custom: boolean } | null;
  /** Saves the point; answers an error text to show, or `null` when it was saved. */
  onSave: (draft: PointDraft) => Promise<string | null>;
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * «Añadir punto» and «Editar punto». A point made here (a break, a welcome, a raffle) has a name, who is in charge, a time
 * and the minutes planned; a talk of the agenda can only be given its minutes, because the rest is edited in Charlas.
 * Mount it with a `key` per point, so each one starts from its own values.
 */
export function PointDialog({ open, onOpenChange, point, onSave }: PointDialogProps) {
  const editsTalk = point !== null && !point.custom;
  const [title, setTitle] = useState(point?.title ?? "");
  const [who, setWho] = useState(point?.who ?? "");
  const [time, setTime] = useState(point?.time ?? "");
  const [minutes, setMinutes] = useState(point?.minutes ? String(point.minutes) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const wholeMinutes = minutes.trim() === "" ? null : Number(minutes);
    if (!editsTalk && !title.trim()) return setError(t.errors.title);
    if (!editsTalk && time !== "" && !CLOCK.test(time)) return setError(t.errors.time);
    if (wholeMinutes !== null && !isMinutes(wholeMinutes)) return setError(t.errors.minutes);
    setPending(true);
    setError(null);
    const failed = await onSave({ title: title.trim(), who: who.trim(), time, minutes: wholeMinutes });
    setPending(false);
    if (failed) return setError(failed);
    onOpenChange(false);
  }

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={point ? t.editTitle : t.newTitle} description={editsTalk ? `${point.title}. ${t.talkHint}` : t.hint}>
      <form onSubmit={(event) => void submit(event)} className="gap-space-4 flex flex-col">
        {error ? (
          <p role="alert" className="type-body-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        {editsTalk ? null : (
          <>
            <TextField label={t.title} value={title} maxLength={80} autoComplete="off" onChange={(event) => setTitle(event.target.value)} />
            <TextField label={t.who} value={who} maxLength={80} autoComplete="off" onChange={(event) => setWho(event.target.value)} />
            <TextField label={t.time} hint={t.timeHint} value={time} placeholder="10:40" inputMode="numeric" maxLength={5} autoComplete="off" onChange={(event) => setTime(event.target.value)} />
          </>
        )}
        <TextField label={t.minutes} hint={t.minutesHint} value={minutes} inputMode="numeric" maxLength={3} autoComplete="off" onChange={(event) => setMinutes(event.target.value.replace(/\D/g, ""))} />
        <Button type="submit" loading={pending} disabled={pending}>
          {pending ? t.saving : t.save}
        </Button>
      </form>
    </FormDialog>
  );
}
