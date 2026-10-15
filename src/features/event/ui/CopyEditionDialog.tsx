"use client";

import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Button, FormDialog, InlineAlert, SelectField } from "@/shared/ui";
import { COPY_PARTS, withNeeds, type CopyPart } from "../domain/copy";
import type { CopyEditionAction } from "./actions";

const t = copy.admin.events.copy;
const partList = (parts: readonly CopyPart[]) => parts.map((part) => t.parts[part]).join(", ");

export interface CopyEditionDialogProps {
  /** The edition receiving the copy; `null` closes the dialog. */
  target: { id: string; name: string } | null;
  /** The other editions it can copy from. */
  sources: ReadonlyArray<{ id: string; name: string }>;
  copyContent: CopyEditionAction;
  onClose: () => void;
  /** Called with the message to show once the copy is done. */
  onCopied: (message: string) => void;
}

/**
 * Picks an edition to copy from and which parts to bring. A part another chosen part points at (the map, checkpoints
 * and talks for missions) is included and shown as such; the server checks every part is still empty here.
 */
export function CopyEditionDialog({ target, sources, copyContent, onClose, onCopied }: CopyEditionDialogProps) {
  const [from, setFrom] = useState("");
  const [chosen, setChosen] = useState<ReadonlySet<CopyPart>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const included = withNeeds([...chosen]);
  const neededBy = (part: CopyPart) => [...chosen].filter((other) => other !== part && withNeeds([other]).includes(part));

  function reset() {
    setFrom("");
    setChosen(new Set());
    setError(null);
  }

  function toggle(part: CopyPart, on: boolean) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(part);
      else next.delete(part);
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || pending) return;
    if (!from) {
      setError(copy.admin.events.copy.errors["same-edition"]);
      return;
    }
    if (included.length === 0) {
      setError(t.errors["invalid-parts"]);
      return;
    }
    setPending(true);
    setError(null);
    const result = await copyContent({ from, to: target.id, parts: included }).catch(() => ({ ok: false as const, code: "unknown" as const }));
    setPending(false);
    if (!result.ok) {
      setError(result.code === "not-empty" && "parts" in result && result.parts ? interpolate(t.errors["not-empty"], { parts: partList(result.parts) }) : t.errors[result.code]);
      return;
    }
    const source = sources.find((option) => option.id === from);
    onCopied(interpolate(t.done, { n: String(result.documents), from: source?.name ?? from }));
    reset();
  }

  return (
    <FormDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !pending) {
          reset();
          onClose();
        }
      }}
      title={t.title}
      description={target ? interpolate(t.description, { name: target.name }) : undefined}
    >
      <form onSubmit={submit} noValidate className="gap-space-4 flex flex-col">
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        <SelectField
          label={t.source}
          value={from}
          disabled={pending}
          options={[{ value: "", label: t.chooseSource }, ...sources.map((source) => ({ value: source.id, label: source.name }))]}
          onChange={(event) => setFrom(event.target.value)}
        />
        <fieldset className="gap-space-2 flex flex-col" disabled={pending}>
          <legend className="type-label text-foreground mb-space-2">{t.partsLegend}</legend>
          {COPY_PARTS.map((part) => {
            const needed = !chosen.has(part) && included.includes(part);
            const hintId = `copy-part-${part}-hint`;
            const nameId = `copy-part-${part}-name`;
            return (
              <label key={part} className="gap-space-3 border-line-strong bg-bg-deep p-space-3 flex min-h-12 cursor-pointer items-start rounded-md border">
                <input
                  type="checkbox"
                  className="accent-primary mt-1 size-5 shrink-0"
                  checked={included.includes(part)}
                  disabled={needed}
                  aria-labelledby={nameId}
                  aria-describedby={needed ? hintId : undefined}
                  onChange={(event) => toggle(part, event.target.checked)}
                />
                <span className="gap-space-1 flex flex-col">
                  <span id={nameId} className="type-label text-foreground">
                    {t.parts[part]}
                  </span>
                  {needed ? (
                    <span id={hintId} className="type-caption text-text-subtle">
                      {interpolate(t.needed, { parts: partList(neededBy(part)) })}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </fieldset>
        <p className="type-caption text-text-subtle">{t.emptyOnly}</p>
        <Button type="submit" block loading={pending} disabled={pending}>
          {pending ? t.copying : t.submit}
        </Button>
      </form>
    </FormDialog>
  );
}
