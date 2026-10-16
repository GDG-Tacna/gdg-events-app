"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ImageField, type ImageRef, type UploadImageAction } from "@/features/media";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, ButtonLink, Card, FormDialog, InlineAlert, TextAreaField, TextField, Thumbnail } from "@/shared/ui";
import { SPEAKER_BIO_MAX, SPEAKER_HEADLINE_MAX, SPEAKER_LINK_MAX, SPEAKER_NAME_MAX, suggestSpeakerId, type Speaker } from "../domain/speaker";
import type { InviteSpeakerAction, SaveSpeakerAction, SetSpeakerActiveAction, SpeakerAccessView, SpeakerActionResult, UnlinkSpeakerAction } from "./actions";
import { SpeakerAccessDialog, accessLine } from "./SpeakerAccessDialog";

export interface SpeakersAdminViewProps {
  speakers: readonly Speaker[];
  create: SaveSpeakerAction;
  update: SaveSpeakerAction;
  setActive: SetSpeakerActiveAction;
  upload: UploadImageAction;
  /** Where an active speaker's code is shown (`{base}/{id}/qr`); absent, no link (the cadets' scanner is off). */
  qrBase?: string;
  /** Speakers' own access (invitation links and linked accounts); absent, the screen offers none. */
  access?: { states: Readonly<Record<string, SpeakerAccessView>>; invite: InviteSpeakerAction; unlink: UnlinkSpeakerAction; origin?: string };
}

const t = copy.admin.speakers;
const f = t.form;

interface FormState {
  mode: "create" | "edit";
  id: string;
  idTouched: boolean;
  name: string;
  headline: string;
  bio: string;
  linkedin: string;
  github: string;
  web: string;
  photo: ImageRef | null;
  /** Whether the photo changed in this form (an unchanged one is kept as is). */
  photoChanged: boolean;
}

const emptyForm: FormState = { mode: "create", id: "", idTouched: false, name: "", headline: "", bio: "", linkedin: "", github: "", web: "", photo: null, photoChanged: false };

/** The speaker's photo, or the first letter of their name. */
export function SpeakerAvatar({ speaker, size = 48 }: { speaker: Pick<Speaker, "name" | "photo">; size?: number }) {
  if (speaker.photo) return <Thumbnail url={speaker.photo.url} size={size} className="rounded-full" />;
  return (
    <span aria-hidden="true" style={{ width: size, height: size }} className="bg-bg-deep border-line-strong type-label text-cyan grid shrink-0 place-items-center rounded-full border">
      {speaker.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * The Speakers screen: every speaker of the edition with their photo and role, to add, edit (in a dialog) and stop
 * offering for new talks. Talks point at speakers by id, so a speaker is never deleted. The server checks everything.
 */
export function SpeakersAdminView({ speakers, create, update, setActive, upload, qrBase, access }: SpeakersAdminViewProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [accessOf, setAccessOf] = useState<Speaker | null>(null);

  async function run(key: string, action: () => Promise<SpeakerActionResult>): Promise<SpeakerActionResult> {
    setBusy(key);
    let result: SpeakerActionResult;
    try {
      result = await action();
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setBusy(null);
    if (result.ok) router.refresh();
    return result;
  }

  function openEdit(speaker: Speaker) {
    setNotice(null);
    setFormError(null);
    setForm({
      mode: "edit",
      id: speaker.id,
      idTouched: true,
      name: speaker.name,
      headline: speaker.headline,
      bio: speaker.bio,
      linkedin: speaker.links.linkedin ?? "",
      github: speaker.links.github ?? "",
      web: speaker.links.web ?? "",
      photo: speaker.photo,
      photoChanged: false,
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || busy) return;
    const input = {
      id: form.id.trim(),
      draft: { name: form.name, headline: form.headline, bio: form.bio, links: { linkedin: form.linkedin, github: form.github, web: form.web } },
      ...(form.mode === "create" || form.photoChanged ? { photoPath: form.photo?.path ?? null } : {}),
    };
    const result = await run("form", () => (form.mode === "create" ? create(input) : update(input)));
    if (!result.ok) {
      setFormError(t.errors[result.code]);
      return;
    }
    const name = form.name.trim().replace(/\s+/g, " ");
    setForm(null);
    setNotice({ kind: "success", text: form.mode === "create" ? interpolate(t.created, { name }) : t.saved });
  }

  async function toggle(speaker: Speaker) {
    setNotice(null);
    const result = await run(`active:${speaker.id}`, () => setActive({ id: speaker.id, active: !speaker.active }));
    setNotice(
      result.ok
        ? { kind: "success", text: interpolate(speaker.active ? t.deactivatedDone : t.activatedDone, { name: speaker.name }) }
        : { kind: "error", text: t.errors[result.code] },
    );
  }

  const set = (patch: Partial<FormState>) => setForm((prev) => prev && { ...prev, ...patch });

  return (
    <div className="gap-space-6 flex flex-col">
      <header className="gap-space-3 flex flex-wrap items-end justify-between">
        <div className="gap-space-1 flex flex-col">
          <h1 className="type-title-xl text-foreground">{t.title}</h1>
          <p className="type-body text-muted-foreground">{t.subtitle}</p>
        </div>
        <Button
          icon="plus"
          disabled={busy !== null}
          onClick={() => {
            setNotice(null);
            setFormError(null);
            setForm(emptyForm);
          }}
        >
          {t.create}
        </Button>
      </header>

      {notice?.kind === "success" ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice.text}
        </p>
      ) : null}
      {notice?.kind === "error" ? <InlineAlert>{notice.text}</InlineAlert> : null}

      {speakers.length === 0 ? (
        <Card>
          <p className="type-body text-muted-foreground">{t.empty}</p>
        </Card>
      ) : (
        <ul aria-label={t.listLabel} className="gap-space-3 grid grid-cols-1 min-[760px]:grid-cols-2">
          {speakers.map((speaker) => (
            <li key={speaker.id}>
              <Card className={cn("gap-space-3 flex h-full flex-col", !speaker.active && "opacity-75")}>
                <div className="gap-space-3 flex items-start">
                  <SpeakerAvatar speaker={speaker} />
                  <div className="gap-space-1 flex min-w-0 flex-1 flex-col">
                    <p className="type-label text-foreground">{speaker.name}</p>
                    {speaker.headline ? <p className="type-caption text-muted-foreground">{speaker.headline}</p> : null}
                    {access && accessLine(access.states[speaker.id]) ? <p className="type-caption text-text-subtle">{accessLine(access.states[speaker.id])}</p> : null}
                  </div>
                  <span className={cn("type-caption px-space-3 shrink-0 rounded-full border py-1", speaker.active ? "border-accent/70 text-foreground" : "border-line-strong text-text-subtle")}>
                    {speaker.active ? t.active : t.inactive}
                  </span>
                </div>
                <div className="gap-space-2 mt-auto flex flex-wrap justify-end">
                  {qrBase && speaker.active ? (
                    <ButtonLink href={`${qrBase}/${speaker.id}/qr`} variant="ghost" size="sm" aria-label={`${t.showQr}: ${speaker.name}`}>
                      {t.showQr}
                    </ButtonLink>
                  ) : null}
                  {access && speaker.active ? (
                    <Button variant="ghost" size="sm" disabled={busy !== null} aria-label={`${t.accessButton}: ${speaker.name}`} onClick={() => setAccessOf(speaker)}>
                      {t.accessButton}
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" icon="edit" disabled={busy !== null} aria-label={`${t.edit}: ${speaker.name}`} onClick={() => openEdit(speaker)}>
                    {t.edit}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy !== null} aria-label={`${speaker.active ? t.deactivate : t.activate}: ${speaker.name}`} onClick={() => void toggle(speaker)}>
                    {speaker.active ? t.deactivate : t.activate}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <FormDialog
        open={form !== null}
        onOpenChange={(open) => {
          if (!open && busy === null) setForm(null);
        }}
        title={form?.mode === "create" ? f.createTitle : f.editTitle}
        description={form?.mode === "edit" ? form.name : undefined}
      >
        {form ? (
          <form onSubmit={handleSave} noValidate className="gap-space-4 flex flex-col">
            {formError ? <InlineAlert>{formError}</InlineAlert> : null}
            <TextField
              label={f.name}
              hint={f.nameHint}
              value={form.name}
              maxLength={SPEAKER_NAME_MAX}
              autoComplete="off"
              readOnly={busy !== null}
              onChange={(event) => {
                const name = event.target.value;
                setForm((prev) => prev && { ...prev, name, id: prev.mode === "create" && !prev.idTouched ? suggestSpeakerId(name) : prev.id });
              }}
            />
            {form.mode === "create" ? (
              <TextField
                label={f.id}
                hint={f.idHint}
                value={form.id}
                maxLength={48}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                readOnly={busy !== null}
                onChange={(event) => set({ id: event.target.value, idTouched: true })}
              />
            ) : null}
            <TextField label={f.headline} hint={f.headlineHint} value={form.headline} maxLength={SPEAKER_HEADLINE_MAX} autoComplete="off" readOnly={busy !== null} onChange={(event) => set({ headline: event.target.value })} />
            <ImageField label={f.photo} purpose="speaker" value={form.photo} upload={upload} disabled={busy !== null} onChange={(photo) => set({ photo, photoChanged: true })} />
            <TextAreaField label={f.bio} hint={f.bioHint} value={form.bio} maxLength={SPEAKER_BIO_MAX} rows={4} readOnly={busy !== null} onChange={(event) => set({ bio: event.target.value })} />
            {(["linkedin", "github", "web"] as const).map((key) => (
              <TextField
                key={key}
                label={f[key]}
                hint={f.linkHint}
                type="url"
                inputMode="url"
                value={form[key]}
                maxLength={SPEAKER_LINK_MAX}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                readOnly={busy !== null}
                onChange={(event) => set({ [key]: event.target.value })}
              />
            ))}
            <Button type="submit" block loading={busy === "form"} disabled={busy !== null}>
              {busy === "form" ? f.saving : f.save}
            </Button>
          </form>
        ) : null}
      </FormDialog>
      {access ? (
        <SpeakerAccessDialog
          speaker={accessOf}
          access={accessOf ? access.states[accessOf.id] : undefined}
          invite={access.invite}
          unlink={access.unlink}
          origin={access.origin}
          onClose={() => setAccessOf(null)}
        />
      ) : null}
    </div>
  );
}
