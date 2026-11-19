"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { MediaLibrary } from "../data/client/media-library";
import type { Track } from "../domain/music";

/** How often the volume moves while it fades, in milliseconds. */
const FADE_STEP_MS = 50;

/** What the console wants the music to be doing right now. */
export interface MusicWanted {
  track: Track | null;
  /** Whether it sounds. */
  playing: boolean;
  /** From 0 to 1. */
  volume: number;
  /** The time to fade into this change, in milliseconds (0: at once). */
  fadeMs: number;
  /** The song's file when the console already holds it (a browser that cannot remember the folder). */
  file?: File | null;
}

/** What the console can do to the player. */
export interface MusicPlayerHandle {
  apply(wanted: MusicWanted): void;
  seek(seconds: number): void;
  /** Tries again what was last asked (after the browser would not play, once the person has clicked). */
  retry(): void;
}

/** Moves the volume of an element to a level over some time, in small steps; answers when it got there or was replaced. */
function ramp(element: HTMLAudioElement, target: number, ms: number, isCurrent: () => boolean): Promise<void> {
  const from = element.volume;
  if (ms <= 0 || from === target) {
    setVolumeOf(element, target);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (!isCurrent()) {
        clearInterval(timer);
        return resolve();
      }
      const progress = Math.min(1, (Date.now() - started) / ms);
      setVolumeOf(element, from + (target - from) * progress);
      if (progress >= 1) {
        clearInterval(timer);
        resolve();
      }
    }, FADE_STEP_MS);
  });
}

/** The properties of the element are set from helpers, outside the component. */
function setVolumeOf(element: HTMLAudioElement, volume: number) {
  element.volume = Math.min(1, Math.max(0, volume));
}
function load(element: HTMLAudioElement, address: string) {
  element.src = address;
  element.currentTime = 0;
}
function jump(element: HTMLAudioElement | null, seconds: number) {
  if (element) element.currentTime = seconds;
}

export interface MusicPlayerProps {
  handleRef: Ref<MusicPlayerHandle>;
  library: MediaLibrary | null;
  /** Changes when the library's state does, so a granted permission reads the song again. */
  revision?: number;
  /** Where the song is and how long it is, a few times a second while it plays. */
  onProgress: (trackId: string, time: number, duration: number) => void;
  /** The song reached its end, or could not be played (a missing file). */
  onEnded: (trackId: string) => void;
  /** The browser will not play sound yet (`true`), or now can (`false`). */
  onBlocked: (blocked: boolean) => void;
}

/**
 * The sound of the music: one audio element in the console's own window, so the browser lets it play with the clicks
 * the operator already makes there. It plays the one song it is told to, fading the volume in and out as asked. It owns no
 * playlist and draws nothing: the console picks every song and shows the controls.
 */
export function MusicPlayer({ handleRef, library, revision = 0, onProgress, onEnded, onBlocked }: MusicPlayerProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const loaded = useRef<string | null>(null);
  const url = useRef<string | null>(null);
  const generation = useRef(0);
  const last = useRef<MusicWanted | null>(null);
  // The latest callbacks and library, read when an instruction runs, not when it was given.
  const live = useRef({ library, revision, onProgress, onEnded, onBlocked });
  useEffect(() => {
    live.current = { library, revision, onProgress, onEnded, onBlocked };
  });

  const apply = useCallback((wanted: MusicWanted) => {
    const element = audio.current;
    if (!element) return;
    last.current = wanted;
    const mine = ++generation.current;
    const current = () => generation.current === mine;
    void (async () => {
      if (!wanted.track) {
        await ramp(element, 0, wanted.fadeMs, current);
        if (current()) {
          element.pause();
          loaded.current = null;
        }
        return;
      }
      if (loaded.current !== wanted.track.id) {
        if (!element.paused) await ramp(element, 0, wanted.fadeMs, current);
        if (!current()) return;
        const found = wanted.file ? { ok: true as const, value: wanted.file } : live.current.library ? await live.current.library.resolve(wanted.track.path) : null;
        if (!current()) return;
        if (!found || !found.ok) {
          // The file is not there: the console is told, so it moves on instead of staying silent.
          live.current.onEnded(wanted.track.id);
          return;
        }
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(found.value);
        load(element, url.current);
        loaded.current = wanted.track.id;
      }
      if (wanted.playing) {
        if (element.paused) setVolumeOf(element, 0);
        try {
          await element.play();
        } catch {
          // A browser may ask for one click on the page before it lets it make sound.
          if (current()) live.current.onBlocked(true);
          return;
        }
        if (current()) live.current.onBlocked(false);
        await ramp(element, wanted.volume, wanted.fadeMs, current);
      } else {
        await ramp(element, 0, wanted.fadeMs, current);
        if (current()) element.pause();
      }
    })();
  }, []);

  useImperativeHandle(
    handleRef,
    () => ({
      apply,
      seek: (seconds) => jump(audio.current, seconds),
      retry: () => {
        if (last.current) apply({ ...last.current, fadeMs: 0 });
      },
    }),
    [apply],
  );

  return (
    <audio
      ref={audio}
      preload="auto"
      onTimeUpdate={(event) => {
        const element = event.currentTarget;
        if (loaded.current && Number.isFinite(element.duration)) live.current.onProgress(loaded.current, element.currentTime, element.duration);
      }}
      onEnded={() => {
        if (loaded.current) live.current.onEnded(loaded.current);
      }}
      onError={() => {
        if (loaded.current) live.current.onEnded(loaded.current);
      }}
    />
  );
}
