"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import {
  BEARDS,
  Button,
  ButtonLink,
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

const TABS = ["face", "hair", "helmet", "suit"] as const;
type Tab = (typeof TABS)[number];

const indexes = (length: number) => Array.from({ length }, (_, index) => index);

/** One radio choice drawn as a tile: a picture (a swatch or a little avatar) with its name for assistive tech and as a tooltip. */
function Tile({ name, value, checked, label, onChange, disabled, children, round = false }: { name: string; value: string; checked: boolean; label: string; onChange: () => void; disabled: boolean; children: ReactNode; round?: boolean }) {
  return (
    <label className="relative cursor-pointer" title={label}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} disabled={disabled} aria-label={label} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={cn(
          "border-line-strong bg-surface-raised peer-checked:border-ink peer-focus-visible:ring-ring grid place-items-center border-2 transition-colors peer-checked:border-[3px] peer-focus-visible:ring-[3px] peer-disabled:opacity-50",
          round ? "size-11 rounded-full" : "min-h-[72px] min-w-[72px] rounded-md p-1",
        )}
      >
        {children}
      </span>
    </label>
  );
}

/** A group of choices: a labeled radio group in a wrapping row. */
function Group({ legend, hint, children }: { legend: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="gap-space-2 flex flex-col">
      <legend className="type-label text-foreground mb-space-2">{legend}</legend>
      <div className="gap-space-2 flex flex-wrap">{children}</div>
      {hint ? <p className="type-caption text-text-subtle">{hint}</p> : null}
    </fieldset>
  );
}

/**
 * The avatar editor, like a wardrobe: the preview stays on top while the choices change below it, in four tabs (face,
 * hair, helmet, suit). Choices with a shape (hairstyle, beard, glasses, helmet on or off) are little avatars that wear
 * them, so each one is seen before it is picked; colors are swatches. A random look, an undo, the way back to the one the
 * alias gives, and a bar that says whether there is anything to save. Saved to the person's profile, so it follows them to
 * every edition. The server checks every choice again.
 */
export function AvatarEditor({ alias, chosen, save, reset, backHref }: AvatarEditorProps) {
  const router = useRouter();
  const original = lookFromSeed(alias);
  const [look, setLook] = useState<AvatarLook>(chosen ?? original);
  /** What is saved (the chosen look, or the original): what "unsaved changes" is measured against. */
  const [saved, setSaved] = useState<AvatarLook>(chosen ?? original);
  const [history, setHistory] = useState<AvatarLook[]>([]);
  const [tab, setTab] = useState<Tab>("face");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AvatarErrorCode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  /** Changes the look, remembering the one before so «Deshacer» can bring it back. */
  const change = (next: AvatarLook) => {
    setNotice(null);
    setHistory((past) => [...past, look].slice(-30));
    setLook(next);
  };
  const set = <K extends keyof AvatarLook>(key: K, value: AvatarLook[K]) => change({ ...look, [key]: value });

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setNotice(null);
    setHistory((past) => past.slice(0, -1));
    setLook(previous);
  }

  async function run(action: () => Promise<{ ok: true } | { ok: false; code: AvatarErrorCode }>, done: string, then: () => void) {
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
    then();
    setNotice(done);
    router.refresh();
  }

  /** Back to the alias's look: shown at once, and the chosen one is forgotten (nothing to forget if none was saved). */
  async function restore() {
    setLook(original);
    setHistory([]);
    if (chosen === null) {
      setSaved(original);
      return setNotice(t.restored);
    }
    await run(reset, t.restored, () => setSaved(original));
  }

  const isOriginal = sameLook(look, original);
  const dirty = !sameLook(look, saved);
  /** The look the little avatars wear: bare-headed, so a hairstyle, a beard or glasses can be seen. */
  const wear = (part: Partial<AvatarLook>): AvatarLook => ({ ...look, helmetOn: false, ...part });
  const swatch = (colors: readonly string[]) => (
    <span aria-hidden="true" style={{ backgroundColor: colors[1] ?? colors[0] }} className="block size-full rounded-full" />
  );

  return (
    <div className="gap-space-4 flex flex-col">
      <div>
        <ButtonLink href={backHref} variant="ghost" size="sm" className="-ml-space-4">
          {t.back}
        </ButtonLink>
      </div>
      <header className="gap-space-1 flex flex-col">
        <h1 className="type-title-xl text-foreground">{t.title}</h1>
        <p className="type-body text-muted-foreground">{t.subtitle}</p>
      </header>

      {/* The preview stays in view while the choices below it scroll. A solid fill: nothing shows through it. */}
      <div className="bg-background border-ink pt-safe-space-2 pb-space-3 gap-space-4 sticky top-0 z-20 flex items-center border-b-2">
        <PixelAvatar seed={alias} look={look} scale={4} title={t.previewLabel} className="shrink-0" />
        <div className="gap-space-2 flex min-w-0 flex-1 flex-col items-start">
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => change(randomLook())}>
            {t.random}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={pending || history.length === 0} onClick={undo}>
            {t.undo}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={pending || (isOriginal && chosen === null)} onClick={() => void restore()}>
            {t.original}
          </Button>
        </div>
      </div>
      <p className="type-caption text-text-subtle -mt-space-2">{t.originalHint}</p>

      {notice ? (
        <p ref={noticeRef} tabIndex={-1} role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border outline-none">
          {notice}
        </p>
      ) : null}
      {error ? <InlineAlert>{t.errors[error]}</InlineAlert> : null}

      <div role="tablist" aria-label={t.tabsLabel} className="gap-space-2 grid grid-cols-4">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`${panelId}-tab-${name}`}
            aria-selected={tab === name}
            aria-controls={`${panelId}-panel`}
            onClick={() => setTab(name)}
            className={cn(
              "type-label focus-visible:ring-ring min-h-12 rounded-full border-2 px-2 transition-colors focus-visible:ring-[3px] focus-visible:outline-none",
              tab === name ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-surface text-foreground hover:bg-pastel-blue hover:text-on-accent",
            )}
          >
            {t.tabs[name]}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${panelId}-panel`} aria-labelledby={`${panelId}-tab-${tab}`} className="bg-card border-ink p-space-4 gap-space-5 flex flex-col rounded-lg border-2">
        {tab === "face" ? (
          <>
            <Group legend={t.groups.skin}>
              {indexes(SKIN_TONES.length).map((index) => (
                <Tile key={index} round name="skin" value={String(index)} checked={look.skin === index} label={interpolate(t.skinTone, { n: String(index + 1) })} onChange={() => set("skin", index)} disabled={pending}>
                  {swatch(SKIN_TONES[index])}
                </Tile>
              ))}
            </Group>
            <Group legend={t.groups.beard}>
              {BEARDS.map((beard) => (
                <Tile key={beard} name="beard" value={beard} checked={look.beard === beard} label={t.beards[beard]} onChange={() => set("beard", beard)} disabled={pending}>
                  <PixelAvatar seed={alias} look={wear({ beard })} scale={2} />
                </Tile>
              ))}
            </Group>
            <Group legend={t.groups.glasses}>
              {GLASSES.map((glasses) => (
                <Tile key={glasses} name="glasses" value={glasses} checked={look.glasses === glasses} label={t.glasses[glasses]} onChange={() => set("glasses", glasses)} disabled={pending}>
                  <PixelAvatar seed={alias} look={wear({ glasses })} scale={2} />
                </Tile>
              ))}
            </Group>
          </>
        ) : null}

        {tab === "hair" ? (
          <>
            <Group legend={t.groups.hairStyle}>
              {HAIR_STYLES.map((hairStyle) => (
                <Tile key={hairStyle} name="hair-style" value={hairStyle} checked={look.hairStyle === hairStyle} label={t.hairStyles[hairStyle]} onChange={() => set("hairStyle", hairStyle)} disabled={pending}>
                  <PixelAvatar seed={alias} look={wear({ hairStyle })} scale={2} />
                </Tile>
              ))}
            </Group>
            <Group legend={t.groups.hairColor}>
              {indexes(HAIR_COLORS.length).map((index) => (
                <Tile key={index} round name="hair-color" value={String(index)} checked={look.hairColor === index} label={t.hairColors[index]} onChange={() => set("hairColor", index)} disabled={pending}>
                  {swatch(HAIR_COLORS[index])}
                </Tile>
              ))}
            </Group>
          </>
        ) : null}

        {tab === "helmet" ? (
          <>
            <Group legend={t.groups.helmetState} hint={look.helmetOn ? undefined : t.helmetOffHint}>
              {([true, false] as const).map((on) => (
                <Tile key={String(on)} name="helmet-state" value={on ? "on" : "off"} checked={look.helmetOn === on} label={on ? t.helmetState.on : t.helmetState.off} onChange={() => set("helmetOn", on)} disabled={pending}>
                  <PixelAvatar seed={alias} look={{ ...look, helmetOn: on }} scale={2} />
                </Tile>
              ))}
            </Group>
            <Group legend={t.groups.helmet} hint={look.helmetOn ? undefined : t.helmetColorOff}>
              {indexes(HELMET_COLORS.length).map((index) => (
                <Tile key={index} round name="helmet" value={String(index)} checked={look.helmet === index} label={t.helmets[index]} onChange={() => set("helmet", index)} disabled={pending || !look.helmetOn}>
                  {swatch(HELMET_COLORS[index])}
                </Tile>
              ))}
            </Group>
          </>
        ) : null}

        {tab === "suit" ? (
          <Group legend={t.groups.suit}>
            {indexes(SUIT_COLORS.length).map((index) => (
              <Tile key={index} round name="suit" value={String(index)} checked={look.suit === index} label={t.suits[index]} onChange={() => set("suit", index)} disabled={pending}>
                {swatch(SUIT_COLORS[index])}
              </Tile>
            ))}
          </Group>
        ) : null}
      </div>

      {/* The way to save stays at the bottom of the screen and says whether there is anything to save. */}
      <div className="bg-background border-ink pb-safe-space-3 pt-space-3 gap-space-3 sticky bottom-0 z-20 flex items-center border-t-2">
        <p aria-live="polite" className={cn("type-caption min-w-0 flex-1", dirty ? "text-gold-ink font-semibold" : "text-text-subtle")}>
          {dirty ? t.unsaved : t.allSaved}
        </p>
        <Button type="button" loading={pending} disabled={pending} onClick={() => void run(() => save({ look }), t.saved, () => setSaved(look))}>
          {pending ? t.saving : t.save}
        </Button>
      </div>
    </div>
  );
}
