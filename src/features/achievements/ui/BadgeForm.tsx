"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { rankWithLevel } from "@/shared/copy/rank-name";
import { cn } from "@/shared/lib/utils";
import { ImageField, type ImageRef, type UploadImageAction } from "@/features/media";
import { Button, ButtonLink, Card, InlineAlert, MedalArt, PixelMedal, SelectField, TextAreaField, TextField } from "@/shared/ui";
import {
  BADGE_DESCRIPTION_MAX,
  BADGE_NAME_MAX,
  BADGE_TONES,
  RULE_LEVEL_MAX,
  RULE_TYPES,
  checkBadge,
  parseRule,
  type Badge,
  type BadgeRule,
  type BadgeTone,
  type RuleType,
} from "../domain/badge";
import type { AchievementAdminErrorCode } from "../domain/manage";
import type { SaveBadgeAction } from "./admin-actions";
import { ruleText } from "./rule-text";

export interface BadgeFormProps {
  mode: "create" | "edit";
  badge?: Badge;
  save: SaveBadgeAction;
  /** Uploads the badge's optional image. */
  upload: UploadImageAction;
  quadrants: ReadonlyArray<{ id: string; name: string }>;
  missions: ReadonlyArray<{ id: string; name: string }>;
  /** The edition's rank ladder, to name the levels a badge can ask for. */
  levels: ReadonlyArray<{ level: number; name: string }>;
  listHref: string;
}

const suggestId = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");

type Field = "id" | "name" | "description" | "tone" | "rule" | "image";
const FIELD_OF: Partial<Record<AchievementAdminErrorCode, Field>> = {
  "invalid-id": "id",
  "already-exists": "id",
  "invalid-name": "name",
  "invalid-description": "description",
  "invalid-tone": "tone",
  "invalid-rule": "rule",
  "unknown-quadrant": "rule",
  "unknown-mission": "rule",
  "invalid-image": "image",
};

/** The value of a rule's only parameter, as the form holds it. */
function paramOf(rule: BadgeRule | undefined): string {
  if (!rule) return "1";
  switch (rule.type) {
    case "level-reached":
      return String(rule.level);
    case "quadrant-complete":
      return rule.quadrantId;
    case "mission-completed":
      return rule.missionId;
    default:
      return String(rule.count);
  }
}

/** The rule as the server reads it, from the type and the parameter the admin chose. */
function ruleFrom(type: RuleType, param: string): Record<string, unknown> {
  if (type === "level-reached") return { type, level: param === "" ? Number.NaN : Number(param) };
  if (type === "quadrant-complete") return { type, quadrantId: param };
  if (type === "mission-completed") return { type, missionId: param };
  return { type, count: param === "" ? Number.NaN : Number(param) };
}

/** Create or edit a badge: name, description, medal colour and its rule (type and parameter), with a preview. */
export function BadgeForm({ mode, badge, save, upload, quadrants, missions, levels, listHref }: BadgeFormProps) {
  const t = copy.admin.achievements;
  const f = t.form;
  const router = useRouter();
  const [name, setName] = useState(badge?.name ?? "");
  const [description, setDescription] = useState(badge?.description ?? "");
  const [tone, setTone] = useState<BadgeTone>(badge?.tone ?? "cyan");
  const [type, setType] = useState<RuleType>(badge?.rule.type ?? "missions-completed");
  const [param, setParam] = useState(paramOf(badge?.rule));
  const [image, setImage] = useState<ImageRef | null>(badge?.image ?? null);
  // Only a changed image is sent: an untouched form keeps the stored one.
  const [imageChanged, setImageChanged] = useState(false);
  const [idDraft, setIdDraft] = useState<string | null>(null);
  const [error, setError] = useState<AchievementAdminErrorCode | null>(null);
  const [pending, setPending] = useState(false);

  const id = mode === "edit" && badge ? badge.id : (idDraft ?? suggestId(name));
  const field = error ? FIELD_OF[error] : undefined;
  const fieldError = (which: Field) => (field === which && error ? t.errors[error] : null);
  const rule = ruleFrom(type, param);
  const previewRule = parseRule(rule);
  const names = { quadrants: Object.fromEntries(quadrants.map((q) => [q.id, q.name])), missions: Object.fromEntries(missions.map((m) => [m.id, m.name])) };

  function changeType(next: RuleType) {
    setType(next);
    // Each type has its own kind of parameter: start from a sensible one.
    setParam(next === "level-reached" ? "2" : next === "quadrant-complete" ? (quadrants[0]?.id ?? "") : next === "mission-completed" ? "" : "1");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const draft = { name, description, tone, rule, ...(imageChanged ? { imagePath: image?.path ?? null } : {}) };
    // The fields first, top to bottom, then the id (which is suggested from the name).
    const fields = checkBadge("badge", { ...draft, active: true });
    const checked = fields.ok ? checkBadge(id, { ...draft, active: true }) : fields;
    if (!checked.ok) return setError(checked.code);

    setPending(true);
    setError(null);
    let result;
    try {
      result = await save({ id, draft });
    } catch {
      result = { ok: false as const, code: "unknown" as const };
    }
    setPending(false);
    if (!result.ok) return setError(result.code);
    router.push(listHref);
    router.refresh();
  }

  const paramField = (() => {
    const common = { error: fieldError("rule"), disabled: pending, value: param, onChange: (event: { target: { value: string } }) => setParam(event.target.value) };
    if (type === "level-reached") {
      const options = Array.from({ length: RULE_LEVEL_MAX - 1 }, (_, index) => index + 2).map((level) => ({
        value: String(level),
        label: rankWithLevel(level, levels.find((option) => option.level === level)?.name ?? null),
      }));
      return <SelectField label={f.level} options={options} {...common} />;
    }
    if (type === "quadrant-complete") return <SelectField label={f.quadrant} options={[{ value: "", label: f.choose }, ...quadrants.map((q) => ({ value: q.id, label: q.name }))]} {...common} />;
    if (type === "mission-completed") return <SelectField label={f.mission} options={[{ value: "", label: f.choose }, ...missions.map((m) => ({ value: m.id, label: m.name }))]} {...common} />;
    return (
      <TextField
        label={type === "credits-earned" ? f.credits : f.count}
        inputMode="numeric"
        maxLength={type === "credits-earned" ? 6 : 4}
        autoComplete="off"
        {...common}
        onChange={(event) => setParam(event.target.value.replace(/[^0-9]/g, ""))}
      />
    );
  })();

  return (
    <div className="gap-space-4 flex flex-col">
      <div>
        <ButtonLink href={listHref} variant="ghost" size="sm" className="-ml-space-4">
          {f.back}
        </ButtonLink>
      </div>
      <h1 className="type-title-xl text-foreground">{mode === "create" ? f.createTitle : f.editTitle}</h1>
      {error && !field ? <InlineAlert>{t.errors[error]}</InlineAlert> : null}

      <Card>
        <form onSubmit={submit} noValidate className="gap-space-5 flex flex-col">
          <TextField label={f.name} hint={f.nameHint} value={name} maxLength={BADGE_NAME_MAX} autoComplete="off" readOnly={pending} error={fieldError("name")} onChange={(event) => setName(event.target.value)} />
          <TextAreaField
            label={f.description}
            hint={f.descriptionHint}
            value={description}
            maxLength={BADGE_DESCRIPTION_MAX}
            rows={2}
            counter={{ current: description.length, max: BADGE_DESCRIPTION_MAX }}
            readOnly={pending}
            error={fieldError("description")}
            onChange={(event) => setDescription(event.target.value)}
          />

          <fieldset className="gap-space-2 flex flex-col" disabled={pending}>
            <legend className="type-label text-foreground mb-space-2">{f.tone}</legend>
            <div className="gap-space-2 grid grid-cols-3 min-[480px]:grid-cols-5">
              {BADGE_TONES.map((option) => (
                <label key={option} className="relative block cursor-pointer">
                  <input type="radio" name="badge-tone" value={option} checked={tone === option} onChange={() => setTone(option)} className="peer sr-only" />
                  <span
                    className={cn(
                      "gap-space-1 p-space-2 flex min-h-12 flex-col items-center rounded-md border transition-colors",
                      "border-line-strong bg-bg-deep peer-checked:border-primary peer-checked:bg-surface-raised",
                      "peer-focus-visible:ring-ring peer-focus-visible:ring-[3px]",
                    )}
                  >
                    <PixelMedal tone={option} scale={2} />
                    <span className="type-caption text-foreground">{f.tones[option]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <ImageField
            label={f.image}
            purpose="badge"
            value={image}
            upload={upload}
            disabled={pending}
            onChange={(next) => {
              setImage(next);
              setImageChanged(true);
            }}
          />
          {fieldError("image") ? (
            <p role="alert" className="type-body-sm text-danger -mt-space-3">
              {fieldError("image")}
            </p>
          ) : null}
          <p className="type-caption text-text-subtle -mt-space-3">{f.imageHint}</p>

          <SelectField
            label={f.rule}
            hint={f.ruleHint}
            options={RULE_TYPES.map((option) => ({ value: option, label: f.ruleTypes[option] }))}
            value={type}
            disabled={pending}
            onChange={(event) => changeType(event.target.value as RuleType)}
          />
          {paramField}

          {mode === "create" ? (
            <TextField
              label={f.id}
              hint={f.idHint}
              value={id}
              maxLength={40}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              readOnly={pending}
              error={fieldError("id")}
              onChange={(event) => setIdDraft(event.target.value)}
            />
          ) : null}

          <section aria-label={f.preview} className="border-line-strong p-space-3 gap-space-3 flex items-center rounded-md border">
            <MedalArt tone={tone} imageUrl={image?.url} scale={3} className="shrink-0" />
            <div className="gap-space-1 flex min-w-0 flex-col">
              <p className="type-caption text-text-subtle">{f.preview}</p>
              <p className="type-label text-foreground">{name.trim() || f.name}</p>
              {previewRule ? <p className="type-caption text-muted-foreground">{ruleText(previewRule, names)}</p> : null}
            </div>
          </section>

          <Button type="submit" block loading={pending}>
            {pending ? f.saving : f.save}
          </Button>
        </form>
      </Card>
    </div>
  );
}
