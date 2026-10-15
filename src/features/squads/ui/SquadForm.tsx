"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ImageField, type ImageRef, type UploadImageAction } from "@/features/media";
import { copy } from "@/shared/copy/es";
import { isSquadId } from "@/shared/types/squad";
import type { PixelSpriteData } from "@/shared/types/pixel";
import { Button, ButtonLink, Card, InlineAlert, TextField } from "@/shared/ui";
import { normalizeSquadName, normalizeTagline, validateLogo } from "../domain/squad-rules";
import type { CreateSquadAction, UpdateSquadAction } from "./admin-actions";
import { PixelLogoEditor, blankLogo } from "./PixelLogoEditor";

/** "Escuadrón Android" becomes "android": the squad's own word, which is what the old ids look like. */
function suggestSquadId(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^escuadr[oó]n\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return words.slice(0, 24).replace(/-+$/g, "");
}

export type SquadFormProps =
  | {
      mode: "create";
      save: CreateSquadAction;
      upload: UploadImageAction;
      listHref: string;
    }
  | {
      mode: "edit";
      save: UpdateSquadAction;
      upload: UploadImageAction;
      listHref: string;
      squad: { id: string; name: string; tagline: string; sprite: PixelSpriteData; logo?: ImageRef | null };
    };

/**
 * Create or edit a squad: name, tagline, (when creating) its id, and the 16x16 logo. Checks the same rules
 * as the server before sending, and goes back to the list once saved.
 */
export function SquadForm(props: SquadFormProps) {
  const router = useRouter();
  const initial = props.mode === "edit" ? props.squad : null;

  const [name, setName] = useState(initial?.name ?? "");
  const [tagline, setTagline] = useState(initial?.tagline ?? "");
  const [idDraft, setIdDraft] = useState<string | null>(null);
  const [logo, setLogo] = useState<PixelSpriteData>(initial?.sprite ?? blankLogo());
  const [uploaded, setUploaded] = useState<ImageRef | null>(initial?.logo ?? null);
  // Only a changed upload is sent: an untouched form keeps the stored one.
  const [uploadedChanged, setUploadedChanged] = useState(false);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = props.mode === "edit" ? props.squad.id : (idDraft ?? suggestSquadId(name));
  const nameError = touched && normalizeSquadName(name) === null ? copy.admin.squads.errors["invalid-name"] : null;
  const taglineError = touched && normalizeTagline(tagline) === null ? copy.admin.squads.errors["invalid-tagline"] : null;
  const idError = touched && props.mode === "create" && !isSquadId(id) ? copy.admin.squads.errors["invalid-id"] : null;
  // With an uploaded logo the drawing is optional.
  const drawingNeeded = uploaded === null;
  const logoError = touched && drawingNeeded && validateLogo(logo) === null ? copy.admin.squads.errors["invalid-logo"] : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setTouched(true);
    if (normalizeSquadName(name) === null || normalizeTagline(tagline) === null || (drawingNeeded && validateLogo(logo) === null)) return;
    if (props.mode === "create" && !isSquadId(id)) return;

    setPending(true);
    setError(null);
    const result = await props.save({ id, name, tagline, sprite: logo, ...(uploadedChanged ? { logoPath: uploaded?.path ?? null } : {}) });
    setPending(false);

    if (!result.ok) {
      setError(copy.admin.squads.errors[result.code]);
      return;
    }
    router.push(props.listHref);
    router.refresh();
  }

  return (
    <div className="gap-space-4 flex flex-col">
      <div>
        <ButtonLink href={props.listHref} variant="ghost" size="sm" className="-ml-space-4">
          {copy.admin.squads.form.back}
        </ButtonLink>
      </div>
      <h1 className="type-title-xl text-foreground">
        {props.mode === "create" ? copy.admin.squads.form.newTitle : copy.admin.squads.form.editTitle}
      </h1>

      {error ? <InlineAlert>{error}</InlineAlert> : null}

      <Card>
        <form onSubmit={handleSubmit} noValidate className="gap-space-5 flex flex-col">
          <TextField
            label={copy.admin.squads.form.nameLabel}
            value={name}
            maxLength={40}
            autoComplete="off"
            readOnly={pending}
            error={nameError}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setTouched(true)}
          />
          <TextField
            label={copy.admin.squads.form.taglineLabel}
            value={tagline}
            maxLength={80}
            autoComplete="off"
            readOnly={pending}
            error={taglineError}
            onChange={(event) => setTagline(event.target.value)}
            onBlur={() => setTouched(true)}
          />
          {props.mode === "create" ? (
            <TextField
              label={copy.admin.squads.form.idLabel}
              hint={copy.admin.squads.form.idHint}
              value={id}
              maxLength={24}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              readOnly={pending}
              error={idError}
              onChange={(event) => setIdDraft(event.target.value)}
              onBlur={() => setTouched(true)}
            />
          ) : null}

          <div className="gap-space-1 flex flex-col">
            <ImageField
              label={copy.admin.squads.form.uploadedLogo}
              purpose="squad-logo"
              value={uploaded}
              upload={props.upload}
              disabled={pending}
              onChange={(next) => {
                setUploaded(next);
                setUploadedChanged(true);
              }}
            />
            <p className="type-caption text-text-subtle">{copy.admin.squads.form.uploadedLogoHint}</p>
          </div>

          <fieldset className="gap-space-3 flex flex-col">
            <legend className="type-label text-foreground mb-space-2">{copy.admin.squads.form.logoLegend}</legend>
            <PixelLogoEditor value={logo} onChange={setLogo} disabled={pending} />
            {logoError ? (
              <p role="alert" className="type-body-sm text-danger">
                {logoError}
              </p>
            ) : null}
          </fieldset>

          <Button type="submit" block loading={pending}>
            {pending ? copy.admin.squads.form.saving : copy.admin.squads.form.save}
          </Button>
        </form>
      </Card>
    </div>
  );
}
