"use client";

import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { Button, InlineAlert, TextField } from "@/shared/ui";
import { LINK_KINDS, LINK_MAX, type ContactLinks, type LinkKind } from "../domain/links";
import type { NetworkErrorCode } from "../domain/network";
import type { SaveContactLinksAction, SaveContactLinksActionResult } from "./actions";

const FIELD_ERROR: Partial<Record<NetworkErrorCode, LinkKind>> = { "invalid-linkedin": "linkedin", "invalid-github": "github", "invalid-web": "web" };
const HINTS: Record<LinkKind, string> = { linkedin: copy.network.links.linkedinHint, github: copy.network.links.githubHint, web: copy.network.links.webHint };

export interface LinksFormProps {
  links: ContactLinks;
  save: SaveContactLinksAction;
  onSaved: (links: ContactLinks) => void;
  onCancel: () => void;
}

/** Edits the links a cadet shows on their card. Each one optional; the server checks each one for its kind. */
export function LinksForm({ links, save, onSaved, onCancel }: LinksFormProps) {
  const t = copy.network.links;
  const [values, setValues] = useState<Record<LinkKind, string>>({ linkedin: links.linkedin ?? "", github: links.github ?? "", web: links.web ?? "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<NetworkErrorCode | null>(null);
  const field = error ? FIELD_ERROR[error] : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    let result: SaveContactLinksActionResult;
    try {
      result = await save(values);
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setPending(false);
    if (!result.ok) return setError(result.code);
    onSaved(result.links);
  }

  return (
    <form onSubmit={submit} noValidate className="gap-space-4 flex flex-col">
      <div className="gap-space-1 flex flex-col">
        <h3 className="type-heading text-foreground">{t.title}</h3>
        <p className="type-body-sm text-muted-foreground">{t.help}</p>
      </div>
      {error && !field ? <InlineAlert>{copy.network.errors[error].body}</InlineAlert> : null}
      {LINK_KINDS.map((kind) => (
        <TextField
          key={kind}
          label={t[kind]}
          hint={HINTS[kind]}
          value={values[kind]}
          maxLength={LINK_MAX}
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          readOnly={pending}
          error={field === kind && error ? copy.network.errors[error].body : null}
          onChange={(event) => setValues((current) => ({ ...current, [kind]: event.target.value }))}
        />
      ))}
      <div className="gap-space-3 flex flex-col min-[400px]:flex-row">
        <Button type="submit" loading={pending} className="flex-1">
          {pending ? t.saving : t.save}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={onCancel} className="flex-1">
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}
