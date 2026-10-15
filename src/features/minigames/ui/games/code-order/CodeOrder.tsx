"use client";

import { useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { GameHud, useFinishOnce, useGameClock, type GameProps } from "../shared";
import { CODE_ORDER_CONFIG, ROUNDS, allowedNext, flatLines, pickSnippets, shuffleLines } from "./logic";

/**
 * "Ordena el código": the shuffled lines are buttons; tapping the right next one moves it into the program,
 * a wrong one shakes and counts as a mistake. Three snippets win. Nothing is typed.
 */
export function CodeOrder({ difficulty, codeLanguages, paused, onFinish, random = Math.random }: GameProps) {
  const t = copy.minigames.code;
  const config = CODE_ORDER_CONFIG[difficulty];
  const finish = useFinishOnce(onFinish);
  const [snippets] = useState(() => pickSnippets(difficulty, codeLanguages, random));
  const [round, setRound] = useState(0);
  const [pool, setPool] = useState(() => (snippets[0] ? shuffleLines(snippets[0], random) : []));
  const [placed, setPlaced] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [wrong, setWrong] = useState<string | null>(null);
  const secondsLeft = useGameClock(config.seconds, paused, () => finish(false));
  const snippet = snippets[round];

  function tap(line: string) {
    if (paused || !snippet) return;
    if (!allowedNext(snippet, placed).has(line)) {
      const next = mistakes + 1;
      setMistakes(next);
      setWrong(line);
      if (next > config.mistakes) finish(false);
      return;
    }
    setWrong(null);
    const nextPlaced = [...placed, line];
    if (nextPlaced.length < flatLines(snippet).length) {
      setPlaced(nextPlaced);
      setPool(pool.filter((candidate) => candidate !== line));
      return;
    }
    if (round + 1 >= ROUNDS) {
      setPlaced(nextPlaced);
      setPool([]);
      finish(true);
      return;
    }
    setRound(round + 1);
    setPlaced([]);
    setPool(shuffleLines(snippets[round + 1], random));
  }

  if (!snippet) return null;

  return (
    <div className="gap-space-4 flex flex-col">
      <GameHud secondsLeft={secondsLeft} counter={{ label: copy.minigames.hud.mistakes, value: `${mistakes}/${config.mistakes}` }} />
      <div className="gap-space-1 flex flex-col">
        <p className="type-caption text-text-subtle">{interpolate(t.round, { n: String(round + 1), total: String(ROUNDS) })}</p>
        <h2 className="type-heading text-foreground">{snippet.title}</h2>
      </div>

      <section aria-label={t.program} className="bg-bg-deep border-line-strong p-space-3 min-h-24 rounded-md border">
        <ol className="gap-1 flex flex-col">
          {placed.map((line) => (
            <li key={line} className="text-accent font-mono text-[13px] leading-snug whitespace-pre-wrap">
              {line}
            </li>
          ))}
        </ol>
      </section>

      <section aria-label={t.lines} className="gap-space-2 flex flex-col">
        <p aria-live="polite" className="type-caption text-danger min-h-5">
          {wrong ? t.wrong : ""}
        </p>
        {pool.map((line) => (
          <button
            key={line}
            type="button"
            disabled={paused}
            onClick={() => tap(line)}
            className={cn(
              "bg-surface border-line-strong text-foreground focus-visible:ring-ring min-h-12 rounded-md border px-3 py-2 text-left font-mono text-[13px] leading-snug whitespace-pre-wrap focus-visible:ring-[3px] focus-visible:outline-none",
              wrong === line && "border-danger animate-shake",
            )}
          >
            {line}
          </button>
        ))}
      </section>
    </div>
  );
}
