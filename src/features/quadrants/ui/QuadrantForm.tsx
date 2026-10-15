"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { Button, ButtonLink, Card, InlineAlert, PixelPlanet, SelectField, TextField } from "@/shared/ui";
import type { QuadrantAdminErrorCode } from "../domain/manage";
import { isQuadrantId, normalizeQuadrantName, normalizeQuadrantTagline, QUADRANT_PLANETS, type Quadrant, type QuadrantPlanet } from "../domain/quadrant";
import type { SaveQuadrantAction } from "./admin-actions";

export interface QuadrantFormProps {
  mode: "create" | "edit";
  quadrant?: Quadrant;
  save: SaveQuadrantAction;
  listHref: string;
}

/** "Desarrollo Web" becomes "desarrollo-web". */
const suggestId = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");

/** Create or edit a quadrant: name, tagline, planet and (when creating) its id. Goes back to the map once saved. */
export function QuadrantForm({ mode, quadrant, save, listHref }: QuadrantFormProps) {
  const router = useRouter();
  const [name, setName] = useState(quadrant?.name ?? "");
  const [tagline, setTagline] = useState(quadrant?.tagline ?? "");
  const [planet, setPlanet] = useState<QuadrantPlanet>(quadrant?.planet ?? "gdg");
  const [idDraft, setIdDraft] = useState<string | null>(null);
  const [error, setError] = useState<QuadrantAdminErrorCode | null>(null);
  const [pending, setPending] = useState(false);

  const id = mode === "edit" && quadrant ? quadrant.id : (idDraft ?? suggestId(name));
  const fieldError = (codes: QuadrantAdminErrorCode[]) => (error && codes.includes(error) ? copy.admin.map.errors[error] : null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (normalizeQuadrantName(name) === null) return setError("invalid-name");
    if (normalizeQuadrantTagline(tagline) === null) return setError("invalid-tagline");
    if (mode === "create" && !isQuadrantId(id)) return setError("invalid-id");

    setPending(true);
    setError(null);
    let result;
    try {
      result = await save({ id, name, tagline, planet });
    } catch {
      result = { ok: false as const, code: "unknown" as const };
    }
    setPending(false);
    if (!result.ok) return setError(result.code);
    router.push(listHref);
    router.refresh();
  }

  const fieldCodes: QuadrantAdminErrorCode[] = ["invalid-name", "invalid-tagline", "invalid-id", "already-exists"];

  return (
    <div className="gap-space-4 flex flex-col">
      <div>
        <ButtonLink href={listHref} variant="ghost" size="sm" className="-ml-space-4">
          {copy.admin.map.quadrantForm.back}
        </ButtonLink>
      </div>
      <h1 className="type-title-xl text-foreground">{mode === "create" ? copy.admin.map.quadrantForm.createTitle : copy.admin.map.quadrantForm.editTitle}</h1>
      {error && !fieldCodes.includes(error) ? <InlineAlert>{copy.admin.map.errors[error]}</InlineAlert> : null}

      <Card>
        <form onSubmit={handleSubmit} noValidate className="gap-space-5 flex flex-col">
          <TextField label={copy.admin.map.quadrantForm.name} value={name} maxLength={40} autoComplete="off" readOnly={pending} error={fieldError(["invalid-name"])} onChange={(event) => setName(event.target.value)} />
          <TextField label={copy.admin.map.quadrantForm.tagline} value={tagline} maxLength={80} autoComplete="off" readOnly={pending} error={fieldError(["invalid-tagline"])} onChange={(event) => setTagline(event.target.value)} />
          <div className="gap-space-4 flex items-end">
            <div className="min-w-0 flex-1">
              <SelectField
                label={copy.admin.map.quadrantForm.planet}
                options={QUADRANT_PLANETS.map((value) => ({ value, label: copy.admin.map.planets[value] }))}
                value={planet}
                disabled={pending}
                onChange={(event) => setPlanet(event.target.value as QuadrantPlanet)}
              />
            </div>
            <PixelPlanet kind={planet} scale={3} />
          </div>
          {mode === "create" ? (
            <TextField
              label={copy.admin.map.quadrantForm.id}
              hint={copy.admin.map.quadrantForm.idHint}
              value={id}
              maxLength={24}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              readOnly={pending}
              error={fieldError(["invalid-id", "already-exists"])}
              onChange={(event) => setIdDraft(event.target.value)}
            />
          ) : null}
          <Button type="submit" block loading={pending}>
            {pending ? copy.admin.map.quadrantForm.saving : copy.admin.map.quadrantForm.save}
          </Button>
        </form>
      </Card>
    </div>
  );
}
