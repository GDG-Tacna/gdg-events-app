"use client";

import { useState, type FormEvent } from "react";
import { ImageField, type ImageRef, type UploadImageAction } from "@/features/media";
import { copy } from "@/shared/copy/es";
import { Button, TextAreaField, TextField } from "@/shared/ui";
import { checkPrize, type SquadCreditsErrorCode, type SquadPrize } from "../domain/squad-credits";

export interface PrizeInput {
  id: string;
  name: string;
  description: string;
  cost: number;
  stock: number | null;
  /** Sent only when the image changed: null removes it, a path points at an upload. */
  imagePath?: string | null;
}

export interface PrizeFormProps {
  /** The prize being edited, or `null` to create one. */
  prize: SquadPrize | null;
  /** Saves and answers with a refusal code, or `null` when it was saved. */
  onSave: (input: PrizeInput) => Promise<SquadCreditsErrorCode | null>;
  onCancel: () => void;
  /** Uploads the prize's photo. */
  upload: UploadImageAction;
}

const digits = (value: string) => value.replace(/[^0-9]/g, "");

/** "Polera del escuadrón" becomes "polera-del-escuadron": a suggestion the admin can change before saving. */
export function suggestPrizeId(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

type Field = "id" | "name" | "description" | "cost" | "stock" | "image";
const FIELD_OF: Partial<Record<SquadCreditsErrorCode, Field>> = {
  "invalid-id": "id",
  "already-exists": "id",
  "invalid-name": "name",
  "invalid-description": "description",
  "invalid-cost": "cost",
  "invalid-stock": "stock",
  "invalid-image": "image",
};

/** Creates or edits a prize with the same rules as the server; each refusal points at its field. */
export function PrizeForm({ prize, onSave, onCancel, upload }: PrizeFormProps) {
  const t = copy.admin.squadCredits;
  const f = t.prizeForm;
  const [name, setName] = useState(prize?.name ?? "");
  const [id, setId] = useState(prize?.id ?? "");
  const [idTouched, setIdTouched] = useState(prize !== null);
  const [description, setDescription] = useState(prize?.description ?? "");
  const [cost, setCost] = useState(prize ? String(prize.cost) : "");
  const [stock, setStock] = useState(prize?.stock === null || prize === null ? "" : String(prize.stock));
  const [image, setImage] = useState<ImageRef | null>(prize?.image ?? null);
  // Only a changed image is sent: an untouched form keeps the stored one.
  const [imageChanged, setImageChanged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ field: Field | null; code: SquadCreditsErrorCode } | null>(null);

  const shownId = idTouched ? id : suggestPrizeId(name);
  const fieldError = (field: Field) => (error?.field === field ? t.errors[error.code] : null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: PrizeInput = {
      id: shownId,
      name,
      description,
      cost: cost === "" ? Number.NaN : Number(cost),
      stock: stock === "" ? null : Number(stock),
      ...(imageChanged ? { imagePath: image?.path ?? null } : {}),
    };
    // The fields first, top to bottom, then the id (which is suggested from the name).
    const fields = checkPrize("prize", input);
    const checked = fields.ok ? checkPrize(input.id, input) : fields;
    if (!checked.ok) {
      setError({ field: FIELD_OF[checked.code] ?? null, code: checked.code });
      return;
    }
    setPending(true);
    setError(null);
    let code: SquadCreditsErrorCode | null;
    try {
      code = await onSave(input);
    } catch {
      code = "unknown";
    }
    setPending(false);
    if (code) setError({ field: FIELD_OF[code] ?? null, code });
  }

  return (
    <form onSubmit={submit} noValidate aria-label={prize ? f.editTitle : f.createTitle} className="gap-space-4 flex flex-col">
      {error && error.field === null ? (
        <p role="alert" className="type-body-sm text-danger">
          {t.errors[error.code]}
        </p>
      ) : null}
      <TextField label={f.name} hint={f.nameHint} value={name} maxLength={60} autoComplete="off" disabled={pending} error={fieldError("name")} onChange={(event) => setName(event.target.value)} />
      {prize ? null : (
        <TextField
          label={f.id}
          hint={f.idHint}
          value={shownId}
          maxLength={40}
          autoComplete="off"
          disabled={pending}
          error={fieldError("id")}
          onChange={(event) => {
            setIdTouched(true);
            setId(event.target.value.toLowerCase());
          }}
        />
      )}
      <TextAreaField
        label={f.description}
        hint={f.descriptionHint}
        value={description}
        maxLength={200}
        rows={2}
        counter={{ current: description.length, max: 200 }}
        disabled={pending}
        error={fieldError("description")}
        onChange={(event) => setDescription(event.target.value)}
      />
      <div className="gap-space-3 grid grid-cols-2">
        <TextField label={f.cost} hint={f.costHint} value={cost} inputMode="numeric" maxLength={7} autoComplete="off" disabled={pending} error={fieldError("cost")} onChange={(event) => setCost(digits(event.target.value))} />
        <TextField label={f.stock} hint={f.stockHint} value={stock} inputMode="numeric" maxLength={6} autoComplete="off" disabled={pending} error={fieldError("stock")} onChange={(event) => setStock(digits(event.target.value))} />
      </div>
      <ImageField
        label={f.image}
        purpose="squad-prize"
        value={image}
        upload={upload}
        disabled={pending}
        onChange={(next) => {
          setImage(next);
          setImageChanged(true);
        }}
      />
      {fieldError("image") ? (
        <p role="alert" className="type-body-sm text-danger">
          {fieldError("image")}
        </p>
      ) : null}
      <div className="gap-space-3 flex flex-wrap">
        <Button type="submit" loading={pending}>
          {pending ? f.saving : f.save}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
          {f.cancel}
        </Button>
      </div>
    </form>
  );
}
