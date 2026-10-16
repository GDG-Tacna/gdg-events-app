"use client";

import Image from "next/image";
import { useId, useRef, useState, type ChangeEvent } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Button, Icon } from "@/shared/ui";
import { IMAGE_RULES, RULE_OF, type ImagePurpose, type ImageRef, type MediaErrorCode, type StoredImage } from "../domain/image";
import type { UploadImageAction, UploadImageActionResult } from "./upload-action";

export interface ImageFieldProps {
  label: string;
  purpose: ImagePurpose;
  /** The image the record has now (or was just given), null when it has none. */
  value: ImageRef | null;
  /** A new upload, or null when the image is removed. The record keeps it only when its form is saved. */
  onChange: (value: ImageRef | null) => void;
  upload: UploadImageAction;
  disabled?: boolean;
  /** Told about each upload with its size (for example to fit the venue grid to the plan's proportions). */
  onUploaded?: (image: StoredImage) => void;
  /** True when a change applies at once (no form to save), so the field does not ask to save. */
  appliesAtOnce?: boolean;
}

const MIME: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", svg: "image/svg+xml" };
const t = copy.common.image;

/**
 * Picks an image, uploads it at once and shows it. The browser checks size and type only to answer quickly; the
 * server checks both again from the bytes. The image is stored when uploaded, but a record only points at it once
 * its own form is saved.
 */
export function ImageField({ label, purpose, value, onChange, upload, disabled = false, onUploaded, appliesAtOnce = false }: ImageFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const ruleName = RULE_OF[purpose];
  const rule = IMAGE_RULES[ruleName];
  const accept = rule.formats.map((format) => MIME[format]).join(",");

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setStatus("");
    if (file.size > rule.maxBytes) return setError(t.errors["too-large"]);
    if (file.type && !accept.split(",").includes(file.type)) return setError(t.errors["unsupported-format"]);

    setUploading(true);
    const form = new FormData();
    form.set("purpose", purpose);
    form.set("file", file);
    let result: UploadImageActionResult;
    try {
      result = await upload(form);
    } catch {
      result = { ok: false, code: "unknown" };
    }
    setUploading(false);
    if (!result.ok) return setError(t.errors[result.code as MediaErrorCode | "disabled" | "unauthenticated"] ?? t.errors.unknown);
    onChange({ path: result.image.path, url: result.image.url });
    onUploaded?.(result.image);
    setStatus(appliesAtOnce ? t.applied : t.uploaded);
  }

  return (
    <div role="group" aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} className="gap-space-2 flex flex-col">
      <span id={`${id}-label`} className="type-label text-foreground">
        {label}
      </span>
      <div className="gap-space-3 flex items-center">
        <div className="bg-bg-deep border-line-strong relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-md border">
          {value ? (
            <Image src={value.url} alt={interpolate(t.previewAlt, { label })} fill unoptimized sizes="96px" className="object-contain" />
          ) : (
            <span className="text-text-subtle gap-space-1 flex flex-col items-center">
              <Icon name="image" size={24} />
              <span className="type-caption">{t.none}</span>
            </span>
          )}
        </div>
        <div className="gap-space-2 flex flex-col items-start">
          <Button type="button" variant="secondary" size="sm" icon="upload" loading={uploading} disabled={disabled || uploading} onClick={() => input.current?.click()}>
            {uploading ? t.uploading : value ? t.change : t.upload}
          </Button>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon="trash"
              disabled={disabled || uploading}
              onClick={() => {
                setError(null);
                setStatus(t.removed);
                onChange(null);
              }}
            >
              {t.remove}
            </Button>
          ) : null}
        </div>
      </div>
      <p id={`${id}-hint`} className="type-caption text-text-subtle">
        {t.formats[ruleName]}
      </p>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
      <input ref={input} type="file" accept={accept} hidden onChange={(event) => void pick(event)} data-testid={`image-input-${purpose}`} />
    </div>
  );
}
