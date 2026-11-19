"use client";

import { useEffect, useRef, useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import type { MediaLibrary, ResolveError } from "../data/client/media-library";
import { openStageChannel, type StageChannel } from "../data/client/stage-channel";
import type { FailureReason, ProgramCue } from "../domain/channel";
import { SlideCanvas } from "./SlideCanvas";
import { useMediaLibrary } from "./use-library";
import { useObjectUrl, useResolvedFile } from "./use-media";

/** How often the projector's window says it is there, in milliseconds. */
export const ALIVE_EVERY_MS = 2000;

interface OnAir {
  cue: ProgramCue;
  slide: number;
  playing: boolean;
  /** A file the console sent along (a browser that cannot remember the folder). */
  file: File | null;
}

const REASON: Record<ResolveError, FailureReason> = { missing: "missing", denied: "denied", "no-library": "denied", "unsupported-path": "unsupported" };

export interface MediaProgramProps {
  /** For tests: a library and a way to open the channel instead of the browser's own. */
  library?: MediaLibrary;
  openChannel?: () => StageChannel | null;
}

/**
 * The files of the console on the projector's window: a video, a deck of slides or a picture, over the stage's own
 * scenes, while the console has one on the air; nothing when it does not. It reads the file itself from the connected
 * folder (this window is in the same browser as the console), says it is alive every couple of seconds, and reports
 * when a piece is ready or cannot be read. A piece that cannot be read is simply not shown: the screen keeps its own
 * scene instead of going black in front of the audience.
 */
export function MediaProgram({ library: injected, openChannel = openStageChannel }: MediaProgramProps) {
  const { library, revision } = useMediaLibrary(injected);
  const [onAir, setOnAir] = useState<OnAir | null>(null);
  const [unreadable, setUnreadable] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const channel = useRef<StageChannel | null>(null);
  const showing = useRef<string | null>(null);

  useEffect(() => {
    const line = openChannel();
    channel.current = line;
    if (!line) return;
    const announce = () => line.post({ type: "alive", showing: showing.current });
    const stop = line.subscribe((message) => {
      if (message.type === "program") {
        setUnreadable(null);
        setOnAir(message.cue ? { cue: message.cue, slide: message.slide, playing: message.playing, file: message.file ?? null } : null);
      } else if (message.type === "transport") {
        setOnAir((before) => (before ? { ...before, slide: message.slide, playing: message.playing } : before));
      } else if (message.type === "ping") {
        announce();
      }
    });
    announce();
    const timer = window.setInterval(announce, ALIVE_EVERY_MS);
    return () => {
      window.clearInterval(timer);
      stop();
      line.close();
      channel.current = null;
    };
  }, [openChannel]);

  const cue = onAir?.cue ?? null;
  const resolved = useResolvedFile(library, cue, onAir?.file ?? null, revision);
  const file = resolved.status === "ready" ? resolved.file : null;
  const url = useObjectUrl(cue?.kind === "slides" ? null : file);

  const report = channel;
  // A piece that could not be read, here or by the player, is not shown.
  const hidden = !cue || resolved.status === "failed" || unreadable === cue.id;
  useEffect(() => {
    showing.current = cue && !hidden ? cue.id : null;
  }, [cue, hidden]);
  useEffect(() => {
    if (!cue || resolved.status !== "failed") return;
    report.current?.post({ type: "failed", cueId: cue.id, reason: REASON[resolved.reason] });
  }, [cue, resolved, report]);

  const video = useRef<HTMLVideoElement>(null);
  const playing = onAir?.playing ?? false;
  useEffect(() => {
    const element = video.current;
    if (!element || !url) return;
    if (playing) void element.play().catch(() => undefined);
    else element.pause();
  }, [playing, url]);

  if (!onAir || !cue || hidden) return null;

  return (
    // A click anywhere lets the browser play sound: it refuses it until the page was used once.
    <div className="fixed inset-0 z-[200] bg-black text-white" onClick={() => setUnlocked(true)} role="presentation" aria-label={interpolate(copy.stageConsole.screen.label, { name: cue.name })}>
      {cue.kind === "slides" ? (
        <SlideCanvas
          file={file}
          page={onAir.slide}
          label={cue.name}
          onLoaded={(pages) => report.current?.post({ type: "loaded", cueId: cue.id, slides: pages })}
          onFailed={() => {
            setUnreadable(cue.id);
            report.current?.post({ type: "failed", cueId: cue.id, reason: "unreadable" });
          }}
        />
      ) : null}
      {cue.kind === "video" && url ? (
        <video
          ref={video}
          key={cue.id}
          src={url}
          className="size-full object-contain"
          muted={!unlocked}
          playsInline
          autoPlay={playing}
          onLoadedMetadata={() => report.current?.post({ type: "loaded", cueId: cue.id, slides: null })}
          onError={() => {
            setUnreadable(cue.id);
            report.current?.post({ type: "failed", cueId: cue.id, reason: "unreadable" });
          }}
        />
      ) : null}
      {cue.kind === "image" && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={cue.name}
          className="size-full object-contain"
          onLoad={() => report.current?.post({ type: "loaded", cueId: cue.id, slides: null })}
          onError={() => {
            setUnreadable(cue.id);
            report.current?.post({ type: "failed", cueId: cue.id, reason: "unreadable" });
          }}
        />
      ) : null}
      {cue.kind === "video" && !unlocked ? <p className="type-caption absolute bottom-4 left-4 rounded-full bg-black/70 px-4 py-2">{copy.stageConsole.screen.soundHint}</p> : null}
    </div>
  );
}
