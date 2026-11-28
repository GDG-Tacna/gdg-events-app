"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { cn } from "@/shared/lib/utils";
import { ImageField, type ImageRef, type UploadImageAction } from "@/features/media";
import { Button, ButtonLink, Card, InlineAlert, MedalArt, PixelMedal, SelectField, TextAreaField, TextField } from "@/shared/ui";
import { BADGE_DESCRIPTION_MAX, BADGE_NAME_MAX, BADGE_TONES, type BadgeTone } from "../domain/badge";
import {
  GLOBAL_RULE_TYPES,
  checkGlobalBadge,
  parseGlobalRule,
  type GlobalBadge,
  type GlobalRuleType,
} from "../domain/global-badge";
import type { AchievementAdminErrorCode } from "../domain/manage";
import type { SaveGlobalBadgeAction } from "./admin-actions";
import { globalRuleText } from "./rule-text";

export interface GlobalBadgeFormProps {
  mode: "create" | "edit";
  badge?: GlobalBadge;
  save: SaveGlobalBadgeAction;
  upload: UploadImageAction;
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
  "invalid-image": "image",
};

/** Create or edit a global community badge (evaluated across all GDG Tacna editions). */
export function GlobalBadgeForm({ mode, badge, save, upload, listHref }: GlobalBadgeFormProps) {
  const t = copy.admin.achievements;
  const f = t.form;
  const g = t.global;
  const router = useRouter();
  const [name, setName] = useState(badge?.name ?? "");
  const [description, setDescription] = useState(badge?.description ?? "");
  const [tone, setTone] = useState<BadgeTone>(badge?.tone ?? "cyan");
  const [type, setType] = useState<GlobalRuleType>(badge?.rule.type ?? "events-attended");
  const [count, setCount] = useState(badge ? String(badge.rule.count) : "1");
  const [image, setImage] = useState<ImageRef | null>(badge?.image ?? null);
  const [imageChanged, setImageChanged] = useState(false);
  const [idDraft, setIdDraft] = useState<string | null>(null);
  const [error, setError] = useState<AchievementAdminErrorCode | null>(null);
  const [pending, setPending] = useState(false);

  const id = mode === "edit" && badge ? badge.id : (idDraft ?? suggestId(name));
  const field = error ? FIELD_OF[error] : undefined;
  const fieldError = (which: Field) => (field === which && error ? t.errors[error] : null);
  const rule = { type, count: count === "" ? Number.NaN : Number(count) };
  const previewRule = parseGlobalRule(rule);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const draft = { name, description, tone, rule, ...(imageChanged ? { imagePath: image?.path ?? null } : {}) };
    const fields = checkGlobalBadge("badge", { ...draft, active: true });
    const checked = fields.ok ? checkGlobalBadge(id, { ...draft, active: true }) : fields;
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

  return (
    <div className="gap-space-4 flex flex-col">
      <div>
        <ButtonLink href={listHref} variant="ghost" size="sm" className="-ml-space-4">
          {g.back}
        </ButtonLink>
      </div>
      <h1 className="type-title-xl text-foreground">{mode === "create" ? g.createTitle : g.editTitle}</h1>
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
                  <input type="radio" name="global-badge-tone" value={option} checked={tone === option} onChange={() => setTone(option)} className="peer sr-only" />
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
            <p role="alert" className="type-body-sm text-danger-ink -mt-space-3">
              {fieldError("image")}
            </p>
          ) : null}
          <p className="type-caption text-text-subtle -mt-space-3">{f.imageHint}</p>

          <SelectField
            label={f.rule}
            hint={g.ruleHint}
            options={GLOBAL_RULE_TYPES.map((option) => ({ value: option, label: g.ruleTypes[option] }))}
            value={type}
            disabled={pending}
            onChange={(event) => setType(event.target.value as GlobalRuleType)}
          />

          <TextField
            label={type === "total-credits" ? f.credits : f.count}
            inputMode="numeric"
            maxLength={type === "total-credits" ? 6 : 4}
            autoComplete="off"
            value={count}
            disabled={pending}
            error={fieldError("rule")}
            onChange={(event) => setCount(event.target.value.replace(/[^0-9]/g, ""))}
          />

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
              {previewRule ? <p className="type-caption text-muted-foreground">{globalRuleText(previewRule)}</p> : null}
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
