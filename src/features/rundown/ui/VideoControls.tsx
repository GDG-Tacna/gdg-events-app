"use client";

import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { ConsoleIcon } from "./ConsoleIcons";

const t = copy.stageConsole.video;

/** `m:ss` (or `h:mm:ss` past the hour) for a number of seconds. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

export interface VideoControlsProps {
  loop: boolean;
  muted: boolean;
  volume: number;
  /** Where the video is and how long it is, in seconds; `null` until the projector's window says. */
  progress: { time: number; duration: number } | null;
  onRestart: () => void;
  onToggleLoop: () => void;
  onToggleMute: () => void;
  onVolume: (volume: number) => void;
  onSeek: (seconds: number) => void;
}

const BUTTON = "focus-visible:ring-ring inline-flex h-11 items-center gap-2 rounded-full border-2 px-4 text-sm font-semibold focus-visible:ring-[3px] focus-visible:outline-none";

/**
 * The controls of the video on the air (the play and pause are the console's own transport): back to the start, repeat,
 * a bar to jump to any second, and the sound. They change the projector's window through the console; this component
 * only draws them and says what the operator did.
 */
export function VideoControls({ loop, muted, volume, progress, onRestart, onToggleLoop, onToggleMute, onVolume, onSeek }: VideoControlsProps) {
  const duration = progress?.duration ?? 0;
  const time = Math.min(progress?.time ?? 0, duration || 0);
  const silent = muted || volume === 0;
  return (
    <section aria-label={t.label} className="bg-surface border-ink gap-space-3 flex shrink-0 flex-wrap items-center rounded-lg border-2 px-3.5 py-2.5">
      <button type="button" onClick={onRestart} className={cn(BUTTON, "border-ink")}>
        <ConsoleIcon name="previous" size={18} />
        {t.restart}
      </button>
      <button type="button" onClick={onToggleLoop} aria-pressed={loop} className={cn(BUTTON, loop ? "border-ink bg-ink text-on-ink" : "border-ink")}>
        {t.loop}
      </button>

      <div className="flex min-w-[220px] flex-1 items-center gap-3">
        <input
          type="range"
          aria-label={t.position}
          aria-valuetext={duration > 0 ? interpolate(t.timeOf, { time: formatClock(time), total: formatClock(duration) }) : undefined}
          min={0}
          max={duration > 0 ? duration : 1}
          step={0.1}
          value={time}
          disabled={duration <= 0}
          onChange={(event) => onSeek(Number(event.target.value))}
          className="accent-ink h-2 min-w-0 flex-1"
        />
        <span className="type-caption text-text-subtle shrink-0 font-mono tabular-nums">{duration > 0 ? interpolate(t.timeOf, { time: formatClock(time), total: formatClock(duration) }) : "-:--"}</span>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={onToggleMute} aria-pressed={silent} className={cn(BUTTON, silent ? "border-ink bg-ink text-on-ink" : "border-ink")}>
          {silent ? t.unmute : t.mute}
        </button>
        <input type="range" aria-label={t.volume} min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(event) => onVolume(Number(event.target.value))} className="accent-ink h-2 w-24" />
      </div>
    </section>
  );
}
