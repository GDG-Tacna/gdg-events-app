"use client";

import { useEffect, useRef, useState } from "react";
import { copy } from "@/shared/copy/es";
import { Icon, type IconName } from "@/shared/ui";
import { GameHud, useFinishOnce } from "../shared";
import { COLORS } from "./sprites";
import { MAX_STEP_SECONDS, NO_INPUT, WORLD_HEIGHT, WORLD_WIDTH, type ArcadeInput, type ArcadeStatus } from "./engine";

export type Control = "left" | "right" | "up" | "down" | "action";

export interface ArcadeGameProps<S extends { status: ArcadeStatus; time: number; lives: number }> {
  create: () => S;
  step: (state: S, input: ArcadeInput, dt: number) => S;
  draw: (context: CanvasRenderingContext2D, state: S, scale: number) => void;
  /** The game's time limit, for the HUD. */
  seconds: number;
  /** The buttons this game needs, left to right. */
  controls: readonly Control[];
  /** What the canvas shows, for screen readers. */
  label: string;
  paused: boolean;
  onFinish: (won: boolean) => void;
  /** Milliseconds now and the frame scheduler, replaceable in tests. */
  now?: () => number;
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (id: number) => void;
}

/** Canvas pixels per world pixel: 2 keeps the art crisp and fits a 360 px phone. */
const SCALE = 2;
const KEYS: Readonly<Record<string, Control>> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", " ": "action", Spacebar: "action" };
const ICONS: Readonly<Record<Control, IconName>> = { left: "left", right: "right", up: "up", down: "down", action: "jump" };
const performanceNow = () => performance.now();
const animationFrame = (callback: () => void) => requestAnimationFrame(callback);
const cancelAnimation = (id: number) => cancelAnimationFrame(id);

/**
 * Runs an action game: the simulation steps on every frame with what the controls hold, the canvas draws it, and
 * the game reports won or lost once. Large on-screen buttons (held down) and the keyboard both drive it; a pause
 * stops the loop, and a long frame is cut short so the world never jumps ahead.
 */
export function ArcadeGame<S extends { status: ArcadeStatus; time: number; lives: number }>({
  create,
  step,
  draw,
  seconds,
  controls,
  label,
  paused,
  onFinish,
  now = performanceNow,
  requestFrame = animationFrame,
  cancelFrame = cancelAnimation,
}: ArcadeGameProps<S>) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef<S | null>(null);
  const input = useRef<ArcadeInput>({ ...NO_INPUT });
  const finish = useFinishOnce(onFinish);
  const [hud, setHud] = useState({ secondsLeft: seconds, lives: 0 });

  useEffect(() => {
    if (state.current === null) {
      state.current = create();
      setHud({ secondsLeft: seconds, lives: state.current.lives });
    }
  }, [create, seconds]);

  useEffect(() => {
    if (paused) return;
    let last = now();
    let frame = requestFrame(function tick() {
      const current = state.current;
      if (!current) return;
      const at = now();
      const dt = Math.min((at - last) / 1000, MAX_STEP_SECONDS);
      last = at;
      const next = step(current, input.current, dt);
      // A jump is pressed, not held: it is used once.
      input.current = { ...input.current, action: false };
      state.current = next;
      const context = canvas.current?.getContext("2d");
      if (context) {
        context.imageSmoothingEnabled = false;
        context.fillStyle = COLORS.background;
        context.fillRect(0, 0, WORLD_WIDTH * SCALE, WORLD_HEIGHT * SCALE);
        draw(context, next, SCALE);
      }
      setHud((old) => {
        const secondsLeft = Math.max(0, Math.ceil(seconds - next.time));
        return old.secondsLeft === secondsLeft && old.lives === next.lives ? old : { secondsLeft, lives: next.lives };
      });
      if (next.status !== "playing") {
        finish(next.status === "won");
        return;
      }
      frame = requestFrame(tick);
    });
    return () => cancelFrame(frame);
  }, [paused, step, draw, seconds, now, requestFrame, cancelFrame, finish]);

  // The keyboard drives the same input as the buttons.
  useEffect(() => {
    const press = (down: boolean) => (event: KeyboardEvent) => {
      const control = KEYS[event.key];
      if (!control) return;
      event.preventDefault();
      if (control === "action") {
        if (down) input.current = { ...input.current, action: true };
      } else input.current = { ...input.current, [control]: down };
    };
    const onDown = press(true);
    const onUp = press(false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  const hold = (control: Control, down: boolean) => {
    input.current = control === "action" ? { ...input.current, action: down || input.current.action } : { ...input.current, [control]: down };
  };

  return (
    <div className="gap-space-3 flex flex-col">
      <GameHud secondsLeft={hud.secondsLeft} counter={{ label: copy.minigames.hud.lives, value: String(hud.lives) }} />
      <canvas
        ref={canvas}
        width={WORLD_WIDTH * SCALE}
        height={WORLD_HEIGHT * SCALE}
        role="img"
        aria-label={label}
        className="border-line-strong mx-auto w-full max-w-[320px] rounded-md border [image-rendering:pixelated]"
      />
      <div className="gap-space-2 flex justify-between">
        {controls.map((control) => (
          <button
            key={control}
            type="button"
            aria-label={copy.minigames.controls[control]}
            disabled={paused}
            onPointerDown={(event) => {
              event.preventDefault();
              hold(control, true);
            }}
            onPointerUp={() => hold(control, false)}
            onPointerLeave={() => hold(control, false)}
            onPointerCancel={() => hold(control, false)}
            onContextMenu={(event) => event.preventDefault()}
            className="bg-surface-raised border-line-strong text-foreground focus-visible:ring-ring active:bg-primary active:text-primary-foreground grid h-14 flex-1 touch-none place-items-center rounded-md border select-none focus-visible:ring-[3px] focus-visible:outline-none"
          >
            <Icon name={ICONS[control]} size={28} />
          </button>
        ))}
      </div>
    </div>
  );
}
