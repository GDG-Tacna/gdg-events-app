"use client";

import { useState } from "react";
import { copy } from "@/shared/copy/es";
import { rankWithLevel } from "@/shared/copy/rank-name";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { Button, SelectField, TextField } from "@/shared/ui";
import { FOOD_TALKS_MAX, checkFoodRequirements, type FoodRequirements } from "../domain/food-gate";

/** A level of the edition's ladder, as the admin knows it. */
export interface LevelOption {
  level: number;
  name: string;
}

const t = copy.admin.checkpoints.requirements;

const levelLabel = (level: number, levels: readonly LevelOption[]) => rankWithLevel(level, levels.find((option) => option.level === level)?.name ?? null);

/** One line for the list: "Sin requisitos…", or "Desde Piloto (NV 2) · 3 charlas asistidas". */
export function requirementsSummary(requirements: FoodRequirements, levels: readonly LevelOption[]): string {
  const parts: string[] = [];
  if (requirements.minLevel !== null) parts.push(interpolate(t.fromLevel, { rank: levelLabel(requirements.minLevel, levels) }));
  if (requirements.minTalks !== null) parts.push(requirements.minTalks === 1 ? t.talksOne : interpolate(t.talksMany, { n: formatNumber(requirements.minTalks) }));
  return parts.length === 0 ? t.none : parts.join(" · ");
}

export interface FoodRequirementsEditorProps {
  requirements: FoodRequirements;
  /** The edition's ladder; level 1 is everyone, so it is offered as "no level condition". */
  levels: readonly LevelOption[];
  busy: boolean;
  onSave: (requirements: FoodRequirements) => void;
  onCancel: () => void;
}

/**
 * Edits a meal's food gate: a minimum level chosen from the edition's ladder and a minimum of talks
 * attended. Values are checked like the server does; an empty talks field means no condition.
 */
export function FoodRequirementsEditor({ requirements, levels, busy, onSave, onCancel }: FoodRequirementsEditorProps) {
  const [level, setLevel] = useState(requirements.minLevel === null ? "" : String(requirements.minLevel));
  const [talks, setTalks] = useState(requirements.minTalks === null ? "" : String(requirements.minTalks));
  const [error, setError] = useState<string | null>(null);

  // A saved level the ladder no longer has stays visible, so saving does not change it silently.
  const offered = levels.filter((option) => option.level > 1).map((option) => option.level);
  if (requirements.minLevel !== null && !offered.includes(requirements.minLevel)) offered.push(requirements.minLevel);
  const options = [{ value: "", label: t.levelNone }, ...offered.sort((a, b) => a - b).map((value) => ({ value: String(value), label: levelLabel(value, levels) }))];

  function save() {
    const checked = checkFoodRequirements({ minLevel: level === "" ? null : Number(level), minTalks: talks === "" ? null : Number(talks) });
    if (!checked.ok) {
      setError(copy.admin.checkpoints.errors[checked.code]);
      return;
    }
    setError(null);
    onSave(checked.value);
  }

  return (
    <fieldset className="gap-space-3 flex flex-col" disabled={busy}>
      <legend className="type-label text-foreground mb-space-1">{t.title}</legend>
      <p className="type-caption text-text-subtle">{t.help}</p>
      <SelectField label={t.levelLabel} hint={t.levelHint} options={options} value={level} onChange={(event) => setLevel(event.target.value)} />
      <TextField
        label={t.talksLabel}
        hint={t.talksHint}
        value={talks}
        inputMode="numeric"
        maxLength={String(FOOD_TALKS_MAX).length}
        autoComplete="off"
        error={error}
        onChange={(event) => setTalks(event.target.value.replace(/[^0-9]/g, ""))}
      />
      <div className="gap-space-3 flex">
        <Button size="sm" loading={busy} onClick={save}>
          {busy ? copy.admin.checkpoints.saving : t.save}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {copy.admin.checkpoints.cancel}
        </Button>
      </div>
    </fieldset>
  );
}
