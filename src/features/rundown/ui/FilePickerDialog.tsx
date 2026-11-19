"use client";

import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Button, FormDialog, TextField } from "@/shared/ui";

const t = copy.stageConsole.picker;

/** How many matches are drawn at once: a folder can hold thousands, and the person types to narrow them down. */
const SHOWN_MAX = 200;

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface FilePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The point of the agenda the file is added to. */
  itemTitle: string;
  /** Every file of the connected folder that can be shown, as paths. */
  files: readonly string[];
  /** False while no folder is connected (or the browser has taken the permission back). */
  folderReady: boolean;
  onConnect: () => void;
  /** Adds a file by its path; answers an error text to show, or `null` when it was added. */
  onAdd: (path: string) => Promise<string | null>;
  /** Adds a Google Slides presentation by its link (and an optional name); same answer. */
  onAddGoogleSlides: (link: string, name: string) => Promise<string | null>;
}

/**
 * «Añadir archivo»: pick a file from the connected folder (or type its path) and it is added, at the end of the open
 * point of the agenda. Only the path is kept; the file stays where it is.
 */
export function FilePickerDialog({ open, onOpenChange, itemTitle, files, folderReady, onConnect, onAdd, onAddGoogleSlides }: FilePickerDialogProps) {
  const [query, setQuery] = useState("");
  const [typed, setTyped] = useState("");
  const [link, setLink] = useState("");
  const [deckName, setDeckName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const wanted = fold(query.trim());
  const matches = files.filter((path) => fold(path).includes(wanted));

  async function add(path: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    const failed = await onAdd(path);
    setPending(false);
    if (failed) return setError(failed);
    setQuery("");
    setTyped("");
    onOpenChange(false);
  }

  async function addDeck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !link.trim()) return;
    setPending(true);
    setError(null);
    const failed = await onAddGoogleSlides(link.trim(), deckName.trim());
    setPending(false);
    if (failed) return setError(failed);
    setLink("");
    setDeckName("");
    onOpenChange(false);
  }

  function submitTyped(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (typed.trim()) void add(typed.trim().replaceAll("\\", "/"));
  }

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={t.title} description={interpolate(t.description, { title: itemTitle })}>
      <div className="gap-space-5 flex flex-col">
      {error ? (
        <p role="alert" className="type-body-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      {folderReady ? (
        <div className="gap-space-4 flex flex-col">
          <TextField label={t.search} placeholder={t.searchPlaceholder} value={query} autoComplete="off" onChange={(event) => setQuery(event.target.value)} />
          {files.length === 0 ? <p className="type-body-sm text-muted-foreground">{t.none}</p> : null}
          {files.length > 0 && matches.length === 0 ? <p className="type-body-sm text-muted-foreground">{t.empty}</p> : null}
          <ul aria-label={t.title} className="border-line-strong max-h-[40dvh] overflow-y-auto rounded-md border-2">
            {matches.slice(0, SHOWN_MAX).map((path) => (
              <li key={path} className="border-line border-b last:border-b-0">
                <button type="button" disabled={pending} onClick={() => void add(path)} className="type-body-sm hover:bg-secondary focus-visible:ring-ring text-foreground w-full truncate px-3 py-2 text-left font-mono focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-60">
                  {path}
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={submitTyped} className="gap-space-3 flex flex-col">
            <TextField label={t.pathLabel} hint={t.pathHint} value={typed} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(event) => setTyped(event.target.value)} />
            <Button type="submit" disabled={pending || typed.trim() === ""} loading={pending}>
              {pending ? t.saving : t.add}
            </Button>
          </form>
        </div>
      ) : (
        <div className="gap-space-4 flex flex-col">
          <p className="type-body text-muted-foreground">{t.needsFolder}</p>
          <Button onClick={onConnect}>{copy.stageConsole.folderConnect}</Button>
        </div>
      )}
      <form onSubmit={(event) => void addDeck(event)} aria-label={t.gslides.title} className="gap-space-3 border-line pt-space-4 flex flex-col border-t-2">
        <h3 className="type-label text-foreground">{t.gslides.title}</h3>
        <p className="type-body-sm text-muted-foreground">{t.gslides.help}</p>
        <TextField label={t.gslides.linkLabel} hint={t.gslides.linkHint} value={link} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(event) => setLink(event.target.value)} />
        <TextField label={t.gslides.nameLabel} value={deckName} maxLength={80} autoComplete="off" onChange={(event) => setDeckName(event.target.value)} />
        <p className="type-caption text-text-subtle">{t.gslides.tip}</p>
        <Button type="submit" variant="secondary" disabled={pending || link.trim() === ""}>
          {t.gslides.add}
        </Button>
      </form>
      </div>
    </FormDialog>
  );
}
