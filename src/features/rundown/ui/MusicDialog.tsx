"use client";

import { useState } from "react";
import { copy } from "@/shared/copy/es";
import { Button, FormDialog, TextField } from "@/shared/ui";

const t = copy.stageConsole.music.dialog;

/** How many matches are drawn at once: a folder can hold thousands, and the person types to narrow them down. */
const SHOWN_MAX = 200;

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface MusicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every song of the connected folder, as paths. */
  files: readonly string[];
  /** The paths already in the playlist (marked, so the same song is not added by mistake). */
  added: ReadonlySet<string>;
  folderReady: boolean;
  onConnect: () => void;
  /** Adds a song by its path; answers an error text to show, or `null` when it was added. */
  onAdd: (path: string) => Promise<string | null>;
}

/**
 * «Añadir canciones»: pick songs from the connected folder. The dialog stays open after each one, so a whole playlist is
 * built in one go; each song that goes in is marked.
 */
export function MusicDialog({ open, onOpenChange, files, added, folderReady, onConnect, onAdd }: MusicDialogProps) {
  const [query, setQuery] = useState("");
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
    if (failed) setError(failed);
  }

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={t.title} description={t.hint}>
      {error ? (
        <p role="alert" className="type-body-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      {folderReady ? (
        <div className="gap-space-4 flex flex-col">
          <TextField label={t.search} value={query} autoComplete="off" onChange={(event) => setQuery(event.target.value)} />
          {files.length === 0 ? <p className="type-body-sm text-muted-foreground">{t.none}</p> : null}
          {files.length > 0 && matches.length === 0 ? <p className="type-body-sm text-muted-foreground">{t.empty}</p> : null}
          <ul aria-label={t.title} className="border-line-strong max-h-[40dvh] overflow-y-auto rounded-md border-2">
            {matches.slice(0, SHOWN_MAX).map((path) => (
              <li key={path} className="border-line border-b last:border-b-0">
                <button type="button" disabled={pending} onClick={() => void add(path)} className="type-body-sm hover:bg-secondary focus-visible:ring-ring text-foreground flex w-full items-center gap-2 px-3 py-2 text-left font-mono focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-60">
                  <span className="min-w-0 flex-1 truncate">{path}</span>
                  {added.has(path) ? <span className="text-lime-ink shrink-0 text-xs font-bold">{t.added}</span> : null}
                </button>
              </li>
            ))}
          </ul>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t.done}
          </Button>
        </div>
      ) : (
        <div className="gap-space-4 flex flex-col">
          <p className="type-body text-muted-foreground">{t.needsFolder}</p>
          <Button onClick={onConnect}>{copy.stageConsole.folderConnect}</Button>
        </div>
      )}
    </FormDialog>
  );
}
