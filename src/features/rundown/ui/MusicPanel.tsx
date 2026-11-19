"use client";

import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Icon } from "@/shared/ui";
import { FADE_MAX_SECONDS, type MusicState, type Track } from "../domain/music";
import { ConsoleIcon } from "./ConsoleIcons";
import { formatClock } from "./VideoControls";

const t = copy.stageConsole.music;

const BUTTON = "focus-visible:ring-ring inline-flex h-11 items-center gap-2 rounded-full border-2 px-4 text-sm font-semibold focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-50";
const FADES = [0, 1, 2, 3, 5, FADE_MAX_SECONDS];

export interface MusicPanelProps {
  tracks: readonly Track[];
  music: MusicState;
  /** Where the song is and how long it is, as the projector's window last said. */
  progress: { trackId: string; time: number; duration: number } | null;
  /** The browser is holding the sound back until the projector's window is clicked. */
  blocked: boolean;
  /** A video is playing and the music is fading out of its way. */
  ducked: boolean;
  editing: boolean;
  onToggleEditing: () => void;
  onAdd: () => void;
  onPlay: (trackId: string) => void;
  onTogglePlayback: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onStop: () => void;
  onSeek: (seconds: number) => void;
  onVolume: (volume: number) => void;
  onRepeat: () => void;
  onFade: (seconds: number) => void;
  onDuck: () => void;
  onMove: (trackId: string, delta: -1 | 1) => void;
  onRemove: (trackId: string) => void;
}

/**
 * The music of the event: a playlist from the connected folder with its own controls (play, previous, next, stop, a bar
 * to jump around, volume, repeat and the fade). The sound comes out of the projector's window; this only shows and asks.
 */
export function MusicPanel({ tracks, music, progress, blocked, ducked, editing, onToggleEditing, onAdd, onPlay, onTogglePlayback, onPrevious, onNext, onStop, onSeek, onVolume, onRepeat, onFade, onDuck, onMove, onRemove }: MusicPanelProps) {
  const loaded = tracks.find((track) => track.id === music.trackId) ?? null;
  const here = progress && progress.trackId === music.trackId ? progress : null;
  const duration = here?.duration ?? 0;
  const time = Math.min(here?.time ?? 0, duration);
  const status = !loaded ? t.idle : blocked ? t.blocked : ducked ? t.ducked : music.playing ? t.playing : t.paused;
  return (
    <section aria-label={t.title} className="bg-surface border-ink gap-space-3 flex shrink-0 flex-col rounded-lg border-2 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="type-pixel-heading text-text-subtle">{t.title}</h2>
        <p className="type-caption text-text-subtle">{interpolate(t.count, { n: String(tracks.length) })}</p>
        <div className="flex-1" />
        {tracks.length > 0 ? (
          <button type="button" onClick={onToggleEditing} aria-pressed={editing} className={cn(BUTTON, "h-9 px-3", editing ? "border-ink bg-ink text-on-ink" : "border-line-strong")}>
            {editing ? t.editDone : t.edit}
          </button>
        ) : null}
        <button type="button" onClick={onAdd} className={cn(BUTTON, "border-ink h-9 px-3")}>
          {t.add}
        </button>
      </div>

      {tracks.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <>
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="bg-surface-raised text-cyan-ink grid size-10 shrink-0 place-items-center rounded-md">
              <Icon name="music" size={20} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="type-label text-foreground truncate">{loaded ? loaded.name : t.nothing}</span>
              <span className={cn("type-caption", blocked ? "text-danger-ink font-bold" : "text-text-subtle")} role={blocked ? "alert" : undefined}>
                {status}
              </span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.controls}>
            <button type="button" onClick={onPrevious} aria-label={t.previous} className={cn(BUTTON, "border-ink px-3")}>
              <ConsoleIcon name="previous" size={18} />
            </button>
            <button type="button" onClick={onTogglePlayback} className={cn(BUTTON, "border-ink bg-ink text-on-ink")}>
              {music.playing ? <ConsoleIcon name="pause" size={18} /> : <Icon name="play" size={18} />}
              {music.playing ? t.pause : t.play}
            </button>
            <button type="button" onClick={onNext} aria-label={t.next} className={cn(BUTTON, "border-ink px-3")}>
              <ConsoleIcon name="next" size={18} />
            </button>
            <button type="button" onClick={onStop} className={cn(BUTTON, "border-line-strong")}>
              <ConsoleIcon name="stop" size={16} />
              {t.stop}
            </button>
            <button type="button" onClick={onRepeat} className={cn(BUTTON, "border-ink", music.repeat !== "off" && "bg-ink text-on-ink")}>
              {t.repeat[music.repeat]}
            </button>
          </div>

          <div className="flex min-w-0 items-center gap-3">
            <input
              type="range"
              aria-label={t.position}
              min={0}
              max={duration > 0 ? duration : 1}
              step={0.5}
              value={time}
              disabled={duration <= 0}
              onChange={(event) => onSeek(Number(event.target.value))}
              className="accent-ink h-2 min-w-0 flex-1"
            />
            <span className="type-caption text-text-subtle shrink-0 font-mono tabular-nums">{duration > 0 ? interpolate(t.timeOf, { time: formatClock(time), total: formatClock(duration) }) : "-:--"}</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold">
              {t.volume}
              <input type="range" aria-label={t.volume} min={0} max={1} step={0.05} value={music.volume} onChange={(event) => onVolume(Number(event.target.value))} className="accent-ink h-2 w-28" />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              {t.fade}
              <select aria-label={t.fade} value={music.fadeSeconds} onChange={(event) => onFade(Number(event.target.value))} className="border-line-strong bg-surface text-foreground h-9 rounded-md border-2 px-2 text-sm">
                {FADES.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds === 0 ? t.noFade : interpolate(t.fadeSeconds, { n: String(seconds) })}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={music.duck} onChange={onDuck} className="accent-ink size-5" />
              {t.duck}
            </label>
          </div>

          <ul aria-label={t.list} className="gap-space-2 flex max-h-56 min-h-0 flex-col overflow-y-auto">
            {tracks.map((track, index) => {
              const isLoaded = track.id === music.trackId;
              return (
                <li key={track.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onPlay(track.id)}
                    aria-label={interpolate(t.playTrack, { name: track.name })}
                    aria-current={isLoaded ? "true" : undefined}
                    className={cn("focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-3 rounded-md border-2 px-2.5 py-2 text-left focus-visible:ring-[3px] focus-visible:outline-none", isLoaded ? "border-lime bg-background" : "border-line-strong")}
                  >
                    <span className="text-text-subtle w-6 shrink-0 text-center font-mono text-xs">{index + 1}</span>
                    <span className="type-label text-foreground min-w-0 flex-1 truncate">{track.name}</span>
                    {isLoaded && music.playing ? <span className="bg-lime text-on-accent inline-flex h-5 items-center rounded-full px-2 text-[10.5px] font-bold">{t.onAir}</span> : null}
                  </button>
                  {editing ? (
                    <>
                      <button type="button" aria-label={`${t.moveUp}: ${track.name}`} disabled={index === 0} onClick={() => onMove(track.id, -1)} className="border-line-strong text-foreground hover:bg-secondary focus-visible:ring-ring grid size-9 place-items-center rounded-md border-2 disabled:opacity-40">
                        <Icon name="up" size={14} />
                      </button>
                      <button type="button" aria-label={`${t.moveDown}: ${track.name}`} disabled={index >= tracks.length - 1} onClick={() => onMove(track.id, 1)} className="border-line-strong text-foreground hover:bg-secondary focus-visible:ring-ring grid size-9 place-items-center rounded-md border-2 disabled:opacity-40">
                        <Icon name="down" size={14} />
                      </button>
                      <button type="button" aria-label={`${t.remove}: ${track.name}`} onClick={() => onRemove(track.id)} className="border-danger-ink text-danger-ink hover:bg-secondary focus-visible:ring-ring grid size-9 place-items-center rounded-md border-2">
                        <Icon name="close" size={16} />
                      </button>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
