"use client";

import { Suspense, useState, type ComponentType } from "react";
import { copy } from "@/shared/copy/es";
import { Button, InlineAlert, Skeleton } from "@/shared/ui";
import type { CodeLanguage, Difficulty, MinigameId } from "../domain/catalog";
import { GAMES } from "./games/registry";
import type { GameProps } from "./games/shared";

export interface MinigamePreviewProps {
  gameId: MinigameId;
  difficulty: Difficulty;
  codeLanguages: readonly CodeLanguage[];
  /** The games, replaceable in tests. */
  games?: Partial<Record<MinigameId, ComponentType<GameProps>>>;
}

/**
 * A game played by the admin to try it, as the cadets would with the chosen difficulty. It never talks to the
 * server: no ticket, no result, no XP. Closing the dialog unmounts it, which stops the game.
 */
export function MinigamePreview({ gameId, difficulty, codeLanguages, games = GAMES }: MinigamePreviewProps) {
  const t = copy.admin.minigames.preview;
  const [round, setRound] = useState(0);
  const [won, setWon] = useState<boolean | null>(null);
  const Game = games[gameId];

  if (!Game) return <InlineAlert>{copy.minigames.errors["not-available"]}</InlineAlert>;

  return (
    <div className="gap-space-4 flex flex-col">
      <p className="type-caption text-text-subtle">{t.note}</p>
      {won === null ? (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <Game key={round} difficulty={difficulty} codeLanguages={codeLanguages} paused={false} onFinish={setWon} />
        </Suspense>
      ) : (
        <div className="gap-space-4 py-space-4 flex flex-col items-center text-center">
          <p role="status" className={won ? "type-pixel-callout text-accent" : "type-title text-foreground"}>
            {won ? t.won : t.lost}
          </p>
          <Button
            autoFocus
            onClick={() => {
              setWon(null);
              setRound((current) => current + 1);
            }}
          >
            {t.again}
          </Button>
        </div>
      )}
    </div>
  );
}
