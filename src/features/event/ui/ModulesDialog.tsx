"use client";

import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Button, FormDialog, InlineAlert } from "@/shared/ui";
import { EDITION_MODULES, MODULE_NEEDS, effectiveModules, type EditionModule } from "../domain/modules";
import type { SaveModulesAction } from "./actions";

const t = copy.admin.events.modules;

export interface ModulesDialogProps {
  /** The edition being set up, with the modules it has off now; `null` closes the dialog. */
  target: { id: string; name: string; off: readonly EditionModule[] } | null;
  save: SaveModulesAction;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/**
 * Switches an edition's modules on and off. A module that needs one that is off shows off too, with the reason, and
 * comes back by itself when that one is switched on again. The server checks it all.
 */
export function ModulesDialog({ target, save, onClose, onSaved }: ModulesDialogProps) {
  const [off, setOff] = useState<ReadonlySet<EditionModule> | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = off ?? new Set(target?.off ?? []);
  const on = effectiveModules([...chosen]);

  function close() {
    setOff(null);
    setError(null);
    onClose();
  }

  function toggle(module: EditionModule, value: boolean) {
    const next = new Set(chosen);
    if (value) next.delete(module);
    else next.add(module);
    setOff(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || pending) return;
    setPending(true);
    setError(null);
    const result = await save({ eventId: target.id, off: EDITION_MODULES.filter((module) => chosen.has(module)) }).catch(() => ({ ok: false as const, code: "unknown" as const }));
    setPending(false);
    if (!result.ok) {
      setError(t.errors[result.code]);
      return;
    }
    onSaved(interpolate(t.saved, { name: target.name }));
    setOff(null);
  }

  return (
    <FormDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
      title={t.title}
      description={target ? interpolate(t.description, { name: target.name }) : undefined}
    >
      <form onSubmit={submit} noValidate className="gap-space-4 flex flex-col">
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        <ul className="gap-space-2 flex flex-col">
          {EDITION_MODULES.map((module) => {
            const blockedBy = MODULE_NEEDS[module].filter((need) => !on[need]);
            const nameId = `module-${module}-name`;
            const helpId = `module-${module}-help`;
            return (
              <li key={module}>
                <label className="gap-space-3 border-line-strong bg-bg-deep p-space-3 flex min-h-12 cursor-pointer items-start rounded-md border">
                  <input
                    type="checkbox"
                    role="switch"
                    className="accent-primary mt-1 size-5 shrink-0"
                    checked={on[module]}
                    disabled={pending || blockedBy.length > 0}
                    aria-labelledby={nameId}
                    aria-describedby={helpId}
                    onChange={(event) => toggle(module, event.target.checked)}
                  />
                  <span className="gap-space-1 flex min-w-0 flex-col">
                    <span id={nameId} className="type-label text-foreground">
                      {t.names[module]}
                    </span>
                    <span id={helpId} className="type-caption text-text-subtle">
                      {blockedBy.length > 0 ? interpolate(t.offWith, { parts: blockedBy.map((need) => t.names[need]).join(", ") }) : t.help[module]}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="type-caption text-text-subtle">{t.core}</p>
        <Button type="submit" block loading={pending} disabled={pending}>
          {pending ? t.saving : t.save}
        </Button>
      </form>
    </FormDialog>
  );
}
