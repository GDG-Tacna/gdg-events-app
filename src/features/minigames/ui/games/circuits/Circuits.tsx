"use client";

import { useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { GameHud, useFinishOnce, useGameClock, type GameProps } from "../shared";
import { CIRCUIT_CONFIG, DOWN, LEFT, RIGHT, UP, generateBoard, isSolved, powered, rotateTile, sidesOf } from "./logic";

/** The lines of a piece, from the centre to each side it connects, on a 10 × 10 grid. */
const SEGMENTS: ReadonlyArray<[number, string]> = [
  [UP, "M5 5 V0"],
  [RIGHT, "M5 5 H10"],
  [DOWN, "M5 5 V10"],
  [LEFT, "M5 5 H0"],
];

/**
 * "Conecta los circuitos": every piece is a button; a tap turns it a quarter. Pieces the energy reaches light
 * up. The board is generated with a solution and checked after every turn.
 */
export function Circuits({ difficulty, paused, onFinish, random = Math.random }: GameProps) {
  const t = copy.minigames.circuits;
  const { size, seconds } = CIRCUIT_CONFIG[difficulty];
  const finish = useFinishOnce(onFinish);
  const [board, setBoard] = useState(() => generateBoard(size, random));
  const secondsLeft = useGameClock(seconds, paused, () => finish(false));
  const lit = powered(board);

  function turn(index: number) {
    if (paused) return;
    const next = rotateTile(board, index);
    setBoard(next);
    if (isSolved(next)) finish(true);
  }

  return (
    <div className="gap-space-4 flex flex-col">
      <GameHud secondsLeft={secondsLeft} />
      <div className="gap-space-2 flex items-stretch">
        <Side label={t.source} row={board.sourceRow} size={size} />
        <div role="group" aria-label={t.boardLabel} className="bg-bg-deep border-line-strong grid flex-1 gap-0.5 rounded-md border p-0.5" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
          {board.tiles.map((tile, index) => {
            const on = lit.has(index);
            const sides = sidesOf(tile);
            const label = `${interpolate(t.tile, { row: String(Math.floor(index / size) + 1), column: String((index % size) + 1) })}${on ? `, ${t.powered}` : ""}`;
            return (
              <button
                key={index}
                type="button"
                aria-label={label}
                disabled={paused}
                onClick={() => turn(index)}
                className={cn("bg-surface focus-visible:ring-ring aspect-square min-h-11 rounded-sm focus-visible:ring-[3px] focus-visible:outline-none", on && "bg-surface-raised")}
              >
                <svg viewBox="0 0 10 10" className="h-full w-full" aria-hidden="true">
                  {SEGMENTS.filter(([side]) => sides & side).map(([side, d]) => (
                    <path key={side} d={d} strokeWidth={2.4} strokeLinecap="square" className={on ? "stroke-primary" : "stroke-line-strong"} />
                  ))}
                  <rect x={4} y={4} width={2} height={2} className={on ? "fill-primary" : "fill-line-strong"} />
                </svg>
              </button>
            );
          })}
        </div>
        <Side label={t.core} row={board.coreRow} size={size} />
      </div>
      <p className="type-caption text-text-subtle">{t.legend}</p>
    </div>
  );
}

/** The reactor on the left and the core on the right: a lit bar beside their row, aligned with the board. */
function Side({ label, row, size }: { label: string; row: number; size: number }) {
  return (
    <div className="grid w-3 gap-0.5 py-[3px]" style={{ gridTemplateRows: `repeat(${size}, minmax(0, 1fr))` }}>
      <span className="bg-accent rounded-sm" style={{ gridRow: row + 1 }} title={label}>
        <span className="sr-only">{label}</span>
      </span>
    </div>
  );
}
