"use client";

import { useId } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import type { AdminOption } from "./admin-actions";

export interface PeoplePickerProps {
  /** What is being chosen («Speakers que completan la misión»). */
  legend: string;
  /** What each mode means for this kind of person, and what to say when there is nobody to choose. */
  texts: { allHint: string; pickHint: string; none: string };
  /** Whom the admin can choose from. */
  people: readonly AdminOption[];
  /** `null` is «Todos»; a list (empty while the admin has not chosen yet) is «Elegir». */
  value: readonly string[] | null;
  onChange: (next: readonly string[] | null) => void;
  disabled?: boolean;
  error?: string | null;
}

const ROW = "gap-space-3 border-line-strong bg-bg-deep p-space-3 flex min-h-12 cursor-pointer items-center rounded-md border";

/**
 * «Todos» or a choice of one or several people, for the missions a scan of a person completes: the cadet needs any one
 * of the chosen. Someone already chosen who is no longer offered (a speaker switched off, a team member removed) stays
 * listed and marked, so saving other changes never drops them unseen and the admin can untick them.
 */
export function PeoplePicker({ legend, texts, people, value, onChange, disabled = false, error = null }: PeoplePickerProps) {
  const groupName = useId();
  const t = copy.admin.missions.form.people;
  const picking = value !== null;
  const offered = new Set(people.map((person) => person.id));
  const gone = (value ?? []).filter((id) => !offered.has(id)).map((id) => ({ id, name: interpolate(t.unavailable, { name: id }) }));

  function toggle(id: string, on: boolean) {
    const current = value ?? [];
    onChange(on ? [...current.filter((other) => other !== id), id] : current.filter((other) => other !== id));
  }

  return (
    <fieldset className="gap-space-3 flex flex-col" disabled={disabled}>
      <legend className="type-label text-foreground mb-space-2">{legend}</legend>
      <label className={ROW}>
        <input type="radio" name={groupName} className="accent-primary size-5 shrink-0" checked={!picking} onChange={() => onChange(null)} />
        <span className="type-label text-foreground">{t.all}</span>
      </label>
      <label className={ROW}>
        <input
          type="radio"
          name={groupName}
          className="accent-primary size-5 shrink-0"
          checked={picking}
          disabled={people.length === 0 && !picking}
          onChange={() => onChange([])}
        />
        <span className="type-label text-foreground">{t.pick}</span>
      </label>
      <p className="type-caption text-text-subtle">{picking ? texts.pickHint : texts.allHint}</p>
      {people.length === 0 ? <p className="type-body-sm text-muted-foreground">{texts.none}</p> : null}

      {value ? (
        <>
          <div role="group" aria-label={legend} className="gap-space-2 flex max-h-72 flex-col overflow-y-auto">
            {[...people, ...gone].map((person) => (
              <label key={person.id} className={ROW}>
                <input
                  type="checkbox"
                  className="accent-primary size-5 shrink-0"
                  checked={value.includes(person.id)}
                  onChange={(event) => toggle(person.id, event.target.checked)}
                />
                <span className="type-label text-foreground min-w-0 truncate">{person.name}</span>
              </label>
            ))}
          </div>
          <p aria-live="polite" className="type-caption text-text-subtle">
            {value.length === 1 ? t.countOne : interpolate(t.count, { n: String(value.length) })}
          </p>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
