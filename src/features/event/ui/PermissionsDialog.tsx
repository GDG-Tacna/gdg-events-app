"use client";

import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, FormDialog, InlineAlert } from "@/shared/ui";
import { ACCESS_LEVELS, ADMIN_SECTIONS, STAFF_STATIONS, type AccessLevel, type AdminSection, type EditionPermissions, type StaffStation } from "../domain/permissions";
import type { SavePermissionsAction } from "./actions";

const t = copy.admin.events.permissions;

export interface PermissionsDialogProps {
  /** The edition being set up, with what it allows now; `null` closes the dialog. */
  target: { id: string; name: string; permissions: EditionPermissions } | null;
  save: SavePermissionsAction;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/**
 * What an edition's organizers may do per control center section (hidden, view only, edit) and which kinds of station
 * its staff operate. Each section is a group of three choices; the server checks every change.
 */
export function PermissionsDialog({ target, save, onClose, onSaved }: PermissionsDialogProps) {
  const [draft, setDraft] = useState<{ organizer: Record<AdminSection, AccessLevel>; staffStations: readonly StaffStation[] } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = draft ?? (target ? { organizer: { ...target.permissions.organizer }, staffStations: target.permissions.staffStations } : null);

  function close() {
    setDraft(null);
    setError(null);
    onClose();
  }

  function setLevel(section: AdminSection, level: AccessLevel) {
    if (!current) return;
    setDraft({ ...current, organizer: { ...current.organizer, [section]: level } });
  }

  function setStation(kind: StaffStation, on: boolean) {
    if (!current) return;
    const next = new Set(current.staffStations);
    if (on) next.add(kind);
    else next.delete(kind);
    setDraft({ ...current, staffStations: STAFF_STATIONS.filter((station) => next.has(station)) });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || !current || pending) return;
    setPending(true);
    setError(null);
    const result = await save({ eventId: target.id, organizer: current.organizer, staffStations: current.staffStations }).catch(() => ({ ok: false as const, code: "unknown" as const }));
    setPending(false);
    if (!result.ok) {
      setError(t.errors[result.code]);
      return;
    }
    onSaved(interpolate(t.saved, { name: target.name }));
    setDraft(null);
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
      {current ? (
        <form onSubmit={submit} noValidate className="gap-space-5 flex flex-col">
          {error ? <InlineAlert>{error}</InlineAlert> : null}
          <fieldset className="gap-space-2 flex flex-col" disabled={pending}>
            <legend className="type-label text-foreground mb-space-2">{t.organizerLegend}</legend>
            {ADMIN_SECTIONS.map((section) => (
              <fieldset key={section} className="gap-space-2 border-line-strong bg-bg-deep p-space-3 flex flex-wrap items-center justify-between rounded-md border">
                <legend className="sr-only">{t.sections[section]}</legend>
                <span aria-hidden="true" className="type-label text-foreground">
                  {t.sections[section]}
                </span>
                <span className="gap-space-1 flex">
                  {ACCESS_LEVELS.map((level) => (
                    <label key={level} className="relative cursor-pointer">
                      <input
                        type="radio"
                        name={`permission-${section}`}
                        value={level}
                        checked={current.organizer[section] === level}
                        onChange={() => setLevel(section, level)}
                        className="peer sr-only"
                      />
                      <span
                        className={cn(
                          "type-caption px-space-3 inline-flex h-9 items-center rounded-full border transition-colors",
                          "border-line-strong text-muted-foreground peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground",
                          "peer-focus-visible:ring-ring peer-focus-visible:ring-[3px]",
                        )}
                      >
                        {t.levels[level]}
                      </span>
                    </label>
                  ))}
                </span>
              </fieldset>
            ))}
            <p className="type-caption text-text-subtle">{t.teamNote}</p>
          </fieldset>

          <fieldset className="gap-space-2 flex flex-col" disabled={pending}>
            <legend className="type-label text-foreground mb-space-2">{t.staffLegend}</legend>
            {STAFF_STATIONS.map((kind) => (
              <label key={kind} className="gap-space-3 border-line-strong bg-bg-deep p-space-3 flex min-h-12 cursor-pointer items-center rounded-md border">
                <input type="checkbox" className="accent-primary size-5 shrink-0" checked={current.staffStations.includes(kind)} onChange={(event) => setStation(kind, event.target.checked)} />
                <span className="type-label text-foreground">{t.stations[kind]}</span>
              </label>
            ))}
          </fieldset>

          <Button type="submit" block loading={pending} disabled={pending}>
            {pending ? t.saving : t.save}
          </Button>
        </form>
      ) : null}
    </FormDialog>
  );
}
