"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { copy } from "@/shared/copy/es";
import { cn } from "@/shared/lib/utils";
import { Card, Icon, SelectField, TextField } from "@/shared/ui";
import {
  CERTIFICATE_FONT_FAMILIES,
  CERTIFICATE_FONT_WEIGHTS,
  CERTIFICATE_TEXT_ALIGNS,
  type CertificateFieldPlacement,
  type CertificateFontFamily,
  type CertificateFontWeight,
  type CertificateTextAlign,
} from "../domain/template";
import { moveFieldBy, moveFieldTo, resizeFieldWidthBy, resizeFieldWidthTo, updateField } from "./field-editing";
import { fieldDisplayText, fontWeightCss, type CertificateRenderValues } from "./render-certificate";

export interface TemplateCanvasEditorProps {
  backgroundUrl: string | null;
  width: number;
  height: number;
  fields: readonly CertificateFieldPlacement[];
  values: CertificateRenderValues;
  disabled?: boolean;
  onChange: (next: CertificateFieldPlacement[]) => void;
}

type Drag = { id: string; mode: "move" | "resize"; startClientX: number; startClientY: number; x: number; y: number; width: number };

const COLOR_SWATCHES = ["#1e1e1e", "#2b2b2b", "#4285f4", "#0f9d58", "#f9ab00", "#ea4335", "#ffffff"] as const;
const t = copy.adminCertificates.editor;

function cssFont(family: CertificateFontFamily): string {
  if (family === "serif") return 'Georgia, "Times New Roman", serif';
  if (family === "mono") return "var(--font-google-sans-code), ui-monospace, monospace";
  return "var(--font-google-sans), system-ui, sans-serif";
}

/**
 * Interactive drag-and-drop and keyboard-accessible field placer over the uploaded certificate template,
 * paired with a per-field inspector for exact coordinates, typography, alignment and color.
 */
export function TemplateCanvasEditor({ backgroundUrl, width, height, fields, values, disabled = false, onChange }: TemplateCanvasEditorProps) {
  const [selectedId, setSelectedId] = useState<string>(fields[0]?.id ?? "recipientName");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [canvasHeightPx, setCanvasHeightPx] = useState(400);
  const [qrState, setQrState] = useState<{ key: string; url: string } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const selected = fields.find((field) => field.id === selectedId) ?? null;
  const qrField = fields.find((field) => field.kind === "qr" && field.enabled);
  const qrKey = qrField && values.verificationUrl ? `${qrField.color}|${values.verificationUrl}` : null;
  const qrUrl = qrKey && qrState?.key === qrKey ? qrState.url : null;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const sync = () => {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0) setCanvasHeightPx(rect.height);
    };
    sync();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width, height]);

  useEffect(() => {
    if (!qrField || !values.verificationUrl || !qrKey) return;
    let active = true;
    void import("qrcode")
      .then((QRCode) => QRCode.toDataURL(values.verificationUrl, { width: 200, margin: 1, color: { dark: qrField.color, light: "#ffffff" } }))
      .then((url) => {
        if (active) setQrState({ key: qrKey, url });
      })
      .catch(() => {
        // Ignore transient QR encoding errors in editor preview.
      });
    return () => {
      active = false;
    };
  }, [qrField, qrKey, values.verificationUrl]);

  function startDrag(event: PointerEvent<HTMLElement>, id: string, mode: Drag["mode"]) {
    if (disabled || event.button !== 0) return;
    const field = fields.find((candidate) => candidate.id === id);
    if (!field) return;
    event.stopPropagation();
    setSelectedId(id);
    canvasRef.current?.setPointerCapture?.(event.pointerId);
    setDrag({ id, mode, startClientX: event.clientX, startClientY: event.clientY, x: field.x, y: field.y, width: field.width });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag || !canvasRef.current) return;
    const box = canvasRef.current.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const dxPct = ((event.clientX - drag.startClientX) / box.width) * 100;
    const dyPct = ((event.clientY - drag.startClientY) / box.height) * 100;
    if (drag.mode === "move") {
      onChange(moveFieldTo(fields, drag.id, drag.x + dxPct, drag.y + dyPct));
    } else {
      onChange(resizeFieldWidthTo(fields, drag.id, drag.width + dxPct));
    }
  }

  function onFieldKey(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (disabled) return;
    const step = 0.5;
    if (event.shiftKey) {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onChange(resizeFieldWidthBy(fields, id, 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        onChange(resizeFieldWidthBy(fields, id, -1));
      }
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = moves[event.key];
    if (!delta) return;
    event.preventDefault();
    onChange(moveFieldBy(fields, id, delta[0], delta[1]));
  }

  return (
    <div className="gap-space-5 flex flex-col">
      <div
        ref={canvasRef}
        role="group"
        aria-label={t.canvasLabel}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        className="border-ink bg-bg-deep relative mx-auto w-full touch-none overflow-hidden rounded-md border-2 select-none"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {backgroundUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={backgroundUrl} alt="" className="pointer-events-none absolute inset-0 size-full object-fill" />
        ) : (
          <div className="text-text-subtle gap-space-2 absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
            <Icon name="image" size={32} />
            <p className="type-body-sm">{t.backgroundHint}</p>
          </div>
        )}

        {fields.map((field) => {
          if (!field.enabled) return null;
          const isSelected = field.id === selectedId;
          const fontPx = (field.fontSize / 100) * canvasHeightPx;
          const previewText = field.kind === "qr" ? "" : fieldDisplayText(field, values) || t.fieldKinds[field.kind];

          return (
            <div
              key={field.id}
              className="absolute"
              style={{
                left: `${field.x}%`,
                top: `${field.y}%`,
                width: `${field.width}%`,
                ...(field.kind === "qr" ? { aspectRatio: "1 / 1" } : {}),
                zIndex: isSelected ? 10 : 5,
              }}
            >
              <button
                type="button"
                aria-pressed={isSelected}
                aria-label={`${t.fieldKinds[field.kind]} (X ${field.x}%, Y ${field.y}%)`}
                onPointerDown={(event) => startDrag(event, field.id, "move")}
                onClick={() => setSelectedId(field.id)}
                onKeyDown={(event) => onFieldKey(event, field.id)}
                className={cn(
                  "block w-full cursor-move rounded-[3px] border border-dashed transition-colors focus-visible:outline-none",
                  isSelected ? "border-primary bg-primary/10 ring-primary ring-2" : "border-ink/50 hover:border-primary/80 bg-transparent",
                  field.kind === "qr" && "h-full",
                )}
              >
                {field.kind === "qr" ? (
                  qrUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrUrl} alt="" className="pointer-events-none size-full rounded-[2px] bg-white object-contain" />
                  ) : (
                    <span className="bg-surface text-foreground type-caption grid size-full place-items-center">QR</span>
                  )
                ) : (
                  <span
                    className="pointer-events-none block truncate leading-none"
                    style={{
                      color: field.color,
                      fontFamily: cssFont(field.fontFamily),
                      fontWeight: fontWeightCss(field.fontWeight),
                      fontSize: `${fontPx}px`,
                      textAlign: field.align,
                    }}
                  >
                    {previewText}
                  </span>
                )}
              </button>
              {isSelected && !disabled ? (
                <span
                  aria-hidden="true"
                  onPointerDown={(event) => startDrag(event, field.id, "resize")}
                  className="bg-primary border-surface absolute -right-1.5 -bottom-1.5 size-4 cursor-ew-resize rounded-full border-2"
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="type-caption text-text-subtle">{t.canvasHint}</p>

      <div className="gap-space-4 grid grid-cols-1 min-[840px]:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="gap-space-2 flex flex-col">
          <h3 className="type-label text-foreground">{t.fieldsTitle}</h3>
          <ul className="gap-space-1 flex flex-col">
            {fields.map((field) => {
              const active = field.id === selectedId;
              const isRequiredName = field.kind === "recipientName";
              return (
                <li key={field.id} className="gap-space-2 flex items-center">
                  <input
                    type="checkbox"
                    aria-label={t.fieldKinds[field.kind]}
                    checked={field.enabled}
                    disabled={disabled || isRequiredName}
                    className="accent-primary size-4 shrink-0"
                    onChange={(event) => onChange(updateField(fields, field.id, { enabled: event.target.checked }))}
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedId(field.id)}
                    className={cn(
                      "type-body-sm px-space-2 py-space-1 flex-1 truncate rounded-sm border text-left transition-colors",
                      active ? "border-primary bg-primary/10 text-foreground font-semibold" : "border-transparent text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    {t.fieldKinds[field.kind]}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="gap-space-4 flex flex-col">
          {selected ? (
            <>
              <div className="gap-space-2 flex flex-wrap items-center justify-between">
                <h3 className="type-heading text-foreground">{t.fieldKinds[selected.kind]}</h3>
                {selected.kind !== "recipientName" ? (
                  <label className="type-body-sm text-foreground gap-space-2 flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={selected.enabled}
                      disabled={disabled}
                      className="accent-primary size-4"
                      onChange={(event) => onChange(updateField(fields, selected.id, { enabled: event.target.checked }))}
                    />
                    {t.fieldProps.enabled}
                  </label>
                ) : null}
              </div>

              <div className="gap-space-3 grid grid-cols-2 sm:grid-cols-4">
                <DecimalField
                  label={t.fieldProps.x}
                  value={selected.x}
                  disabled={disabled}
                  onChange={(x) => onChange(updateField(fields, selected.id, { x }))}
                />
                <DecimalField
                  label={t.fieldProps.y}
                  value={selected.y}
                  disabled={disabled}
                  onChange={(y) => onChange(updateField(fields, selected.id, { y }))}
                />
                <DecimalField
                  label={t.fieldProps.width}
                  value={selected.width}
                  disabled={disabled}
                  onChange={(nextWidth) => onChange(updateField(fields, selected.id, { width: nextWidth }))}
                />
                {selected.kind !== "qr" ? (
                  <DecimalField
                    label={t.fieldProps.fontSize}
                    value={selected.fontSize}
                    disabled={disabled}
                    onChange={(fontSize) => onChange(updateField(fields, selected.id, { fontSize }))}
                  />
                ) : null}
              </div>

              {selected.kind !== "qr" ? (
                <div className="gap-space-3 grid grid-cols-1 sm:grid-cols-3">
                  <SelectField
                    label={t.fieldProps.fontFamily}
                    value={selected.fontFamily}
                    disabled={disabled}
                    options={CERTIFICATE_FONT_FAMILIES.map((family) => ({ value: family, label: t.fieldProps.fonts[family] }))}
                    onChange={(event) => onChange(updateField(fields, selected.id, { fontFamily: event.target.value as CertificateFontFamily }))}
                  />
                  <SelectField
                    label={t.fieldProps.fontWeight}
                    value={selected.fontWeight}
                    disabled={disabled}
                    options={CERTIFICATE_FONT_WEIGHTS.map((weight) => ({ value: weight, label: t.fieldProps.weights[weight] }))}
                    onChange={(event) => onChange(updateField(fields, selected.id, { fontWeight: event.target.value as CertificateFontWeight }))}
                  />
                  <SelectField
                    label={t.fieldProps.align}
                    value={selected.align}
                    disabled={disabled}
                    options={CERTIFICATE_TEXT_ALIGNS.map((align) => ({ value: align, label: t.fieldProps.aligns[align] }))}
                    onChange={(event) => onChange(updateField(fields, selected.id, { align: event.target.value as CertificateTextAlign }))}
                  />
                </div>
              ) : null}

              <div className="gap-space-3 flex flex-wrap items-end">
                <label className="gap-space-1 flex flex-col">
                  <span className="type-label text-foreground">{t.fieldProps.color}</span>
                  <div className="gap-space-2 flex items-center">
                    <input
                      type="color"
                      value={selected.color}
                      disabled={disabled}
                      onChange={(event) => onChange(updateField(fields, selected.id, { color: event.target.value }))}
                      className="border-line-strong bg-surface h-10 w-12 cursor-pointer rounded-sm border p-1"
                    />
                    <div className="gap-space-1 flex flex-wrap">
                      {COLOR_SWATCHES.map((swatch) => (
                        <button
                          key={swatch}
                          type="button"
                          disabled={disabled}
                          aria-label={swatch}
                          onClick={() => onChange(updateField(fields, selected.id, { color: swatch }))}
                          className={cn("border-ink size-7 rounded-full border-2", selected.color.toLowerCase() === swatch && "ring-primary ring-2 ring-offset-1")}
                          style={{ backgroundColor: swatch }}
                        />
                      ))}
                    </div>
                  </div>
                </label>
              </div>

              {selected.kind !== "qr" && selected.kind !== "recipientName" ? (
                <TextField
                  label={t.fieldProps.prefix}
                  hint={t.fieldProps.prefixHint}
                  value={selected.prefix ?? ""}
                  maxLength={80}
                  disabled={disabled}
                  onChange={(event) => onChange(updateField(fields, selected.id, { prefix: event.target.value }))}
                />
              ) : null}
            </>
          ) : (
            <p className="type-body-sm text-muted-foreground">{t.fieldProps.noSelection}</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function DecimalField({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const parsed = Number.parseFloat(draft.replace(",", "."));
    setDraft(null);
    if (Number.isFinite(parsed)) onChange(parsed);
  };
  return (
    <TextField
      label={label}
      value={draft ?? String(value)}
      inputMode="decimal"
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value.replace(/[^0-9.,]/g, ""))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}
