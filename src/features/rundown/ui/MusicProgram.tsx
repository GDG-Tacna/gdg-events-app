"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { copy } from "@/shared/copy/es";
import type { MediaLibrary } from "../data/client/media-library";
import { openStageChannel, type StageChannel } from "../data/client/stage-channel";
import type { Track } from "../domain/music";
import { ALIVE_EVERY_MS } from "./MediaProgram";
import { useMediaLibrary } from "./use-library";

/** How often the volume moves while it fades, in milliseconds. */
const FADE_STEP_MS = 50;

/** What the console last asked the music to do. */
interface Wanted {
  track: Track | null;
  playing: boolean;
  volume: number;
  fadeMs: number;
  file: File | null;
}

/** Moves the volume of an element to a level over some time, in small steps; answers when it got there or was replaced. */
function ramp(element: HTMLAudioElement, target: number, ms: number, isCurrent: () => boolean): Promise<void> {
  const from = element.volume;
  if (ms <= 0 || from === target) {
    element.volume = target;
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
      element.volume = from + (target - from) * progress;
      if (progress >= 1) {
        clearInterval(timer);
        resolve();
      }
    }, FADE_STEP_MS);
  });
}

export interface MusicProgramProps {
  /** A small copy inside the console: it never plays, so the sound comes from one window only. */
  preview?: boolean;
  /** For tests: a library and a way to open the channel instead of the browser's own. */
  library?: MediaLibrary;
  openChannel?: () => StageChannel | null;
}

/**
 * The music in the projector's window (the one that has the sound of the event): it plays the one song the console tells
 * it to, fading in and out as asked, and says where the song is, when it ends and when the browser will not play sound
 * until the window is clicked once. It owns no playlist: the console picks every song.
 */
export function MusicProgram({ preview = false, library: injected, openChannel = openStageChannel }: MusicProgramProps) {
  const { library, revision } = useMediaLibrary(injected);
  const audio = useRef<HTMLAudioElement>(null);
  const channel = useRef<StageChannel | null>(null);
  const loaded = useRef<string | null>(null);
  const url = useRef<string | null>(null);
  const generation = useRef(0);
  const libraryRef = useRef(library);
  const [blocked, setBlocked] = useState(false);
  const [wanted, setWanted] = useState<Wanted | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    libraryRef.current = library;
  }, [library]);

  useEffect(() => {
    if (preview) return;
    const line = openChannel();
    channel.current = line;
    if (!line) return;
    const stop = line.subscribe((message) => {
      if (message.type === "music") setWanted({ track: message.track, playing: message.playing, volume: message.volume, fadeMs: message.fadeMs, file: message.file ?? null });
      else if (message.type === "musicSeek" && audio.current) audio.current.currentTime = message.seconds;
      else if (message.type === "ping") line.post({ type: "musicAlive", trackId: loaded.current });
    });
    line.post({ type: "musicAlive", trackId: loaded.current });
    const timer = window.setInterval(() => line.post({ type: "musicAlive", trackId: loaded.current }), ALIVE_EVERY_MS);
    return () => {
      window.clearInterval(timer);
      stop();
      line.close();
      channel.current = null;
    };
  }, [openChannel, preview]);

  const setBlockedAndSay = useCallback((value: boolean) => {
    setBlocked(value);
    channel.current?.post({ type: "musicBlocked", blocked: value });
  }, []);

  // Doing what the console asks: change the song (fading the old one out), and fade the sound in or out.
  useEffect(() => {
    const element = audio.current;
    if (preview || !element || !wanted) return;
    const mine = ++generation.current;
    const current = () => generation.current === mine;
    (async () => {
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
        const found = wanted.file ? { ok: true as const, value: wanted.file } : libraryRef.current ? await libraryRef.current.resolve(wanted.track.path) : null;
        if (!current()) return;
        if (!found || !found.ok) {
          // The file is not there: the console is told the song ended, so it moves on instead of staying silent.
          channel.current?.post({ type: "musicEnded", trackId: wanted.track.id });
          return;
        }
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(found.value);
        element.src = url.current;
        element.currentTime = 0;
        loaded.current = wanted.track.id;
      }
      if (wanted.playing) {
        if (element.paused) element.volume = 0;
        try {
          await element.play();
        } catch {
          // A browser asks for one click on the page before it lets it make sound.
          if (current()) setBlockedAndSay(true);
          return;
        }
        if (current()) setBlockedAndSay(false);
        await ramp(element, wanted.volume, wanted.fadeMs, current);
      } else {
        await ramp(element, 0, wanted.fadeMs, current);
        if (current()) element.pause();
      }
    })();
    // A new instruction, or a click that lets the browser play, runs it again; `revision` is a granted folder permission.
  }, [wanted, preview, retry, revision, setBlockedAndSay]);

  useEffect(
    () => () => {
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );

  if (preview) return null;
  return (
    <>
      <audio
        ref={audio}
        preload="auto"
        onTimeUpdate={(event) => {
          const element = event.currentTarget;
          if (loaded.current && Number.isFinite(element.duration)) channel.current?.post({ type: "musicProgress", trackId: loaded.current, time: element.currentTime, duration: element.duration });
        }}
        onEnded={() => {
          if (loaded.current) channel.current?.post({ type: "musicEnded", trackId: loaded.current });
        }}
        onError={() => {
          if (loaded.current) channel.current?.post({ type: "musicEnded", trackId: loaded.current });
        }}
      />
      {blocked ? (
        <button type="button" onClick={() => setRetry((count) => count + 1)} className="fixed right-4 bottom-4 z-[300] rounded-full border-2 border-[#1e1e1e] bg-[#f9ab00] px-5 py-3 text-base font-bold text-[#1e1e1e]">
          {copy.stageConsole.music.unlock}
        </button>
      ) : null}
    </>
  );
}
