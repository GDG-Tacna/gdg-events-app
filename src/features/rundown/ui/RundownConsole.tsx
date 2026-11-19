"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { ButtonLink, Icon } from "@/shared/ui";
import type { MediaLibrary } from "../data/client/media-library";
import { openStageChannel, type StageChannel } from "../data/client/stage-channel";
import type { FailureReason } from "../domain/channel";
import type { RundownErrorCode, StoredCues } from "../domain/manage";
import { back, cueOf, forget, forward, goToSlide, mediaOnProgram, selectNext, showScene, startOf, stop, take, togglePlay, type DataScene, type PlayoutState } from "../domain/playout";
import { buildRundown, cueFromPath, moveCue, qrCueId, queueOf, type AgendaPoint, type MediaCue } from "../domain/rundown";
import type { ProjectTalkRunner, SaveCuesAction, StageRunner } from "./actions";
import { ConsoleIcon } from "./ConsoleIcons";
import { ConsoleMonitor } from "./ConsoleMonitor";
import { actionForKey, CONFIRM_WINDOW_MS, DECK_KEYS, isTypingTarget, NEEDS_CONFIRMATION, nextView, slideWindow, type ConsoleAction, type DeckKeyId, type StageViewName } from "./console-model";
import { FilePickerDialog } from "./FilePickerDialog";
import { RundownPanel } from "./RundownPanel";
import { SetupDialog } from "./SetupDialog";
import { SlideCanvas } from "./SlideCanvas";
import { useMediaLibrary } from "./use-library";
import { useObjectUrl, useResolvedFile } from "./use-media";

const t = copy.stageConsole;

/** After this long without a sign from the projector's window the console says it is not there. */
export const SCREEN_LOST_AFTER_MS = 6000;

export interface RundownConsoleProps {
  /** The edition's name, in the header. */
  edition: string;
  agenda: readonly AgendaPoint[];
  /** The points of the agenda that have a QR to put on the screen (open talks). */
  qrItems: readonly string[];
  stored: StoredCues;
  frozen: boolean;
  view: StageViewName;
  squadsOn: boolean;
  /** The polls that can go on the screen: opened at some point. */
  polls: ReadonlyArray<{ id: string; status: "open" | "closed" }>;
  saveCues: SaveCuesAction;
  runStage: StageRunner;
  projectTalk: ProjectTalkRunner;
  hrefs: { screen: string; settings: string; raffle: string; back: string };
  /** For tests: stand-ins for the browser's folder and for the channel to the projector's window. */
  library?: MediaLibrary;
  openChannel?: () => StageChannel | null;
}

const SCENE_KEY: Record<DataScene, DeckKeyId> = { ranking: "ranking", poll: "poll", reveal: "reveal", waiting: "waiting" };
const SAVE_ERRORS: Partial<Record<RundownErrorCode, string>> = { forbidden: t.alerts.saveFailed };

const newCueId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * The console of the stage, like a small switcher: the order of the event on the left (each point of the agenda with its
 * videos, slides and QR), and on the right what is on the big screen, what comes next, the controls and the quick scenes.
 * The files are read from the folder the operator connects on this computer and shown in the projector's window, which is
 * another window of this same browser; nothing is uploaded. Data scenes (ranking, poll, winners, QR) are the stage's own.
 */
export function RundownConsole({ edition, agenda, qrItems, stored, frozen: initialFrozen, view: initialView, squadsOn, polls, saveCues, runStage, projectTalk, hrefs, library: injectedLibrary, openChannel = openStageChannel }: RundownConsoleProps) {
  const router = useRouter();
  const media = useMediaLibrary(injectedLibrary);

  // --- the order -------------------------------------------------------------------------------------------------------
  const [cues, setCues] = useState<Readonly<Record<string, readonly MediaCue[]>>>(stored);
  const items = useMemo(() => buildRundown(agenda, cues, new Set(qrItems)), [agenda, cues, qrItems]);
  const queue = useMemo(() => queueOf(items), [items]);
  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const [playout, setPlayout] = useState<PlayoutState>(() => startOf(queueOf(buildRundown(agenda, stored, new Set(qrItems)))));
  const playoutRef = useRef(playout);
  const [openItemId, setOpenItemId] = useState<string | null>(agenda[0]?.id ?? null);
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFiles, setPickerFiles] = useState<readonly string[]>([]);
  const [setupManual, setSetupManual] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [alerts, setAlerts] = useState<ReadonlyArray<{ id: number; text: string }>>([]);
  const [frozen, setFrozen] = useState(initialFrozen);
  const [view, setView] = useState<StageViewName>(initialView);
  const [armed, setArmed] = useState<DeckKeyId | null>(null);

  const alert = useCallback((text: string) => setAlerts((before) => [...before.filter((entry) => entry.text !== text), { id: Date.now() + before.length, text }]), []);

  // --- the line to the projector's window ----------------------------------------------------------------------------
  const channel = useRef<StageChannel | null>(null);
  const [hasChannel, setHasChannel] = useState(true);
  const [connected, setConnected] = useState(false);
  const [everConnected, setEverConnected] = useState(false);
  const lastAlive = useRef(0);
  const [slides, setSlides] = useState<ReadonlyMap<string, number>>(new Map());
  const [failures, setFailures] = useState<ReadonlyMap<string, FailureReason>>(new Map());
  const libraryRef = useRef(media.library);
  useEffect(() => {
    libraryRef.current = media.library;
  }, [media.library]);

  /** Says what is on the air: a file goes to the projector's window; anything else clears it and asks the stage. */
  const announce = useCallback(
    async (state: PlayoutState) => {
      const file = mediaOnProgram(state, queueRef.current);
      if (file) {
        let sent: File | undefined;
        const library = libraryRef.current;
        // A browser that cannot remember the folder cannot share it with the other window: the file goes along.
        if (library && library.kind === "folder-input") {
          const found = await library.resolve(file.path);
          if (found.ok) sent = found.value;
        }
        channel.current?.post({ type: "program", cue: { id: file.id, kind: file.kind, name: file.name, path: file.path }, slide: state.slide, playing: state.playing, ...(sent ? { file: sent } : {}) });
        return;
      }
      channel.current?.post({ type: "program", cue: null, slide: 1, playing: false });
      const program = state.program;
      if (!program) return;
      let result: { ok: boolean } | undefined;
      if (program.type === "scene") {
        if (program.scene === "ranking" || program.scene === "waiting") result = await runStage({ type: "show", display: program.scene });
        else if (program.scene === "reveal") result = await runStage({ type: "reveal" });
        else {
          const poll = polls.find((candidate) => candidate.status === "open") ?? polls[0];
          if (poll) result = await runStage({ type: "poll", pollId: poll.id });
        }
      } else {
        const entry = queueRef.current.find((candidate) => candidate.cue.id === program.cueId);
        if (entry) result = await projectTalk({ id: entry.itemId });
      }
      if (result && !result.ok) alert(t.alerts.stageFailed);
      else router.refresh();
    },
    [alert, polls, projectTalk, router, runStage],
  );

  const commit = useCallback(
    (next: PlayoutState) => {
      const before = playoutRef.current;
      if (next === before) return;
      playoutRef.current = next;
      setPlayout(next);
      if (JSON.stringify(before.program) !== JSON.stringify(next.program)) void announce(next);
      else if (before.slide !== next.slide || before.playing !== next.playing) channel.current?.post({ type: "transport", slide: next.slide, playing: next.playing });
      const onAir = next.program?.type === "cue" ? queueRef.current.find((entry) => entry.cue.id === (next.program as { cueId: string }).cueId) : null;
      if (onAir) setOpenItemId(onAir.itemId);
    },
    [announce],
  );

  useEffect(() => {
    const line = openChannel();
    channel.current = line;
    // The browser has no way to reach the projector's window: said once, in the header.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!line) return setHasChannel(false);
    const stopListening = line.subscribe((message) => {
      if (message.type === "alive") {
        lastAlive.current = Date.now();
        setConnected(true);
        setEverConnected(true);
        // A window opened (or reloaded) after something went on the air shows it too.
        const onAir = mediaOnProgram(playoutRef.current, queueRef.current);
        if ((onAir?.id ?? null) !== message.showing && onAir) void announce(playoutRef.current);
      } else if (message.type === "loaded" && message.slides) {
        setSlides((before) => new Map(before).set(message.cueId, message.slides as number));
      } else if (message.type === "failed") {
        setFailures((before) => new Map(before).set(message.cueId, message.reason));
      }
    });
    line.post({ type: "ping" });
    const timer = window.setInterval(() => setConnected(Date.now() - lastAlive.current < SCREEN_LOST_AFTER_MS), 1000);
    return () => {
      window.clearInterval(timer);
      stopListening();
      line.close();
      channel.current = null;
    };
  }, [openChannel, announce]);

  // --- files that are not where the order says -------------------------------------------------------------------------
  const [missingInFolder, setMissingInFolder] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const library = media.library;
    if (!library || media.status !== "ready") return;
    let cancelled = false;
    (async () => {
      const found = new Set<string>();
      for (const entry of queue) {
        if (entry.cue.kind === "qr") continue;
        const result = await library.resolve(entry.cue.path);
        if (!result.ok && result.error === "missing") found.add(entry.cue.id);
      }
      if (!cancelled) setMissingInFolder(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [queue, media.library, media.status, media.revision]);
  const missing = useMemo(() => new Set([...missingInFolder, ...[...failures].filter(([, reason]) => reason === "missing").map(([cueId]) => cueId)]), [missingInFolder, failures]);

  // --- what is on the air and what is next ---------------------------------------------------------------------------------
  const onAirFile = mediaOnProgram(playout, queue);
  const liveCueId = playout.program?.type === "cue" ? playout.program.cueId : null;
  const nextCue = cueOf(queue, playout.next);
  const total = onAirFile?.kind === "slides" ? (slides.get(onAirFile.id) ?? 0) : 0;
  const programFile = useResolvedFile(media.library, onAirFile && onAirFile.kind !== "video" ? onAirFile : null, null, media.revision);
  const imageUrl = useObjectUrl(onAirFile?.kind === "image" && programFile.status === "ready" ? programFile.file : null);

  // --- the operator's moves ------------------------------------------------------------------------------------------------
  const pressKey = useCallback(
    (key: DeckKeyId) => {
      const state = playoutRef.current;
      if (key === "raffle") {
        window.open(hrefs.raffle, "_blank", "noopener");
        return;
      }
      if (key === "freeze") {
        const next = !frozen;
        setFrozen(next);
        void runStage({ type: next ? "freeze" : "unfreeze" }).then((result) => (result.ok ? router.refresh() : alert(t.alerts.stageFailed)));
        return;
      }
      if (key === "view") {
        if (!squadsOn) return;
        const next = nextView(view);
        setView(next);
        void runStage({ type: "view", view: next }).then((result) => (result.ok ? router.refresh() : alert(t.alerts.stageFailed)));
        return;
      }
      if (NEEDS_CONFIRMATION.has(key) && armed !== key) {
        setArmed(key);
        window.setTimeout(() => setArmed((current) => (current === key ? null : current)), CONFIRM_WINDOW_MS);
        return;
      }
      setArmed(null);
      if (key === "qr") {
        const onAir = state.program?.type === "cue" ? queueRef.current.find((entry) => entry.cue.id === (state.program as { cueId: string }).cueId) : null;
        const itemId = onAir?.itemId ?? queueRef.current.find((entry) => entry.cue.id === state.next)?.itemId ?? agenda[0]?.id;
        if (!itemId || !qrItems.includes(itemId)) return;
        commit({ ...state, program: { type: "cue", cueId: qrCueId(itemId) }, playing: false });
        return;
      }
      commit(showScene(state, key));
    },
    [agenda, alert, armed, commit, frozen, hrefs.raffle, qrItems, router, runStage, squadsOn, view],
  );

  const run = useCallback(
    (action: ConsoleAction) => {
      const state = playoutRef.current;
      const q = queueRef.current;
      switch (action.type) {
        case "take":
          return commit(take(state, q));
        case "forward":
          return commit(forward(state, q, onAirFile?.kind === "slides" ? Math.max(total, state.slide) : state.slide));
        case "back":
          return commit(back(state, q));
        case "playPause":
          return commit(togglePlay(state, q));
        case "stop":
          return commit(stop(state));
        case "slide":
          return commit(goToSlide(state, q, action.slide, total));
        case "pickPrevious":
        case "pickNext": {
          const index = q.findIndex((entry) => entry.cue.id === state.next);
          const target = q[index + (action.type === "pickNext" ? 1 : -1)];
          return target ? commit(selectNext(state, q, target.cue.id)) : undefined;
        }
        case "deck":
          return pressKey(action.key);
      }
    },
    [commit, onAirFile, pressKey, total],
  );

  // --- editing the order -------------------------------------------------------------------------------------------------------
  const save = useCallback(
    async (itemId: string, next: readonly MediaCue[], before: readonly MediaCue[]) => {
      setCues((current) => ({ ...current, [itemId]: next }));
      const result = await saveCues({ itemId, cues: next });
      if (!result.ok) {
        setCues((current) => ({ ...current, [itemId]: before }));
        alert(SAVE_ERRORS[result.code] ?? t.alerts.saveFailed);
        return false;
      }
      return true;
    },
    [alert, saveCues],
  );

  async function addFile(path: string): Promise<string | null> {
    const itemId = openItemId ?? agenda[0]?.id;
    if (!itemId) return t.alerts.saveFailed;
    const cue = cueFromPath(path, newCueId());
    if (!cue) return copy.stageConsole.picker.badPath;
    const before = cues[itemId] ?? [];
    return (await save(itemId, [...before, cue], before)) ? null : t.alerts.saveFailed;
  }

  function removeCue(itemId: string, cueId: string) {
    const before = cues[itemId] ?? [];
    commit(forget(playoutRef.current, queueRef.current, cueId));
    void save(itemId, before.filter((cue) => cue.id !== cueId), before);
  }

  function moveCueBy(itemId: string, cueId: string, delta: -1 | 1) {
    const before = cues[itemId] ?? [];
    void save(itemId, moveCue(before, cueId, delta), before);
  }

  function openPicker() {
    setPickerOpen(true);
    void media.library?.list().then(setPickerFiles);
  }

  // --- the keyboard -----------------------------------------------------------------------------------------------------------
  const dialogOpen = pickerOpen || setupManual || (!setupDismissed && media.library !== null && media.status === "none");
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || dialogOpen || isTypingTarget(event.target)) return;
      // A button in focus already handles Space and Enter itself.
      if ((event.key === " " || event.key === "Enter") && event.target instanceof HTMLButtonElement) return;
      const action = actionForKey(event.key);
      if (!action) return;
      event.preventDefault();
      run(action);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogOpen, run]);

  function openScreen() {
    window.open(hrefs.screen, "devfest-stage-screen");
  }

  // --- what the screens show -----------------------------------------------------------------------------------------------
  const sceneOnAir = playout.program?.type === "scene" ? playout.program.scene : null;
  const qrOnAir = liveCueId !== null && cueOf(queue, liveCueId)?.kind === "qr";
  const liveTitle = onAirFile ? onAirFile.name : sceneOnAir ? t.program.scenes[sceneOnAir] : qrOnAir ? t.rundown.kinds.qr : t.program.nothing;
  const liveStatus = onAirFile?.kind === "video" ? (playout.playing ? t.program.playing : t.program.paused) : onAirFile?.kind === "slides" && total > 0 ? interpolate(t.program.slide, { n: String(playout.slide), total: String(total) }) : onAirFile ? t.program.loading : sceneOnAir || qrOnAir ? t.program.sceneStatus : undefined;
  const videoPlaying = onAirFile?.kind === "video" && playout.playing;
  const failedOnAir = onAirFile && failures.has(onAirFile.id);

  const deckIcon = (key: DeckKeyId) =>
    key === "ranking" ? <Icon name="trophy" size={24} /> : key === "poll" ? <Icon name="poll" size={24} /> : key === "reveal" ? <Icon name="medal" size={24} /> : key === "raffle" ? <Icon name="gift" size={24} /> : key === "qr" ? <Icon name="qr" size={24} /> : key === "waiting" ? <ConsoleIcon name="clock" size={24} /> : key === "freeze" ? <ConsoleIcon name="freeze" size={24} /> : <ConsoleIcon name="eye" size={24} />;

  const firstSlides = onAirFile?.kind === "slides" && total > 1 ? slideWindow(playout.slide, total) : [];

  return (
    <div className="bg-background text-foreground fixed inset-0 flex min-w-[1100px] flex-col overflow-auto">
      <header className="bg-surface border-ink gap-space-4 flex h-16 shrink-0 items-center border-b-2 px-5">
        <div className="gap-space-3 flex items-center">
          <span aria-hidden="true" className="font-mono text-2xl font-bold tracking-tighter">
            <span className="text-[#ea4335]">&lt;</span>
            <span className="text-[#34a853]">&gt;</span>
          </span>
          <h1 className="type-title text-foreground">{t.title}</h1>
          <span className="type-pixel-heading text-text-subtle">{edition}</span>
        </div>
        <div className="flex-1" />
        <span className="border-line-strong type-caption inline-flex h-9 items-center gap-2 rounded-full border-2 px-3.5 font-medium">
          <span aria-hidden="true" className={cn("size-2.5 rounded-full", connected ? "bg-lime" : "bg-danger")} />
          {connected ? t.screenOn : t.screenOff}
        </span>
        <span className="border-line-strong type-caption inline-flex h-9 items-center gap-2 rounded-full border-2 px-3.5 font-medium">
          <span aria-hidden="true" className={cn("size-2.5 rounded-full", media.status === "ready" ? "bg-lime" : "bg-danger")} />
          {t.folder}
          {media.status === "ready" && media.folder ? <span className="text-muted-foreground font-mono text-xs">{media.folder}</span> : <button type="button" onClick={() => setSetupManual(true)} className="underline">{t.folderConnect}</button>}
        </span>
        <ButtonLink href={hrefs.settings} variant="ghost" size="sm">
          {t.settings}
        </ButtonLink>
        <ButtonLink href={hrefs.back} variant="ghost" size="sm">
          {t.back}
        </ButtonLink>
        <button type="button" onClick={openScreen} className="bg-ink text-on-ink border-ink focus-visible:ring-ring h-10 rounded-full border-2 px-4 text-sm font-semibold focus-visible:ring-[3px] focus-visible:outline-none">
          {t.openScreen}
        </button>
      </header>

      {alerts.length > 0 || media.status === "needs-permission" || !hasChannel || (everConnected && !connected) ? (
        <div className="gap-space-2 flex shrink-0 flex-col px-5 pt-3">
          {media.status === "needs-permission" ? (
            <p role="alert" className="border-gold-ink bg-surface gap-space-3 type-body-sm flex items-center rounded-md border-2 px-3 py-2">
              <span className="flex-1">{t.alerts.permission}</span>
              <button type="button" onClick={() => void media.allow()} className="bg-ink text-on-ink h-9 rounded-full px-4 text-sm font-semibold">
                {t.folderAllow}
              </button>
            </p>
          ) : null}
          {!hasChannel ? (
            <p role="alert" className="border-danger-ink bg-surface type-body-sm rounded-md border-2 px-3 py-2">
              {t.alerts.noChannel}
            </p>
          ) : null}
          {everConnected && !connected ? (
            <p role="alert" className="border-danger-ink bg-surface gap-space-3 type-body-sm flex items-center rounded-md border-2 px-3 py-2">
              <span className="flex-1">{t.alerts.screenLost}</span>
              <button type="button" onClick={openScreen} className="border-ink h-9 rounded-full border-2 px-4 text-sm font-semibold">
                {t.alerts.reopen}
              </button>
            </p>
          ) : null}
          {alerts.map((entry) => (
            <p key={entry.id} role="alert" className="border-danger-ink bg-surface gap-space-3 type-body-sm flex items-center rounded-md border-2 px-3 py-2">
              <span className="flex-1">{entry.text}</span>
              <button type="button" aria-label={t.alerts.dismiss} onClick={() => setAlerts((before) => before.filter((other) => other.id !== entry.id))} className="grid size-8 place-items-center rounded-full">
                <Icon name="close" size={16} />
              </button>
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-5 p-5">
        <RundownPanel
          items={items}
          openItemId={openItemId}
          onToggleItem={(id) => setOpenItemId((current) => (current === id ? null : id))}
          liveCueId={liveCueId}
          nextCueId={playout.next}
          missing={missing}
          slides={slides}
          editing={editing}
          onToggleEditing={() => setEditing((current) => !current)}
          onAdd={openPicker}
          onPick={(cueId) => commit(selectNext(playoutRef.current, queueRef.current, cueId))}
          onMove={moveCueBy}
          onRemove={removeCue}
        />

        <div className="gap-space-4 flex min-w-0 flex-1 flex-col">
          <div className="gap-space-4 flex">
            <ConsoleMonitor
              tone="live"
              tag={t.rundown.live}
              label={t.program.label}
              title={failedOnAir ? t.program.failed : liveTitle}
              status={liveStatus}
              className="flex-[1.5]"
              icon={sceneOnAir || qrOnAir || !onAirFile ? <Icon name={qrOnAir ? "qr" : "stage"} size={44} /> : onAirFile.kind === "video" ? <ConsoleIcon name="video" size={44} /> : <ConsoleIcon name="slides" size={44} />}
              preview={
                onAirFile?.kind === "slides" && programFile.status === "ready" ? (
                  <SlideCanvas file={programFile.file} page={playout.slide} label={onAirFile.name} onLoaded={(pages) => setSlides((before) => new Map(before).set(onAirFile.id, pages))} onFailed={() => alert(t.program.failed)} />
                ) : onAirFile?.kind === "image" && imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt={onAirFile.name} className="size-full object-contain" />
                ) : undefined
              }
            />
            <ConsoleMonitor
              tone="next"
              tag={t.rundown.next}
              label={t.program.next}
              title={nextCue ? nextCue.name : t.program.nothingNext}
              className="flex-1 self-start"
              icon={nextCue?.kind === "video" ? <ConsoleIcon name="video" size={36} /> : nextCue?.kind === "slides" ? <ConsoleIcon name="slides" size={36} /> : nextCue?.kind === "image" ? <Icon name="image" size={36} /> : <Icon name="qr" size={36} />}
            />
          </div>

          <div className="bg-surface border-ink gap-space-3 flex shrink-0 items-center rounded-lg border-2 px-3.5 py-2.5">
            <button type="button" onClick={() => run({ type: "back" })} className="border-ink focus-visible:ring-ring inline-flex h-12 items-center gap-2 rounded-full border-2 px-4 text-sm font-semibold focus-visible:ring-[3px] focus-visible:outline-none">
              <ConsoleIcon name="previous" />
              {t.transport.back}
            </button>
            <button type="button" onClick={() => run({ type: "playPause" })} className="bg-ink text-on-ink border-ink focus-visible:ring-ring inline-flex h-12 items-center gap-2 rounded-full border-2 px-5 text-sm font-bold focus-visible:ring-[3px] focus-visible:outline-none">
              {videoPlaying ? <ConsoleIcon name="pause" /> : <Icon name="play" size={20} />}
              {videoPlaying ? t.transport.pause : t.transport.play}
            </button>
            <button type="button" onClick={() => run({ type: "forward" })} className="border-ink focus-visible:ring-ring inline-flex h-12 items-center gap-2 rounded-full border-2 px-4 text-sm font-semibold focus-visible:ring-[3px] focus-visible:outline-none">
              {t.transport.forward}
              <ConsoleIcon name="next" />
            </button>
            <button type="button" onClick={() => run({ type: "stop" })} className="border-line-strong focus-visible:ring-ring inline-flex h-12 items-center gap-2 rounded-full border-2 px-4 text-sm font-semibold focus-visible:ring-[3px] focus-visible:outline-none">
              <ConsoleIcon name="stop" size={18} />
              {t.transport.stop}
            </button>
            <div className="flex-1" />
            <span className="type-caption text-text-subtle">{t.transport.ready}</span>
            <span className="type-caption text-foreground max-w-[200px] truncate font-semibold">{nextCue ? nextCue.name : t.transport.nothing}</span>
            <button type="button" onClick={() => run({ type: "take" })} disabled={!nextCue} className="bg-lime text-on-accent border-ink focus-visible:ring-ring h-[52px] rounded-full border-2 px-7 text-base font-bold tracking-wide focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-50">
              {t.transport.take}
            </button>
          </div>

          {firstSlides.length > 0 ? (
            <div className="bg-surface border-ink gap-space-2 flex shrink-0 items-center rounded-lg border-2 px-3.5 py-2">
              <span className="type-pixel-heading text-text-subtle shrink-0">{t.strip.label}</span>
              {firstSlides.map((slide) => (
                <button key={slide} type="button" aria-label={interpolate(t.strip.go, { n: String(slide) })} aria-current={slide === playout.slide ? "true" : undefined} onClick={() => run({ type: "slide", slide })} className={cn("focus-visible:ring-ring h-10 min-w-0 flex-1 rounded-md border-2 font-mono text-sm font-semibold focus-visible:ring-[3px] focus-visible:outline-none", slide === playout.slide ? "bg-gold text-on-accent border-ink" : "bg-surface-raised border-line text-foreground")}>
                  {slide}
                </button>
              ))}
            </div>
          ) : null}

          <section aria-label={t.deck.title} className="gap-space-2 flex min-h-0 flex-1 flex-col">
            <div className="flex items-baseline gap-3">
              <h2 className="type-pixel-heading text-text-subtle">{t.deck.title}</h2>
              <p className="type-caption text-text-subtle">{t.deck.hint}</p>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-2 gap-3">
              {DECK_KEYS.map((key, index) => {
                const copyKey = key === "freeze" && frozen ? "unfreeze" : key;
                const label = t.deck.keys[copyKey];
                const isLive = (sceneOnAir !== null && SCENE_KEY[sceneOnAir] === key) || (key === "qr" && qrOnAir) || (key === "freeze" && frozen);
                const isArmed = armed === key;
                const noPoll = key === "poll" && polls.length === 0;
                const noQr = key === "qr" && qrItems.length === 0;
                const noView = key === "view" && !squadsOn;
                const disabled = noPoll || noQr || noView;
                const sub = isArmed ? t.deck.confirm : noPoll ? t.deck.keys.poll.none : noQr ? t.deck.keys.qr.none : noView ? t.deck.keys.view.none : key === "view" ? t.deck.views[view] : isLive && key !== "freeze" ? t.deck.onAir : label.sub;
                return (
                  <button key={key} type="button" disabled={disabled} onClick={() => run({ type: "deck", key })} aria-pressed={isLive || isArmed} className={cn("bg-surface focus-visible:ring-ring flex min-h-0 flex-col justify-between rounded-lg border-2 p-3 text-left focus-visible:ring-[3px] focus-visible:outline-none", isLive ? "border-danger ring-danger ring-2" : isArmed ? "border-gold" : "border-ink", disabled && "opacity-55")}>
                    <span className="flex items-center justify-between">
                      <span aria-hidden="true" className="bg-surface-raised text-cyan-ink grid size-10 place-items-center rounded-md">
                        {deckIcon(key)}
                      </span>
                      <span className="border-line-strong text-text-subtle rounded-md border-2 px-1.5 font-mono text-[11px] font-semibold">F{index + 1}</span>
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="type-label text-foreground text-base font-bold">{label.label}</span>
                      <span className={cn("type-caption", isArmed ? "text-gold-ink font-bold" : isLive ? "text-danger-ink font-bold" : "text-text-subtle")}>{sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
          <p className="type-caption text-text-subtle shrink-0">{t.shortcuts}</p>
        </div>
      </div>

      <FilePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        itemTitle={agenda.find((point) => point.id === openItemId)?.title ?? agenda[0]?.title ?? ""}
        files={pickerFiles}
        folderReady={media.status === "ready"}
        onConnect={() => void media.connect().then(() => media.library?.list().then(setPickerFiles))}
        onAdd={addFile}
      />
      <SetupDialog
        open={setupManual || (!setupDismissed && media.library !== null && media.status === "none")}
        onOpenChange={() => {
          setSetupManual(false);
          setSetupDismissed(true);
        }}
        folderReady={media.status === "ready"}
        folderName={media.folder}
        remembers={media.library?.kind === "folder-access"}
        screenConnected={connected}
        onConnect={() => void media.connect()}
        onOpenScreen={openScreen}
      />
    </div>
  );
}
