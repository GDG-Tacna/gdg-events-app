"use client";

import { useEffect, useRef, useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import type { MediaLibrary, ResolveError } from "../data/client/media-library";
import { openStageChannel, type StageChannel } from "../data/client/stage-channel";
import type { FailureReason, ProgramCue } from "../domain/channel";
import { googleSlidesEmbedUrl } from "../domain/rundown";
import { SlideCanvas } from "./SlideCanvas";
import { useMediaLibrary } from "./use-library";
import { useObjectUrl, useResolvedFile } from "./use-media";

/** The volume is a property of the element, not an attribute: it is set from here, outside the component. */
function setVolumeOf(element: HTMLVideoElement | null, volume: number) {
  if (element) element.volume = volume;
}

/** How often the projector's window says it is there, in milliseconds. */
export const ALIVE_EVERY_MS = 2000;

interface OnAir {
  cue: ProgramCue;
  slide: number;
  playing: boolean;
  loop: boolean;
  volume: number;
  muted: boolean;
  /** A file the console sent along (a browser that cannot remember the folder). */
  file: File | null;
}

const REASON: Record<ResolveError, FailureReason> = { missing: "missing", denied: "denied", "no-library": "denied", "unsupported-path": "unsupported" };

/**
 * The two badges over the piece on the air: «En vivo» and, for slides, the slide's number. They show when the piece or
 * its slide changes and fade out on their own (a CSS animation, mounted again by its key), so they never stay over the
 * speaker's slides.
 */
function Badges({ slide, total }: { slide: number | null; total: number | null }) {
  return (
    <div aria-hidden="true" className="stage-badges pointer-events-none">
      <span className="absolute top-6 right-6 rounded-full bg-[#fbbc04] px-4 py-1.5 text-base font-extrabold tracking-wider text-[#1e1e1e] uppercase">{copy.stageConsole.screen.live}</span>
      {slide !== null && total !== null && total > 0 ? (
        <span className="absolute bottom-6 left-6 flex items-center gap-3 rounded-full bg-[#1e1e1e] px-5 py-2.5 text-lg font-bold text-[#f0f0f0]">
          <span className="size-2.5 rounded-full bg-[#5cdb6d]" />
          {interpolate(copy.stageConsole.screen.slideOf, { n: String(slide), total: String(total) })}
        </span>
      ) : null}
    </div>
  );
}

export interface MediaProgramProps {
  /**
   * A small copy of the screen inside the console: it shows what the console puts on the air, always muted, and does not
   * say it is alive or report anything, so the console never mistakes it for the real projector window.
   */
  preview?: boolean;
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
export function MediaProgram({ preview = false, library: injected, openChannel = openStageChannel }: MediaProgramProps) {
  const { library, revision } = useMediaLibrary(injected);
  const [onAir, setOnAir] = useState<OnAir | null>(null);
  const [unreadable, setUnreadable] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  // How many slides the deck on the air has, once it is read.
  const [deck, setDeck] = useState<{ id: string; pages: number } | null>(null);
  const channel = useRef<StageChannel | null>(null);
  const showing = useRef<string | null>(null);

  useEffect(() => {
    const line = openChannel();
    // A copy for the console listens only: with no channel to post on, nothing it does is reported.
    channel.current = preview ? null : line;
    if (!line) return;
    const announce = () => line.post({ type: "alive", showing: showing.current });
    const stop = line.subscribe((message) => {
      if (preview && message.type !== "program" && message.type !== "transport" && message.type !== "seek") return;
      if (message.type === "program") {
        setUnreadable(null);
        setOnAir(message.cue ? { cue: message.cue, slide: message.slide, playing: message.playing, loop: message.loop ?? false, volume: message.volume ?? 1, muted: message.muted ?? false, file: message.file ?? null } : null);
      } else if (message.type === "transport") {
        setOnAir((before) => (before ? { ...before, slide: message.slide, playing: message.playing, loop: message.loop ?? before.loop, volume: message.volume ?? before.volume, muted: message.muted ?? before.muted } : before));
      } else if (message.type === "seek") {
        if (video.current) video.current.currentTime = message.seconds;
      } else if (message.type === "ping") {
        announce();
      }
    });
    if (!preview) announce();
    const timer = preview ? null : window.setInterval(announce, ALIVE_EVERY_MS);
    return () => {
      if (timer !== null) window.clearInterval(timer);
      stop();
      line.close();
      channel.current = null;
    };
  }, [openChannel, preview]);

  const cue = onAir?.cue ?? null;
  // A Google Slides deck has no file to read: Google serves it in its own frame.
  const resolved = useResolvedFile(library, cue && cue.kind !== "gslides" ? cue : null, onAir?.file ?? null, revision);
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
  const volume = onAir?.volume ?? 1;
  useEffect(() => {
    setVolumeOf(video.current, volume);
  }, [volume, url]);
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
      {cue.kind === "gslides" ? (
        <iframe
          title={cue.name}
          src={googleSlidesEmbedUrl(cue)}
          className="size-full border-0"
          allow="autoplay; fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
          // Google's page runs on its own; it cannot reach this app.
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          // The keys that change slide go to the frame once it has the focus.
          onLoad={(event) => {
            event.currentTarget.focus();
            report.current?.post({ type: "loaded", cueId: cue.id, slides: null });
          }}
        />
      ) : null}
      {cue.kind === "slides" ? (
        <SlideCanvas
          file={file}
          page={onAir.slide}
          label={cue.name}
          onLoaded={(pages) => {
            setDeck({ id: cue.id, pages });
            report.current?.post({ type: "loaded", cueId: cue.id, slides: pages });
          }}
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
          muted={preview || !unlocked || onAir.muted}
          loop={onAir.loop}
          onTimeUpdate={(event) => {
            const element = event.currentTarget;
            if (Number.isFinite(element.duration)) report.current?.post({ type: "progress", cueId: cue.id, time: element.currentTime, duration: element.duration });
          }}
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
      <Badges key={`${cue.id}:${onAir.slide}`} slide={cue.kind === "slides" ? onAir.slide : null} total={deck && deck.id === cue.id ? deck.pages : null} />
      {cue.kind === "video" && !unlocked && !preview ? <p className="type-caption absolute bottom-4 left-4 rounded-full bg-black/70 px-4 py-2">{copy.stageConsole.screen.soundHint}</p> : null}
    </div>
  );
}
