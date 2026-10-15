"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ImageField, type UploadImageAction } from "@/features/media";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, ButtonLink, Card, InlineAlert, PixelPlanet, SelectField, TextField } from "@/shared/ui";
import type { Quadrant } from "../domain/quadrant";
import { VENUE_AREA_KINDS, VENUE_MAX_AREAS, VENUE_MAX_SIZE, VENUE_MIN_SIZE, venueProblems, type VenueAreaKind, type VenueMap } from "../domain/venue";
import type { SaveVenueAction } from "./admin-actions";
import { ON_PLAN, PlanBackground } from "./PlanBackground";
import { AREA_STYLE, PLANET_ACCENT, percent } from "./plan-style";
import { addArea, moveAreaBy, moveAreaTo, removeArea, resizeAreaBy, resizeAreaTo, resizePlan, updateArea } from "./venue-editing";

export interface VenueEditorProps {
  venue: VenueMap;
  /** True while the edition has no plan of its own: the bundled one is the starting point. */
  isDefault: boolean;
  /** Every quadrant a stand can belong to, active or not. */
  quadrants: readonly Quadrant[];
  save: SaveVenueAction;
  /** Uploads the venue's real plan. */
  upload: UploadImageAction;
  hrefs: { back: string; checkpoints: string };
}

type Drag = { id: string; mode: "move" | "resize"; pointerX: number; pointerY: number; x: number; y: number; width: number; height: number };
type Notice = { kind: "success" | "error"; text: string; withLink?: boolean } | null;

/**
 * The grid that keeps the plan's width and takes its proportions (within the allowed sizes): the height follows the
 * width, or the width follows the height when the plan is taller than the grid allows.
 */
function fitGrid(width: number, plan: { width: number; height: number }): { width: number; height: number } {
  const clamp = (value: number) => Math.min(VENUE_MAX_SIZE, Math.max(VENUE_MIN_SIZE, Math.round(value)));
  const height = (width * plan.height) / plan.width;
  if (height <= VENUE_MAX_SIZE) return { width, height: clamp(height) };
  return { width: clamp((VENUE_MAX_SIZE * plan.width) / plan.height), height: VENUE_MAX_SIZE };
}

const toInt = (value: string) => (value.trim() === "" ? Number.NaN : Number(value));

/**
 * The venue plan editor. Areas are buttons on the plan: choose one, drag it to move it, drag the corner
 * handle to resize it, or use the arrows (Shift + arrows to resize). The side panel edits the chosen area's
 * name, kind, quadrant and exact position and size. Problems are pointed at before saving; the server
 * checks the plan again and creates each new stand's QR.
 */
export function VenueEditor({ venue: initial, isDefault, quadrants, save, upload, hrefs }: VenueEditorProps) {
  const router = useRouter();
  const [venue, setVenue] = useState<VenueMap>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [showProblems, setShowProblems] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  // The size of a plan just uploaded, to offer fitting the grid to its proportions.
  const [planSize, setPlanSize] = useState<{ width: number; height: number } | null>(null);
  const fitted = planSize ? fitGrid(venue.width, planSize) : null;
  const canFit = fitted !== null && (fitted.width !== venue.width || fitted.height !== venue.height);

  const problems = useMemo(() => venueProblems(venue), [venue]);
  const selected = venue.areas.find((area) => area.id === selectedId) ?? null;
  const quadrantOf = (id: string | null) => quadrants.find((quadrant) => quadrant.id === id) ?? null;
  const kindLabel = (kind: VenueAreaKind) => copy.admin.map.editor.kinds[kind];

  function edit(next: VenueMap) {
    setVenue(next);
    setNotice(null);
  }

  // --- Pointer: drag to move, drag the handle to resize (units are whole plan units). ---
  function startDrag(event: PointerEvent<HTMLElement>, id: string, mode: Drag["mode"]) {
    const area = venue.areas.find((candidate) => candidate.id === id);
    if (!area || event.button !== 0) return;
    event.stopPropagation();
    setSelectedId(id);
    canvasRef.current?.setPointerCapture?.(event.pointerId);
    setDrag({ id, mode, pointerX: event.clientX, pointerY: event.clientY, ...area.rect });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag || !canvasRef.current) return;
    const box = canvasRef.current.getBoundingClientRect();
    const dx = Math.round(((event.clientX - drag.pointerX) / box.width) * venue.width);
    const dy = Math.round(((event.clientY - drag.pointerY) / box.height) * venue.height);
    setVenue((current) =>
      drag.mode === "move" ? moveAreaTo(current, drag.id, drag.x + dx, drag.y + dy) : resizeAreaTo(current, drag.id, drag.width + dx, drag.height + dy),
    );
    setNotice(null);
  }

  // --- Keyboard: arrows move, Shift + arrows resize. ---
  function onAreaKey(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    setSelectedId(id);
    edit(event.shiftKey ? resizeAreaBy(venue, id, step[0], step[1]) : moveAreaBy(venue, id, step[0], step[1]));
  }

  function add() {
    const first = quadrants.find((quadrant) => quadrant.active) ?? quadrants[0] ?? null;
    const added = addArea(venue, { label: copy.admin.map.editor.newStand, kind: "stand", quadrantId: first?.id ?? null, width: 20, height: 16 });
    edit(added.venue);
    setSelectedId(added.id);
  }

  async function submit() {
    if (problems.size > 0) {
      setShowProblems(true);
      return;
    }
    setPending(true);
    setNotice(null);
    let result;
    try {
      result = await save({ ...venue, backgroundPath: venue.background?.path ?? null });
    } catch {
      result = { ok: false as const, code: "unknown" as const };
    }
    setPending(false);
    if (!result.ok) {
      setNotice({ kind: "error", text: copy.admin.map.errors[result.code] });
      return;
    }
    const parts: string[] = [copy.admin.map.editor.saved];
    if (result.standQrs.length > 0) parts.push(interpolate(copy.admin.map.editor.newQrs, { n: String(result.standQrs.length) }));
    if (result.failedQrs.length > 0) parts.push(interpolate(copy.admin.map.editor.failedQrs, { ids: result.failedQrs.join(", ") }));
    setNotice({ kind: result.failedQrs.length > 0 ? "error" : "success", text: parts.join(" "), withLink: result.standQrs.length + result.failedQrs.length > 0 });
    setShowProblems(false);
    router.refresh();
  }

  const problemList = [...problems.entries()].flatMap(([id, list]) => {
    const label = venue.areas.find((area) => area.id === id)?.label.trim() || id;
    return list.map((problem) => ({ key: `${id}-${problem}`, id, text: interpolate(copy.admin.map.editor.problems[problem], { label }) }));
  });

  return (
    <div className="gap-space-5 flex flex-col">
      <div>
        <ButtonLink href={hrefs.back} variant="ghost" size="sm" className="-ml-space-4">
          {copy.admin.map.editor.back}
        </ButtonLink>
      </div>
      <header className="gap-space-2 flex flex-col">
        <h1 className="type-title-xl text-foreground">{copy.admin.map.editor.title}</h1>
        <p className="type-body text-muted-foreground">{copy.admin.map.editor.intro}</p>
        {isDefault ? <p className="type-body-sm text-foreground">{copy.admin.map.editor.defaultNote}</p> : null}
      </header>

      {notice ? (
        notice.kind === "success" ? (
          <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
            {notice.text}{" "}
            {notice.withLink ? (
              <Link href={hrefs.checkpoints} className="text-primary underline underline-offset-4">
                {copy.admin.map.editor.toCheckpoints}
              </Link>
            ) : null}
          </p>
        ) : (
          <InlineAlert>{notice.text}</InlineAlert>
        )
      ) : null}

      {showProblems && problemList.length > 0 ? (
        <div role="alert" className="border-danger/60 bg-danger/10 p-space-3 gap-space-2 flex flex-col rounded-md border">
          <p className="type-label text-foreground">{copy.admin.map.editor.problemsTitle}</p>
          <ul className="type-body-sm text-foreground list-disc pl-5">
            {problemList.map((problem) => (
              <li key={problem.key}>
                <button type="button" className="underline underline-offset-4" onClick={() => setSelectedId(problem.id)}>
                  {problem.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card className="gap-space-2 flex flex-col">
        <ImageField
          label={copy.admin.map.editor.background}
          purpose="venue-plan"
          value={venue.background ?? null}
          upload={upload}
          disabled={pending}
          onChange={(background) => edit({ ...venue, background })}
          onUploaded={(image) => setPlanSize(image.width && image.height ? { width: image.width, height: image.height } : null)}
        />
        <p className="type-caption text-text-subtle">{copy.admin.map.editor.backgroundHint}</p>
        {canFit && fitted ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={pending}
            onClick={() => {
              edit(resizePlan(venue, fitted.width, fitted.height));
              setPlanSize(null);
              setNotice({ kind: "success", text: interpolate(copy.admin.map.editor.fitted, { w: String(fitted.width), h: String(fitted.height) }) });
            }}
          >
            {copy.admin.map.editor.fit}
          </Button>
        ) : null}
      </Card>

      <div className="gap-space-5 flex flex-col min-[960px]:flex-row min-[960px]:items-start">
        <Card className="gap-space-3 flex w-full flex-col min-[960px]:max-w-[520px]">
          <div
            ref={canvasRef}
            role="group"
            aria-label={copy.admin.map.editor.canvasLabel}
            onPointerMove={onPointerMove}
            onPointerUp={() => setDrag(null)}
            onPointerCancel={() => setDrag(null)}
            className="bg-bg-deep border-border relative mx-auto w-full touch-none select-none overflow-hidden rounded-md border"
            style={{
              aspectRatio: `${venue.width} / ${venue.height}`,
              backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: `${percent(10, venue.width)} ${percent(10, venue.height)}`,
            }}
          >
            {venue.background ? <PlanBackground url={venue.background.url} /> : null}
            {venue.areas.map((area) => {
              const quadrant = area.kind === "stand" ? quadrantOf(area.quadrantId) : null;
              const isSelected = area.id === selectedId;
              const hasProblem = problems.has(area.id);
              return (
                <div
                  key={area.id}
                  className="absolute"
                  style={{
                    left: percent(area.rect.x, venue.width),
                    top: percent(area.rect.y, venue.height),
                    width: percent(area.rect.width, venue.width),
                    height: percent(area.rect.height, venue.height),
                    zIndex: isSelected ? 2 : 1,
                  }}
                >
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={interpolate(copy.admin.map.editor.areaPosition, {
                      label: area.label || area.id,
                      kind: kindLabel(area.kind),
                      x: String(area.rect.x),
                      y: String(area.rect.y),
                      w: String(area.rect.width),
                      h: String(area.rect.height),
                    })}
                    onPointerDown={(event) => startDrag(event, area.id, "move")}
                    onClick={() => setSelectedId(area.id)}
                    onKeyDown={(event) => onAreaKey(event, area.id)}
                    className={cn(
                      "type-caption text-foreground focus-visible:ring-ring grid size-full cursor-move place-items-center overflow-hidden rounded-sm border-2 p-0.5 text-center leading-tight focus-visible:ring-[3px] focus-visible:outline-none",
                      area.kind === "stand" ? cn("bg-surface", quadrant ? PLANET_ACCENT[quadrant.planet] : "border-line-strong") : AREA_STYLE[area.kind],
                      venue.background && ON_PLAN,
                      isSelected && "ring-primary ring-2",
                      hasProblem && "border-danger border-dashed",
                    )}
                  >
                    {quadrant ? <PixelPlanet kind={quadrant.planet} scale={2} /> : <span className="line-clamp-2">{area.label}</span>}
                  </button>
                  {isSelected ? (
                    <span
                      aria-hidden="true"
                      onPointerDown={(event) => startDrag(event, area.id, "resize")}
                      className="bg-primary border-surface absolute -right-1.5 -bottom-1.5 size-4 cursor-nwse-resize rounded-full border-2"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          <Button type="button" variant="secondary" disabled={pending || venue.areas.length >= VENUE_MAX_AREAS} onClick={add}>
            {copy.admin.map.editor.addArea}
          </Button>
        </Card>

        <div className="gap-space-4 flex min-w-0 flex-1 flex-col">
          <Card className="gap-space-4 flex flex-col">
            {selected ? (
              <>
                <h2 className="type-heading text-foreground">{copy.admin.map.editor.selected}</h2>
                <TextField
                  label={copy.admin.map.editor.label}
                  value={selected.label}
                  maxLength={40}
                  autoComplete="off"
                  disabled={pending}
                  onChange={(event) => edit(updateArea(venue, selected.id, { label: event.target.value }))}
                />
                <SelectField
                  label={copy.admin.map.editor.kind}
                  options={VENUE_AREA_KINDS.map((kind) => ({ value: kind, label: kindLabel(kind) }))}
                  value={selected.kind}
                  disabled={pending}
                  onChange={(event) => {
                    const kind = event.target.value as VenueAreaKind;
                    edit(updateArea(venue, selected.id, { kind, quadrantId: kind === "stand" ? (selected.quadrantId ?? quadrants[0]?.id ?? null) : null }));
                  }}
                />
                {selected.kind === "stand" ? (
                  <SelectField
                    label={copy.admin.map.editor.quadrant}
                    options={quadrants.map((quadrant) => ({ value: quadrant.id, label: quadrant.active ? quadrant.name : `${quadrant.name} (${copy.admin.map.inactive})` }))}
                    value={selected.quadrantId ?? ""}
                    disabled={pending}
                    onChange={(event) => edit(updateArea(venue, selected.id, { quadrantId: event.target.value }))}
                  />
                ) : null}
                <div className="gap-space-3 grid grid-cols-2">
                  <NumberField label={copy.admin.map.editor.x} value={selected.rect.x} disabled={pending} onChange={(x) => edit(moveAreaTo(venue, selected.id, x, selected.rect.y))} />
                  <NumberField label={copy.admin.map.editor.y} value={selected.rect.y} disabled={pending} onChange={(y) => edit(moveAreaTo(venue, selected.id, selected.rect.x, y))} />
                  <NumberField label={copy.admin.map.editor.areaWidth} value={selected.rect.width} disabled={pending} onChange={(w) => edit(resizeAreaTo(venue, selected.id, w, selected.rect.height))} />
                  <NumberField label={copy.admin.map.editor.areaHeight} value={selected.rect.height} disabled={pending} onChange={(h) => edit(resizeAreaTo(venue, selected.id, selected.rect.width, h))} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="self-start"
                  disabled={pending}
                  onClick={() => {
                    edit(removeArea(venue, selected.id));
                    setSelectedId(null);
                  }}
                >
                  {copy.admin.map.editor.removeArea}
                </Button>
              </>
            ) : (
              <p className="type-body text-muted-foreground">{copy.admin.map.editor.noSelection}</p>
            )}
          </Card>

          <Card className="gap-space-3 flex flex-col">
            <h2 className="type-heading text-foreground">{copy.admin.map.editor.planSize}</h2>
            <div className="gap-space-3 grid grid-cols-2">
              <NumberField
                label={copy.admin.map.editor.width}
                value={venue.width}
                disabled={pending}
                onChange={(width) => edit(resizePlan(venue, Math.min(Math.max(width, VENUE_MIN_SIZE), VENUE_MAX_SIZE), venue.height))}
              />
              <NumberField
                label={copy.admin.map.editor.height}
                value={venue.height}
                disabled={pending}
                onChange={(height) => edit(resizePlan(venue, venue.width, Math.min(Math.max(height, VENUE_MIN_SIZE), VENUE_MAX_SIZE)))}
              />
            </div>
          </Card>

          <Button type="button" size="lg" block loading={pending} onClick={() => void submit()}>
            {pending ? copy.admin.map.editor.saving : copy.admin.map.editor.save}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * A whole-number field that commits on blur or Enter, so typing "12" does not first apply "1". Out-of-range
 * values are pulled into range by the edit it calls.
 */
function NumberField({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const parsed = toInt(draft);
    setDraft(null);
    if (Number.isFinite(parsed)) onChange(parsed);
  };
  return (
    <TextField
      label={label}
      value={draft ?? String(value)}
      inputMode="numeric"
      maxLength={3}
      autoComplete="off"
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ""))}
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
