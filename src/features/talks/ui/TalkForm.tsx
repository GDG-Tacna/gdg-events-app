"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { Button, ButtonLink, Card, InlineAlert, SelectField, TextAreaField, TextField } from "@/shared/ui";
import type { TalkAdminErrorCode } from "../domain/manage";
import { TALK_DESCRIPTION_MAX, TALK_SPEAKER_MAX, TALK_TITLE_MAX, suggestTalkId } from "../domain/talk";
import type { SaveTalkAction, TalkView } from "./admin-actions";

export interface TalkFormProps {
  mode: "create" | "edit";
  talk?: TalkView;
  save: SaveTalkAction;
  /** The edition's quadrants, as the rooms a talk can be in. */
  rooms: ReadonlyArray<{ id: string; name: string }>;
  listHref: string;
  /** Edit only: where the talk's QR is projected (absent while the talk is closed: a closed talk has no code). */
  qrHref?: string;
}

const NO_ROOM = "";

type Field = "id" | "title" | "speaker" | "schedule" | "room" | "description";
const FIELD_OF: Partial<Record<TalkAdminErrorCode, Field>> = {
  "invalid-id": "id",
  "already-exists": "id",
  "invalid-title": "title",
  "invalid-speaker": "speaker",
  "invalid-schedule": "schedule",
  "invalid-description": "description",
  "unknown-room": "room",
};

/**
 * Create or edit a talk: title, speaker, start and end (the venue's wall clock), room and a short description.
 * The server checks everything again; this form only shows the errors next to their field. Editing offers the
 * talk's QR to project.
 */
export function TalkForm({ mode, talk, save, rooms, listHref, qrHref }: TalkFormProps) {
  const t = copy.admin.talks;
  const router = useRouter();
  const [title, setTitle] = useState(talk?.title ?? "");
  const [speaker, setSpeaker] = useState(talk?.speaker ?? "");
  const [startsAt, setStartsAt] = useState(talk?.startsAt ?? "");
  const [endsAt, setEndsAt] = useState(talk?.endsAt ?? "");
  const [roomId, setRoomId] = useState(talk?.roomId ?? NO_ROOM);
  const [description, setDescription] = useState(talk?.description ?? "");
  const [idDraft, setIdDraft] = useState<string | null>(null);
  const [error, setError] = useState<TalkAdminErrorCode | null>(null);
  const [pending, setPending] = useState(false);

  const id = mode === "edit" && talk ? talk.id : (idDraft ?? suggestTalkId(title));
  const field = error ? FIELD_OF[error] : undefined;
  const fieldError = (name: Field) => (field === name && error ? t.errors[error] : null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    let result;
    try {
      result = await save({ id, draft: { title, speaker, startsAt, endsAt, roomId: roomId === NO_ROOM ? null : roomId, description } });
    } catch {
      result = { ok: false as const, code: "unknown" as const };
    }
    setPending(false);
    if (!result.ok) return setError(result.code);
    router.push(listHref);
    router.refresh();
  }

  return (
    <div className="gap-space-4 flex flex-col">
      <div>
        <ButtonLink href={listHref} variant="ghost" size="sm" className="-ml-space-4">
          {t.form.back}
        </ButtonLink>
      </div>
      <h1 className="type-title-xl text-foreground">{mode === "create" ? t.form.createTitle : t.form.editTitle}</h1>
      {error && !field ? <InlineAlert>{t.errors[error]}</InlineAlert> : null}

      {qrHref ? (
        <Card className="gap-space-3 flex flex-col">
          <h2 className="type-title text-foreground">{t.form.qrTitle}</h2>
          <p className="type-body-sm text-muted-foreground">{t.form.qrBody}</p>
          <ButtonLink href={qrHref} variant="secondary">
            {t.project}
          </ButtonLink>
        </Card>
      ) : null}

      <Card>
        <form onSubmit={submit} noValidate className="gap-space-5 flex flex-col">
          <TextField label={t.form.title} value={title} maxLength={TALK_TITLE_MAX} autoComplete="off" readOnly={pending} error={fieldError("title")} onChange={(event) => setTitle(event.target.value)} />
          <TextField
            label={t.form.speaker}
            hint={t.form.speakerHint}
            value={speaker}
            maxLength={TALK_SPEAKER_MAX}
            autoComplete="off"
            readOnly={pending}
            error={fieldError("speaker")}
            onChange={(event) => setSpeaker(event.target.value)}
          />
          <fieldset className="gap-space-4 grid grid-cols-1 min-[560px]:grid-cols-2" aria-describedby="talk-schedule-hint">
            <legend className="sr-only">{`${t.form.startsAt} / ${t.form.endsAt}`}</legend>
            <TextField type="datetime-local" label={t.form.startsAt} value={startsAt} readOnly={pending} error={fieldError("schedule")} onChange={(event) => setStartsAt(event.target.value)} />
            <TextField type="datetime-local" label={t.form.endsAt} value={endsAt} min={startsAt || undefined} readOnly={pending} onChange={(event) => setEndsAt(event.target.value)} />
            <p id="talk-schedule-hint" className="type-caption text-text-subtle min-[560px]:col-span-2">
              {t.form.scheduleHint}
            </p>
          </fieldset>
          <SelectField
            label={t.form.room}
            hint={t.form.roomHint}
            options={[{ value: NO_ROOM, label: t.noRoom }, ...rooms.map((room) => ({ value: room.id, label: room.name }))]}
            value={roomId}
            disabled={pending}
            error={fieldError("room")}
            onChange={(event) => setRoomId(event.target.value)}
          />
          <TextAreaField
            label={t.form.description}
            hint={t.form.descriptionHint}
            value={description}
            maxLength={TALK_DESCRIPTION_MAX}
            counter={{ current: description.length, max: TALK_DESCRIPTION_MAX }}
            readOnly={pending}
            error={fieldError("description")}
            onChange={(event) => setDescription(event.target.value)}
          />
          {mode === "create" ? (
            <TextField
              label={t.form.id}
              hint={t.form.idHint}
              value={id}
              maxLength={48}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              readOnly={pending}
              error={fieldError("id")}
              onChange={(event) => setIdDraft(event.target.value)}
            />
          ) : null}
          <Button type="submit" block loading={pending}>
            {pending ? t.form.saving : t.form.save}
          </Button>
        </form>
      </Card>
    </div>
  );
}
