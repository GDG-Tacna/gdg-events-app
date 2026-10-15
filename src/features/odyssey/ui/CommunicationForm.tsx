"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { Button, ButtonLink, Card, InlineAlert, SelectField, TextAreaField, TextField } from "@/shared/ui";
import { checkCommunication, COMMUNICATION_BODY_MAX, COMMUNICATION_TITLE_MAX, type Communication } from "../domain/communication";
import type { OdysseyAdminErrorCode } from "../domain/manage";
import type { SaveCommunicationAction } from "./admin-actions";

export interface CommunicationFormProps {
  mode: "create" | "edit";
  communication?: Communication;
  save: SaveCommunicationAction;
  quadrants: ReadonlyArray<{ id: string; name: string }>;
  missions: ReadonlyArray<{ id: string; name: string }>;
  listHref: string;
}

const FROM_START = "";
const suggestId = (title: string) =>
  title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");

type Field = "id" | "title" | "body" | "quadrant" | "mission";
const FIELD_OF: Partial<Record<OdysseyAdminErrorCode, Field>> = {
  "invalid-id": "id",
  "already-exists": "id",
  "invalid-title": "title",
  "invalid-body": "body",
  "invalid-quadrant": "quadrant",
  "unknown-quadrant": "quadrant",
  "invalid-mission": "mission",
  "unknown-mission": "mission",
};

/** Create or edit a transmission: quadrant, title, text and the mission that deciphers it (or none). */
export function CommunicationForm({ mode, communication, save, quadrants, missions, listHref }: CommunicationFormProps) {
  const o = copy.admin.odyssey;
  const router = useRouter();
  const [quadrantId, setQuadrantId] = useState(communication?.quadrantId ?? quadrants[0]?.id ?? "");
  const [title, setTitle] = useState(communication?.title ?? "");
  const [body, setBody] = useState(communication?.body ?? "");
  const [unlock, setUnlock] = useState(communication?.unlockMissionId ?? FROM_START);
  const [idDraft, setIdDraft] = useState<string | null>(null);
  const [error, setError] = useState<OdysseyAdminErrorCode | null>(null);
  const [pending, setPending] = useState(false);

  const id = mode === "edit" && communication ? communication.id : (idDraft ?? suggestId(title));
  const field = error ? FIELD_OF[error] : undefined;
  const fieldError = (name: Field) => (field === name && error ? o.errors[error] : null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const draft = { quadrantId, title, body, unlockMissionId: unlock === FROM_START ? null : unlock };
    const checked = checkCommunication(id, { ...draft, active: true });
    if (!checked.ok) return setError(checked.code);

    setPending(true);
    setError(null);
    let result;
    try {
      result = await save({ id, draft });
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
          {o.form.back}
        </ButtonLink>
      </div>
      <h1 className="type-title-xl text-foreground">{mode === "create" ? o.form.createTitle : o.form.editTitle}</h1>
      {error && !field ? <InlineAlert>{o.errors[error]}</InlineAlert> : null}

      <Card>
        <form onSubmit={submit} noValidate className="gap-space-5 flex flex-col">
          <SelectField
            label={o.form.quadrant}
            options={quadrants.map((quadrant) => ({ value: quadrant.id, label: quadrant.name }))}
            value={quadrantId}
            disabled={pending}
            error={fieldError("quadrant")}
            onChange={(event) => setQuadrantId(event.target.value)}
          />
          <TextField label={o.form.title} hint={o.form.titleHint} value={title} maxLength={COMMUNICATION_TITLE_MAX} autoComplete="off" readOnly={pending} error={fieldError("title")} onChange={(event) => setTitle(event.target.value)} />
          <TextAreaField
            label={o.form.body}
            hint={o.form.bodyHint}
            value={body}
            maxLength={COMMUNICATION_BODY_MAX}
            counter={{ current: body.length, max: COMMUNICATION_BODY_MAX }}
            readOnly={pending}
            error={fieldError("body")}
            onChange={(event) => setBody(event.target.value)}
          />
          <SelectField
            label={o.form.unlock}
            hint={o.form.unlockHint}
            options={[{ value: FROM_START, label: o.fromStart }, ...missions.map((mission) => ({ value: mission.id, label: mission.name }))]}
            value={unlock}
            disabled={pending}
            error={fieldError("mission")}
            onChange={(event) => setUnlock(event.target.value)}
          />
          {mode === "create" ? (
            <TextField
              label={o.form.id}
              hint={o.form.idHint}
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
          <Button type="submit" block loading={pending}>
            {pending ? o.form.saving : o.form.save}
          </Button>
        </form>
      </Card>
    </div>
  );
}
