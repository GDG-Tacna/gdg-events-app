"use client";

import { TICKET_TYPES, ticketRank, type TicketType } from "@/features/tickets";
import { copy } from "@/shared/copy/es";
import { rankWithLevel } from "@/shared/copy/rank-name";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { SelectField, TextField } from "@/shared/ui";
import { FOOD_TALKS_MAX, checkFoodRequirements, type FoodRequirements } from "../domain/food-gate";
import type { ManageErrorCode } from "../domain/manage-error";

/** A level of the edition's ladder, as the admin knows it. */
export interface LevelOption {
  level: number;
  name: string;
}

const t = copy.admin.checkpoints.requirements;

const levelLabel = (level: number, levels: readonly LevelOption[]) => rankWithLevel(level, levels.find((option) => option.level === level)?.name ?? null);

/** One line for the list: "Sin requisitos…", or "Desde Piloto (NV 2) · 3 charlas asistidas · Solo entrada Premium". */
export function requirementsSummary(requirements: FoodRequirements, levels: readonly LevelOption[]): string {
  const parts: string[] = [];
  if (requirements.minLevel !== null) parts.push(interpolate(t.fromLevel, { rank: levelLabel(requirements.minLevel, levels) }));
  if (requirements.minTalks !== null) parts.push(requirements.minTalks === 1 ? t.talksOne : interpolate(t.talksMany, { n: formatNumber(requirements.minTalks) }));
  if (requirements.minTicket !== null && ticketRank(requirements.minTicket) > 0) parts.push(t.ticketMin[requirements.minTicket as "pro" | "premium"]);
  return parts.length === 0 ? t.none : parts.join(" · ");
}

/** What the fields hold, as typed: an empty level or talks field means no condition, and so does the general ticket. */
export interface RequirementsDraft {
  level: string;
  talks: string;
  ticket: TicketType;
}

export const draftOf = (requirements: FoodRequirements): RequirementsDraft => ({
  level: requirements.minLevel === null ? "" : String(requirements.minLevel),
  talks: requirements.minTalks === null ? "" : String(requirements.minTalks),
  ticket: requirements.minTicket ?? "general",
});

/** The food gate the fields describe, checked like the server does, or the code of what is wrong. */
export function readDraft(draft: RequirementsDraft): { ok: true; value: FoodRequirements } | { ok: false; code: ManageErrorCode } {
  const checked = checkFoodRequirements({ minLevel: draft.level === "" ? null : Number(draft.level), minTalks: draft.talks === "" ? null : Number(draft.talks), minTicket: draft.ticket });
  return checked.ok ? { ok: true, value: checked.value } : { ok: false, code: checked.code };
}

export interface FoodRequirementsEditorProps {
  /** The food gate saved now: a level the ladder no longer has stays offered, so saving does not change it silently. */
  saved: FoodRequirements;
  draft: RequirementsDraft;
  onChange: (draft: RequirementsDraft) => void;
  /** The edition's ladder; level 1 is everyone, so it is offered as "no level condition". */
  levels: readonly LevelOption[];
  disabled?: boolean;
  error?: string | null;
}

/**
 * The fields of a meal's food gate, inside the «Editar puesto» form: a minimum level chosen from the edition's ladder,
 * a minimum of talks attended and a minimum ticket. The form checks them with `readDraft` before saving.
 */
export function FoodRequirementsEditor({ saved, draft, onChange, levels, disabled = false, error }: FoodRequirementsEditorProps) {
  const offered = levels.filter((option) => option.level > 1).map((option) => option.level);
  if (saved.minLevel !== null && !offered.includes(saved.minLevel)) offered.push(saved.minLevel);
  const options = [{ value: "", label: t.levelNone }, ...offered.sort((a, b) => a - b).map((value) => ({ value: String(value), label: levelLabel(value, levels) }))];
  const ticketOptions = TICKET_TYPES.map((value) => ({ value, label: t.ticketOptions[value] }));

  return (
    <fieldset className="gap-space-3 flex flex-col" disabled={disabled}>
      <legend className="type-label text-foreground mb-space-1">{t.title}</legend>
      <p className="type-caption text-text-subtle">{t.help}</p>
      <SelectField label={t.levelLabel} hint={t.levelHint} options={options} value={draft.level} onChange={(event) => onChange({ ...draft, level: event.target.value })} />
      <TextField
        label={t.talksLabel}
        hint={t.talksHint}
        value={draft.talks}
        inputMode="numeric"
        maxLength={String(FOOD_TALKS_MAX).length}
        autoComplete="off"
        error={error}
        onChange={(event) => onChange({ ...draft, talks: event.target.value.replace(/[^0-9]/g, "") })}
      />
      <SelectField
        label={t.ticketLabel}
        hint={t.ticketHint}
        options={ticketOptions}
        value={draft.ticket}
        onChange={(event) => onChange({ ...draft, ticket: event.target.value as TicketType })}
      />
    </fieldset>
  );
}
