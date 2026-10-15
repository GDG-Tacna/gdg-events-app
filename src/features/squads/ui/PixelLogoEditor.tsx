"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import type { PixelSpriteData } from "@/shared/types/pixel";
import { Button, PixelSprite } from "@/shared/ui";
import { LOGO_MAX_COLORS, LOGO_SIZE } from "../domain/squad-rules";

export interface PixelLogoEditorProps {
  value: PixelSpriteData;
  onChange: (next: PixelSpriteData) => void;
  disabled?: boolean;
}

/** Palette keys, in the order colors are added. */
const KEYS = "abcdefgh".slice(0, LOGO_MAX_COLORS).split("");
/** Colors offered first when adding one: the Design System accents, then light and dark. */
const PRESETS = ["#22d3ee", "#a3e635", "#8b5cf6", "#f472b6", "#fbbf24", "#fb7185", "#f4f6ff", "#050816"];
const ERASER = ".";

export const blankLogo = (): PixelSpriteData => ({
  rows: Array.from({ length: LOGO_SIZE }, () => ".".repeat(LOGO_SIZE)),
  palette: { a: PRESETS[0] },
});

/**
 * A 16x16 pixel editor for squad logos. Paint with a click, by dragging, or with a finger; from the
 * keyboard the arrows move a cursor over the grid and Space paints. Up to 8 colors, each editable, plus an
 * eraser. The preview shows the logo at the sizes the app uses. It only edits data: saving and checking
 * happen on the server.
 */
export function PixelLogoEditor({ value, onChange, disabled = false }: PixelLogoEditorProps) {
  const paletteKeys = Object.keys(value.palette);
  const [tool, setTool] = useState<string>(paletteKeys[0] ?? ERASER);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const drawing = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  function paint(x: number, y: number) {
    if (disabled || x < 0 || y < 0 || x >= LOGO_SIZE || y >= LOGO_SIZE) return;
    const row = value.rows[y];
    if (row[x] === tool) return;
    const rows = value.rows.map((current, index) => (index === y ? `${current.slice(0, x)}${tool}${current.slice(x + 1)}` : current));
    onChange({ rows, palette: value.palette });
  }

  /** The cell under a pointer, from its position over the grid (touch moves never enter other cells). */
  function cellAt(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.floor(((event.clientX - rect.left) / rect.width) * LOGO_SIZE),
      y: Math.floor(((event.clientY - rect.top) / rect.height) * LOGO_SIZE),
    };
  }

  function moveCursor(x: number, y: number) {
    const next = { x: Math.max(0, Math.min(LOGO_SIZE - 1, x)), y: Math.max(0, Math.min(LOGO_SIZE - 1, y)) };
    setCursor(next);
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${next.x}-${next.y}"]`)?.focus();
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      moveCursor(cursor.x + move[0], cursor.y + move[1]);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      paint(cursor.x, cursor.y);
    }
  }

  function setColor(key: string, color: string) {
    onChange({ rows: value.rows, palette: { ...value.palette, [key]: color } });
  }

  function addColor() {
    const key = KEYS.find((candidate) => !(candidate in value.palette));
    if (!key) return;
    const used = new Set(Object.values(value.palette));
    const color = PRESETS.find((preset) => !used.has(preset)) ?? "#ffffff";
    onChange({ rows: value.rows, palette: { ...value.palette, [key]: color } });
    setTool(key);
  }

  /** Colors are numbered by their place in the palette, whatever letters a logo uses (the original logos use their own). */
  const numberOf = (key: string) => String(paletteKeys.indexOf(key) + 1);
  const stateOf = (cell: string) => (cell === ERASER ? copy.admin.squads.editor.empty : interpolate(copy.admin.squads.editor.colorLabel, { n: numberOf(cell) }));

  return (
    <div className="gap-space-5 flex flex-col min-[760px]:flex-row min-[760px]:items-start">
      <div className="gap-space-2 flex w-full max-w-[352px] flex-col">
        <div
          ref={gridRef}
          role="grid"
          aria-label={copy.admin.squads.editor.gridLabel}
          aria-describedby="pixel-editor-help"
          aria-disabled={disabled || undefined}
          className={cn("border-line-strong bg-bg-deep grid aspect-square w-full touch-none select-none rounded-md border", disabled && "opacity-60")}
          style={{ gridTemplateColumns: `repeat(${LOGO_SIZE}, 1fr)`, backgroundImage: "linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.04) 75%)", backgroundSize: `${200 / LOGO_SIZE}% ${200 / LOGO_SIZE}%` }}
          onPointerDown={(event) => {
            if (disabled) return;
            drawing.current = true;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            const { x, y } = cellAt(event);
            setCursor({ x, y });
            paint(x, y);
          }}
          onPointerMove={(event) => {
            if (!drawing.current) return;
            const { x, y } = cellAt(event);
            paint(x, y);
          }}
          onPointerUp={() => {
            drawing.current = false;
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
          onKeyDown={handleKey}
        >
          {value.rows.map((row, y) => (
            <div key={y} role="row" className="contents">
              {row.split("").map((cell, x) => (
                <div
                  key={x}
                  role="gridcell"
                  data-cell={`${x}-${y}`}
                  tabIndex={cursor.x === x && cursor.y === y ? 0 : -1}
                  aria-label={interpolate(copy.admin.squads.editor.cellLabel, { row: String(y + 1), column: String(x + 1), state: stateOf(cell) })}
                  onFocus={() => setCursor({ x, y })}
                  className="focus-visible:outline-primary aspect-square focus-visible:outline-2 focus-visible:-outline-offset-2"
                  style={{ background: cell === ERASER ? "transparent" : value.palette[cell] }}
                />
              ))}
            </div>
          ))}
        </div>
        <p id="pixel-editor-help" className="type-caption text-text-subtle">
          {copy.admin.squads.editor.help}
        </p>
      </div>

      <div className="gap-space-4 flex flex-col">
        <fieldset className="gap-space-2 flex flex-col" disabled={disabled}>
          <legend className="type-label text-foreground mb-space-2">{copy.admin.squads.editor.paletteLegend}</legend>
          <div className="gap-space-2 flex flex-wrap" role="radiogroup" aria-label={copy.admin.squads.editor.paletteLegend}>
            {paletteKeys.map((key) => {
              const label = interpolate(copy.admin.squads.editor.colorLabel, { n: numberOf(key) });
              return (
                <div key={key} className="gap-space-1 flex flex-col items-center">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={tool === key}
                    aria-label={label}
                    onClick={() => setTool(key)}
                    className={cn(
                      "focus-visible:ring-ring size-12 rounded-md border-2 focus-visible:ring-[3px] focus-visible:outline-none",
                      tool === key ? "border-primary" : "border-line-strong",
                    )}
                    style={{ background: value.palette[key] }}
                  />
                  <input
                    type="color"
                    aria-label={interpolate(copy.admin.squads.editor.editColor, { n: numberOf(key) })}
                    value={value.palette[key]}
                    onChange={(event) => setColor(key, event.target.value)}
                    className="h-6 w-12 cursor-pointer bg-transparent"
                  />
                </div>
              );
            })}
            <button
              type="button"
              role="radio"
              aria-checked={tool === ERASER}
              onClick={() => setTool(ERASER)}
              className={cn(
                "type-caption text-foreground bg-bg-deep focus-visible:ring-ring px-space-2 h-12 rounded-md border-2 focus-visible:ring-[3px] focus-visible:outline-none",
                tool === ERASER ? "border-primary" : "border-line-strong",
              )}
            >
              {copy.admin.squads.editor.eraser}
            </button>
          </div>
        </fieldset>

        <div className="gap-space-2 flex flex-wrap">
          <Button type="button" variant="secondary" size="sm" disabled={disabled || paletteKeys.length >= LOGO_MAX_COLORS} onClick={addColor}>
            {copy.admin.squads.editor.addColor}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange({ rows: blankLogo().rows, palette: value.palette })}>
            {copy.admin.squads.editor.clear}
          </Button>
        </div>

        <div className="gap-space-2 flex flex-col">
          <p className="type-label text-foreground">{copy.admin.squads.editor.preview}</p>
          <div className="gap-space-4 flex items-end">
            <PixelSprite rows={value.rows} palette={value.palette} scale={4} />
            <PixelSprite rows={value.rows} palette={value.palette} scale={2} />
            <PixelSprite rows={value.rows} palette={value.palette} scale={1} />
          </div>
        </div>
      </div>
    </div>
  );
}
