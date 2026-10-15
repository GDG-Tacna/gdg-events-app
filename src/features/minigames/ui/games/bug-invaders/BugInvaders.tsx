"use client";

import { useCallback } from "react";
import { copy } from "@/shared/copy/es";
import { ArcadeGame } from "../arcade/ArcadeGame";
import { WORLD_WIDTH, drawSprite } from "../arcade/engine";
import { BUG, COLORS, ERROR, SHIP, SHOT } from "../arcade/sprites";
import type { GameProps } from "../shared";
import { DEFENSE_LINE, INVADERS_CONFIG, SHIP_Y, createInvaders, stepInvaders, type InvadersState } from "./simulation";

const CONTROLS = ["left", "right"] as const;

/** Draws one frame: the defense line, the swarm (legs moving), the shots, the errors and the ship (blinking after a hit). */
export function drawInvaders(context: CanvasRenderingContext2D, state: InvadersState, scale: number) {
  context.fillStyle = COLORS.line;
  context.fillRect(0, DEFENSE_LINE * scale, WORLD_WIDTH * scale, scale);
  const legs = Math.floor(state.time * 3) % 2;
  for (const bug of state.bugs) drawSprite(context, BUG[legs], bug.x, bug.y, scale);
  for (const shot of state.shots) drawSprite(context, SHOT, shot.x, shot.y, scale);
  for (const error of state.errors) drawSprite(context, ERROR, error.x, error.y, scale);
  const blink = state.invulnerable > 0 && Math.floor(state.invulnerable * 10) % 2 === 0;
  if (!blink) drawSprite(context, SHIP, state.shipX, SHIP_Y, scale);
}

/** "Invasores de bugs" on the arcade frame: left and right only, the ship fires on its own. */
export function BugInvaders({ difficulty, paused, onFinish, random = Math.random }: GameProps) {
  const create = useCallback(() => createInvaders(difficulty), [difficulty]);
  const step = useCallback((state: InvadersState, input: Parameters<typeof stepInvaders>[1], dt: number) => stepInvaders(state, input, dt, random), [random]);
  return (
    <ArcadeGame
      create={create}
      step={step}
      draw={drawInvaders}
      seconds={INVADERS_CONFIG[difficulty].seconds}
      controls={CONTROLS}
      label={copy.minigames.invaders.label}
      paused={paused}
      onFinish={onFinish}
    />
  );
}
