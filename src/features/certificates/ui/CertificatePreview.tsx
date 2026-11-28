"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/utils";
import type { CertificateRenderSpec } from "../domain/certificate";
import type { CertificateFontFamily } from "../domain/template";
import { fieldDisplayText, fontWeightCss, type CertificateRenderValues } from "./render-certificate";

export interface CertificatePreviewProps {
  spec: CertificateRenderSpec;
  values: CertificateRenderValues;
  className?: string;
  /** Accessible description of the rendered certificate. */
  label?: string;
}

function previewFontFamily(family: CertificateFontFamily): string {
  if (family === "serif") return 'Georgia, "Times New Roman", serif';
  if (family === "mono") return "var(--font-google-sans-code), ui-monospace, monospace";
  return "var(--font-google-sans), system-ui, sans-serif";
}

/**
 * Responsive live DOM preview matching the exact percentage coordinates and typography of the Canvas/PDF renderer.
 * Tracks container height via `ResizeObserver` so `fontSize` (% of template height) scales faithfully at any width.
 */
export function CertificatePreview({ spec, values, className, label }: CertificatePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [heightPx, setHeightPx] = useState(400);
  const [qrState, setQrState] = useState<{ key: string; url: string } | null>(null);

  const qrField = spec.fields.find((field) => field.kind === "qr" && field.enabled);
  const qrKey = qrField && values.verificationUrl ? `${qrField.color}|${values.verificationUrl}` : null;
  const qrUrl = qrKey && qrState?.key === qrKey ? qrState.url : null;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sync = () => {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0) setHeightPx(rect.height);
    };
    sync();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!qrField || !values.verificationUrl || !qrKey) return;
    let active = true;
    const qrPayload = values.verificationUrl.startsWith("/")
      ? new URL(values.verificationUrl, window.location.origin).toString()
      : values.verificationUrl;
    void import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(qrPayload, {
          width: 240,
          margin: 1,
          color: { dark: qrField.color, light: "#ffffff" },
        }),
      )
      .then((dataUrl) => {
        if (active) setQrState({ key: qrKey, url: dataUrl });
      })
      .catch(() => {
        // Ignore transient QR encoding errors in preview.
      });
    return () => {
      active = false;
    };
  }, [qrField, qrKey, values.verificationUrl]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={label ?? values.recipientName}
      className={cn("border-ink bg-bg-deep relative w-full overflow-hidden rounded-md border-2 select-none", className)}
      style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={spec.backgroundUrl} alt="" className="pointer-events-none absolute inset-0 size-full object-fill" />

      {spec.fields.map((field) => {
        if (!field.enabled) return null;
        if (field.kind === "qr") {
          return (
            <div
              key={field.id}
              aria-hidden="true"
              className="pointer-events-none absolute"
              style={{
                left: `${field.x}%`,
                top: `${field.y}%`,
                width: `${field.width}%`,
                aspectRatio: "1 / 1",
              }}
            >
              {qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrUrl} alt="" className="size-full rounded-[2px] bg-white object-contain" />
              ) : null}
            </div>
          );
        }

        const text = fieldDisplayText(field, values);
        if (!text) return null;
        const fontPx = (field.fontSize / 100) * heightPx;

        return (
          <div
            key={field.id}
            aria-hidden="true"
            className="pointer-events-none absolute truncate leading-none"
            style={{
              left: `${field.x}%`,
              top: `${field.y}%`,
              width: `${field.width}%`,
              color: field.color,
              fontFamily: previewFontFamily(field.fontFamily),
              fontWeight: fontWeightCss(field.fontWeight),
              fontSize: `${fontPx}px`,
              textAlign: field.align,
            }}
          >
            {text}
          </div>
        );
      })}
    </div>
  );
}
