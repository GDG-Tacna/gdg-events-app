"use client";

import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, FormDialog, InlineAlert } from "@/shared/ui";
import type { TeamMember } from "../domain/team";
import type { SetStaffScopeAction, StationOption } from "./actions";

const t = copy.admin.team.scope;

/** How a staff member's stations read in the list: «Puestos: Todos» or «Solo: Stand Louis 3D, Coffee break». */
export function describeScope(scope: readonly string[] | undefined, stations: readonly StationOption[]): string {
  if (scope === undefined) return t.all;
  const names = scope.map((id) => stations.find((station) => station.id === id)?.name ?? t.unknownStation);
  return interpolate(t.only, { names: names.join(", ") });
}

export interface StaffScopeDialogProps {
  /** The staff member being limited, with their stations now (`undefined`: every station); `null` closes the dialog. */
  target: { member: TeamMember; scope: readonly string[] | undefined } | null;
  /** The edition's entrance, catering and stand checkpoints, open or closed. */
  stations: readonly StationOption[];
  save: SetStaffScopeAction;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/**
 * Chooses the stations one staff account operates: every station the edition gives staff (as before), or only some of
 * this edition's entrance, catering and stand checkpoints. At least one must be chosen; the server checks every change.
 */
export function StaffScopeDialog({ target, stations, save, onClose, onSaved }: StaffScopeDialogProps) {
  const [draft, setDraft] = useState<{ limited: boolean; ids: readonly string[] } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = draft ?? (target ? { limited: target.scope !== undefined, ids: target.scope ?? [] } : null);
  const name = target ? (target.member.displayName ?? target.member.email) : "";

  function close() {
    setDraft(null);
    setError(null);
    onClose();
  }

  function toggle(id: string, on: boolean) {
    if (!current) return;
    const next = new Set(current.ids);
    if (on) next.add(id);
    else next.delete(id);
    // Kept in the order of the list, so the saved scope reads like the screen.
    setDraft({ limited: true, ids: stations.filter((station) => next.has(station.id)).map((station) => station.id) });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || !current || pending) return;
    if (current.limited && current.ids.length === 0) {
      setError(t.pickOne);
      return;
    }
    setPending(true);
    setError(null);
    const result = await save({ uid: target.member.uid, checkpointIds: current.limited ? current.ids : null }).catch(() => ({ ok: false as const, code: "unknown" as const }));
    setPending(false);
    if (!result.ok) {
      setError(t.errors[result.code]);
      return;
    }
    onSaved(interpolate(result.checkpointIds === null ? t.savedAll : t.savedSome, { name }));
    setDraft(null);
  }

  const choice = (limited: boolean, label: string, help?: string) => (
    <label className="relative block cursor-pointer">
      <input
        type="radio"
        name="staff-scope"
        checked={current?.limited === limited}
        onChange={() => current && setDraft({ ...current, limited })}
        className="peer sr-only"
      />
      <span
        className={cn(
          "gap-space-1 p-space-3 flex min-h-12 flex-col justify-center rounded-md border transition-colors",
          "border-line-strong bg-bg-deep peer-checked:border-primary peer-checked:bg-surface-raised",
          "peer-focus-visible:ring-ring peer-focus-visible:ring-[3px]",
        )}
      >
        <span className="type-label text-foreground">{label}</span>
        {help ? <span className="type-caption text-text-subtle">{help}</span> : null}
      </span>
    </label>
  );

  return (
    <FormDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
      title={interpolate(t.title, { name })}
      description={t.help}
    >
      {current ? (
        <form onSubmit={submit} noValidate className="gap-space-5 flex flex-col">
          {error ? <InlineAlert>{error}</InlineAlert> : null}
          <fieldset className="gap-space-3 flex flex-col" disabled={pending}>
            <legend className="sr-only">{t.stationsLegend}</legend>
            {choice(false, t.allOption, t.allHelp)}
            {choice(true, t.someOption)}
          </fieldset>

          {current.limited ? (
            <fieldset className="gap-space-2 flex flex-col" disabled={pending}>
              <legend className="type-label text-foreground mb-space-2">{t.stationsLegend}</legend>
              {stations.length === 0 ? <p className="type-body-sm text-muted-foreground">{t.noStations}</p> : null}
              {stations.map((station) => (
                <label key={station.id} className="gap-space-3 border-line-strong bg-bg-deep p-space-3 flex min-h-12 cursor-pointer items-center rounded-md border">
                  <input type="checkbox" className="accent-primary size-5 shrink-0" checked={current.ids.includes(station.id)} onChange={(event) => toggle(station.id, event.target.checked)} />
                  <span className="flex min-w-0 flex-col">
                    <span className="type-label text-foreground truncate">{station.name}</span>
                    <span className="type-caption text-text-subtle">
                      {copy.staff.kinds[station.kind]}
                      {station.active ? null : ` · ${t.closed}`}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <div className="gap-space-3 flex flex-wrap">
            <Button type="submit" loading={pending} disabled={pending}>
              {pending ? t.saving : t.save}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={close}>
              {t.cancel}
            </Button>
          </div>
        </form>
      ) : null}
    </FormDialog>
  );
}
