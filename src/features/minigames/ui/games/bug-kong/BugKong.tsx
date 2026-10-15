"use client";

import { useCallback } from "react";
import { copy } from "@/shared/copy/es";
import { ArcadeGame } from "../arcade/ArcadeGame";
import { WORLD_WIDTH, drawSprite } from "../arcade/engine";
import { BUG_KONG, CADET, COLORS, EXCEPTION, PATCH } from "../arcade/sprites";
import type { GameProps } from "../shared";
import { EXCEPTION_SIZE, GOAL_X, KONG_CONFIG, PLAYER_HEIGHT, createKong, stepKong, type KongState } from "./simulation";

const CONTROLS = ["left", "up", "action", "down", "right"] as const;
const GIRDER = 4;

/** Draws one frame: girders, ladders, Bug Kong and the goal, the exceptions and the cadet (blinking after a hit). */
export function drawKong(context: CanvasRenderingContext2D, state: KongState, scale: number) {
  const { floorsY, ladders } = state;
  for (const ladder of ladders) {
    const top = floorsY[ladder.floor + 1];
    const bottom = floorsY[ladder.floor];
    context.fillStyle = COLORS.ladder;
    context.fillRect(ladder.x * scale, top * scale, scale, (bottom - top) * scale);
    context.fillRect((ladder.x + 7) * scale, top * scale, scale, (bottom - top) * scale);
    for (let rung = top + 4; rung < bottom; rung += 6) context.fillRect(ladder.x * scale, rung * scale, 8 * scale, scale);
  }
  for (const y of floorsY) {
    context.fillStyle = COLORS.girder;
    context.fillRect(0, y * scale, WORLD_WIDTH * scale, GIRDER * scale);
    context.fillStyle = COLORS.girderEdge;
    for (let x = 0; x < WORLD_WIDTH; x += 8) context.fillRect(x * scale, y * scale, scale, GIRDER * scale);
  }
  const topY = floorsY[floorsY.length - 1];
  drawSprite(context, BUG_KONG, 2, topY - 16, scale);
  drawSprite(context, PATCH, GOAL_X - 8, topY - 22, scale);
  for (const exception of state.exceptions) drawSprite(context, EXCEPTION, exception.x, exception.y - EXCEPTION_SIZE, scale);
  const blink = state.invulnerable > 0 && Math.floor(state.invulnerable * 10) % 2 === 0;
  if (!blink) drawSprite(context, CADET, state.player.x, state.player.y - PLAYER_HEIGHT, scale);
}

/** "Bug Kong" on the arcade frame: walk, climb and jump; the jump button is pressed, not held. */
export function BugKong({ difficulty, paused, onFinish, random = Math.random }: GameProps) {
  const create = useCallback(() => createKong(difficulty), [difficulty]);
  const step = useCallback((state: KongState, input: Parameters<typeof stepKong>[1], dt: number) => stepKong(state, input, dt, random), [random]);
  return (
    <ArcadeGame
      create={create}
      step={step}
      draw={drawKong}
      seconds={KONG_CONFIG[difficulty].seconds}
      controls={CONTROLS}
      label={copy.minigames.kong.label}
      paused={paused}
      onFinish={onFinish}
    />
  );
}
