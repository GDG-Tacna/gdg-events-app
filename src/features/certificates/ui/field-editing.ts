import type { CertificateFieldPlacement } from "../domain/template";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value * 10) / 10));

export function updateField(
  fields: readonly CertificateFieldPlacement[],
  id: string,
  patch: Partial<CertificateFieldPlacement>,
): CertificateFieldPlacement[] {
  return fields.map((field) => {
    if (field.id !== id) return field;
    const next = { ...field, ...patch };
    const x = clamp(next.x, 0, 95);
    const y = clamp(next.y, 0, 95);
    const width = clamp(next.width, 5, 100 - x);
    const fontSize = clamp(next.fontSize, 0.8, 15);
    return { ...next, x, y, width, fontSize };
  });
}

export function moveFieldTo(fields: readonly CertificateFieldPlacement[], id: string, x: number, y: number): CertificateFieldPlacement[] {
  return fields.map((field) => {
    if (field.id !== id) return field;
    const clampedX = clamp(x, 0, Math.max(0, 100 - field.width));
    const clampedY = clamp(y, 0, 95);
    return { ...field, x: clampedX, y: clampedY };
  });
}

export function moveFieldBy(fields: readonly CertificateFieldPlacement[], id: string, dx: number, dy: number): CertificateFieldPlacement[] {
  const target = fields.find((field) => field.id === id);
  if (!target) return [...fields];
  return moveFieldTo(fields, id, target.x + dx, target.y + dy);
}

export function resizeFieldWidthTo(fields: readonly CertificateFieldPlacement[], id: string, width: number): CertificateFieldPlacement[] {
  return fields.map((field) => {
    if (field.id !== id) return field;
    return { ...field, width: clamp(width, 5, 100 - field.x) };
  });
}

export function resizeFieldWidthBy(fields: readonly CertificateFieldPlacement[], id: string, dw: number): CertificateFieldPlacement[] {
  const target = fields.find((field) => field.id === id);
  if (!target) return [...fields];
  return resizeFieldWidthTo(fields, id, target.width + dw);
}
