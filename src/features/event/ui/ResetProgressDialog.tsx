"use client";

import { useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Button, FormDialog, InlineAlert } from "@/shared/ui";
import type { ResetProgressAction } from "./actions";

const t = copy.admin.events.reset;

export interface ResetProgressDialogProps {
  /** The edition whose progress would be cleaned; `null` closes the dialog. */
  target: { id: string; name: string } | null;
  resetProgress: ResetProgressAction;
  onClose: () => void;
  /** Called with the message to show once it is done. */
  onDone: (message: string) => void;
}

/**
 * «Limpiar experiencia y créditos»: says what will be cleared and what stays, that it cannot be undone, and clears the
 * edition's progress only when the admin confirms. It stays open with the error when the server refuses.
 */
export function ResetProgressDialog({ target, resetProgress, onClose, onDone }: ResetProgressDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!target || pending) return;
    setPending(true);
    setError(null);
    let result: Awaited<ReturnType<ResetProgressAction>>;
    try {
      result = await resetProgress({ eventId: target.id });
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setPending(false);
    if (!result.ok) return setError(t.errors[result.code]);
    onDone(interpolate(t.done, { name: target.name, n: String(result.cadets) }));
  }

  return (
    <FormDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !pending) {
          setError(null);
          onClose();
        }
      }}
      title={t.title}
      description={target ? interpolate(t.description, { name: target.name }) : undefined}
    >
      <div className="gap-space-4 flex flex-col">
        {error ? <InlineAlert>{error}</InlineAlert> : null}

        <section className="gap-space-2 flex flex-col">
          <h3 className="type-label text-foreground">{t.clearsTitle}</h3>
          <ul className="type-body-sm text-muted-foreground gap-space-1 flex list-disc flex-col pl-5">
            {t.clears.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <section className="gap-space-2 flex flex-col">
          <h3 className="type-label text-foreground">{t.staysTitle}</h3>
          <ul className="type-body-sm text-muted-foreground gap-space-1 flex list-disc flex-col pl-5">
            {t.stays.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <p role="note" className="type-body-sm text-danger-ink border-danger-ink rounded-md border-2 px-3 py-2 font-semibold">
          {t.warning}
        </p>

        <div className="gap-space-3 flex flex-wrap">
          <Button variant="secondary" loading={pending} disabled={pending} onClick={() => void confirm()}>
            {pending ? t.running : t.confirm}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            {t.cancel}
          </Button>
        </div>
      </div>
    </FormDialog>
  );
}
