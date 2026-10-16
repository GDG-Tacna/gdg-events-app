"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import {
  BEARDS,
  Button,
  ButtonLink,
  Card,
  GLASSES,
  HAIR_COLORS,
  HAIR_STYLES,
  HELMET_COLORS,
  InlineAlert,
  PixelAvatar,
  SKIN_TONES,
  SUIT_COLORS,
  lookFromSeed,
  randomLook,
  sameLook,
  type AvatarLook,
} from "@/shared/ui";
import type { AvatarErrorCode } from "../domain/avatar";
import type { ResetAvatarAction, SaveAvatarAction } from "./actions";

export interface AvatarEditorProps {
  /** The cadet's alias: it gives the original look. */
  alias: string;
  /** The look the cadet chose before, or `null` when they still use the original. */
  chosen: AvatarLook | null;
  save: SaveAvatarAction;
  reset: ResetAvatarAction;
  backHref: string;
}

const t = copy.avatar;

/** One group of choices: a radio group whose options are color swatches or labeled chips. */
function ChoiceGroup<T extends string | number>({
  name,
  legend,
  options,
  value,
  onChange,
  disabled,
  render,
}: {
  name: string;
  legend: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  disabled: boolean;
  render: (option: T) => { label: string; swatch?: string; content?: ReactNode };
}) {
  return (
    <fieldset className="gap-space-2 flex flex-col" disabled={disabled}>
      <legend className="type-label text-foreground mb-space-2">{legend}</legend>
      <div className="gap-space-2 flex flex-wrap">
        {options.map((option) => {
          const { label, swatch } = render(option);
          return (
            <label key={String(option)} className="relative cursor-pointer">
              <input type="radio" name={name} value={String(option)} checked={value === option} onChange={() => onChange(option)} aria-label={swatch ? label : undefined} className="peer sr-only" />
              {swatch ? (
                <span
                  aria-hidden="true"
                  title={label}
                  style={{ backgroundColor: swatch }}
                  className="border-line-strong peer-checked:ring-primary peer-focus-visible:ring-ring block size-11 rounded-full border-2 peer-checked:ring-[3px] peer-focus-visible:ring-[3px]"
                />
              ) : (
                <span className="type-label border-line-strong bg-bg-deep peer-checked:border-primary peer-checked:bg-surface-raised peer-focus-visible:ring-ring px-space-4 inline-flex min-h-11 items-center rounded-md border peer-focus-visible:ring-[3px]">
                  {label}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const indexes = (length: number) => Array.from({ length }, (_, index) => index);

/**
 * The avatar editor: a large preview and a choice for each part (skin, hairstyle and color, beard, glasses, helmet and
 * suit colors), with a random look and the way back to the one the alias gives. Saved to the person's profile, so it
 * follows them to every edition. The server checks every choice again.
 */
export function AvatarEditor({ alias, chosen, save, reset, backHref }: AvatarEditorProps) {
  const router = useRouter();
  const original = lookFromSeed(alias);
  const [look, setLook] = useState<AvatarLook>(chosen ?? original);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AvatarErrorCode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  const set = <K extends keyof AvatarLook>(key: K, value: AvatarLook[K]) => {
    setNotice(null);
    setLook((prev) => ({ ...prev, [key]: value }));
  };

  async function run(action: () => Promise<{ ok: true } | { ok: false; code: AvatarErrorCode }>, done: string) {
    setPending(true);
    setError(null);
    setNotice(null);
    let result;
    try {
      result = await action();
    } catch {
      result = { ok: false as const, code: "unknown" as const };
    }
    setPending(false);
    if (!result.ok) return setError(result.code);
    setNotice(done);
    router.refresh();
  }

  /** Back to the alias's look: shown at once, and the chosen one is forgotten (nothing to forget if none was saved). */
  async function restore() {
    setLook(original);
    if (chosen === null) return setNotice(t.restored);
    await run(reset, t.restored);
  }

  const isOriginal = sameLook(look, original);

  return (
    <div className="gap-space-5 flex flex-col">
      <div>
        <ButtonLink href={backHref} variant="ghost" size="sm" className="-ml-space-4">
          {t.back}
        </ButtonLink>
      </div>
      <header className="gap-space-1 flex flex-col">
        <h1 className="type-title-xl text-foreground">{t.title}</h1>
        <p className="type-body text-muted-foreground">{t.subtitle}</p>
      </header>

      <Card className="gap-space-4 flex flex-col items-center">
        <PixelAvatar seed={alias} look={look} scale={6} title={t.previewLabel} />
        <div className="gap-space-2 flex flex-wrap justify-center">
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setLook(randomLook())}>
            {t.random}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={pending || (isOriginal && chosen === null)} onClick={() => void restore()}>
            {t.original}
          </Button>
        </div>
        <p className="type-caption text-text-subtle">{t.originalHint}</p>
      </Card>

      {notice ? (
        <p ref={noticeRef} tabIndex={-1} role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border outline-none">
          {notice}
        </p>
      ) : null}
      {error ? <InlineAlert>{t.errors[error]}</InlineAlert> : null}

      <Card className="gap-space-5 flex flex-col">
        <ChoiceGroup name="skin" legend={t.groups.skin} options={indexes(SKIN_TONES.length)} value={look.skin} onChange={(value) => set("skin", value)} disabled={pending} render={(index) => ({ label: interpolate(t.skinTone, { n: String(index + 1) }), swatch: SKIN_TONES[index][1] })} />
        <ChoiceGroup name="hair-style" legend={t.groups.hairStyle} options={HAIR_STYLES} value={look.hairStyle} onChange={(value) => set("hairStyle", value)} disabled={pending} render={(style) => ({ label: t.hairStyles[style] })} />
        <ChoiceGroup name="hair-color" legend={t.groups.hairColor} options={indexes(HAIR_COLORS.length)} value={look.hairColor} onChange={(value) => set("hairColor", value)} disabled={pending} render={(index) => ({ label: t.hairColors[index], swatch: HAIR_COLORS[index][1] })} />
        <ChoiceGroup name="beard" legend={t.groups.beard} options={BEARDS} value={look.beard} onChange={(value) => set("beard", value)} disabled={pending} render={(beard) => ({ label: t.beards[beard] })} />
        <ChoiceGroup name="glasses" legend={t.groups.glasses} options={GLASSES} value={look.glasses} onChange={(value) => set("glasses", value)} disabled={pending} render={(glasses) => ({ label: t.glasses[glasses] })} />
        <ChoiceGroup name="helmet" legend={t.groups.helmet} options={indexes(HELMET_COLORS.length)} value={look.helmet} onChange={(value) => set("helmet", value)} disabled={pending} render={(index) => ({ label: t.helmets[index], swatch: HELMET_COLORS[index][2] })} />
        <ChoiceGroup name="suit" legend={t.groups.suit} options={indexes(SUIT_COLORS.length)} value={look.suit} onChange={(value) => set("suit", value)} disabled={pending} render={(index) => ({ label: t.suits[index], swatch: SUIT_COLORS[index][0] })} />

        <Button type="button" block loading={pending} disabled={pending} onClick={() => void run(() => save({ look }), t.saved)}>
          {pending ? t.saving : t.save}
        </Button>
      </Card>
    </div>
  );
}
