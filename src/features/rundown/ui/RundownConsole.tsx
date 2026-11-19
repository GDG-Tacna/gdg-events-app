"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { ButtonLink, Icon, useConfirm } from "@/shared/ui";
import type { MediaLibrary } from "../data/client/media-library";
import { openStageChannel, type StageChannel } from "../data/client/stage-channel";
import type { FailureReason } from "../domain/channel";
import type { RundownErrorCode, StoredCues } from "../domain/manage";
import { back, cueOf, forget, forward, goToSlide, mediaOnProgram, selectNext, setVolume, showScene, startOf, stop, take, toggleLoop, toggleMute, togglePlay, type DataScene, type PlayoutState } from "../domain/playout";
import { buildRundown, cueFromPath, googleSlidesCueFromLink, isAudioPath, isFileCue, isMediaPath, isSeconds, mergeAgenda, moveCue, qrCueId, queueOf, withSeconds, type AgendaPoint, type ExtraPoint, type StoredCue } from "../domain/rundown";
import {
  addCounterTime,
  cardWire,
  counterWire,
  defaultPlaceOf,
  finishCounter,
  INITIAL_COUNTER,
  isRunning,
  moveCounter,
  parseDuration,
  pauseCounter,
  PLACES,
  placeOf,
  remainingOf,
  resetCounter,
  setCounterDuration,
  setCounterLabel,
  setCounterSize,
  setOnZero,
  showCounter,
  startCounter,
  type CounterSize,
  type CounterState,
  type LayerCard,
  type OnZero,
  type PlaceName,
} from "../domain/layers";
import { cycleRepeat, forgetTrack, INITIAL_MUSIC, nextTrack, playTrack, previousTrack, setFadeSeconds, setMusicVolume, soundingOf, stopMusic, toggleDuck, togglePlayback, trackFromPath, type MusicState, type Track } from "../domain/music";
import type { ProjectTalkRunner, SaveCardsAction, SaveCuesAction, SaveMinutesAction, SavePlaylistAction, SavePointsAction, StageRunner } from "./actions";
import { ConsoleIcon } from "./ConsoleIcons";
import { ConsoleMonitor } from "./ConsoleMonitor";
import { actionForKey, CONFIRM_WINDOW_MS, DECK_KEYS, isTypingTarget, NEEDS_CONFIRMATION, nextView, slideWindow, type ConsoleAction, type DeckKeyId, type StageViewName } from "./console-model";
import { CardDialog, type CardDraft } from "./CardDialog";
import { FilePickerDialog } from "./FilePickerDialog";
import { LayerHandles, type LayerTarget } from "./LayerHandles";
import { LayersPanel } from "./LayersPanel";
import { MusicDialog } from "./MusicDialog";
import { MusicPanel } from "./MusicPanel";
import { MusicPlayer, type MusicPlayerHandle } from "./MusicPlayer";
import { PointDialog, type PointDraft } from "./PointDialog";
import { RundownPanel } from "./RundownPanel";
import { SetupDialog } from "./SetupDialog";
import { SlideCanvas } from "./SlideCanvas";
import { StageThumbnail } from "./StageThumbnail";
import { VideoControls } from "./VideoControls";
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
  /** Saves the points made in the console and the minutes planned; without them the console cannot add or plan points. */
  savePoints?: SavePointsAction;
  saveMinutes?: SaveMinutesAction;
  /** The songs of the playlist as saved, and how to save them; without `savePlaylist` the console has no music. */
  playlist?: readonly Track[];
  savePlaylist?: SavePlaylistAction;
  /** The cards that can be put over the screen as saved, and how to save them; without `saveCards` the console has no layers. */
  cards?: readonly LayerCard[];
  saveCards?: SaveCardsAction;
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
/** The agenda split into the talks, the points made here and the minutes planned (what the store keeps apart). */
function splitAgenda(agenda: readonly AgendaPoint[]) {
  const talks: AgendaPoint[] = [];
  const extras: ExtraPoint[] = [];
  const minutes: Record<string, number> = {};
  for (const { minutes: planned, custom, ...point } of agenda) {
    if (planned) minutes[point.id] = planned;
    if (custom) extras.push({ id: point.id, title: point.title, who: point.who, time: point.time });
    else talks.push(point);
  }
  return { talks, extras, minutes };
}

/** An id for a new point: its name as a slug and a short random tail, so two points never share one. */
const newPointId = (title: string) => {
  const slug = title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "punto";
  return `${slug}-${Math.random().toString(36).slice(2, 6)}`;
};

export function RundownConsole({ edition, agenda: initialAgenda, qrItems, stored, frozen: initialFrozen, view: initialView, squadsOn, polls, saveCues, savePoints, saveMinutes, playlist: initialPlaylist = [], savePlaylist, cards: initialCards = [], saveCards, runStage, projectTalk, hrefs, library: injectedLibrary, openChannel = openStageChannel }: RundownConsoleProps) {
  const router = useRouter();
  const media = useMediaLibrary(injectedLibrary);
  const { confirm, dialog: confirmDialog } = useConfirm();

  // --- the order -------------------------------------------------------------------------------------------------------
  // The agenda can grow here: the points made in the console join the talks.
  const [agenda, setAgenda] = useState(initialAgenda);
  const [cues, setCues] = useState<Readonly<Record<string, readonly StoredCue[]>>>(stored);
  const items = useMemo(() => buildRundown(agenda, cues, new Set(qrItems)), [agenda, cues, qrItems]);
  const queue = useMemo(() => queueOf(items), [items]);
  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const [playout, setPlayout] = useState<PlayoutState>(() => startOf(queueOf(buildRundown(initialAgenda, stored, new Set(qrItems)))));
  const playoutRef = useRef(playout);
  const [openItemId, setOpenItemId] = useState<string | null>(initialAgenda[0]?.id ?? null);
  // --- the layers: a counter and cards over the screen ---------------------------------------------------------------------------
  const [counter, setCounter] = useState<CounterState>(INITIAL_COUNTER);
  const counterRef = useRef(counter);
  useEffect(() => {
    counterRef.current = counter;
  }, [counter]);
  const [clock, setClock] = useState(() => Date.now());
  const [cardList, setCardList] = useState<readonly LayerCard[]>(initialCards);
  const cardsRef = useRef(cardList);
  useEffect(() => {
    cardsRef.current = cardList;
  }, [cardList]);
  const [shownCards, setShownCards] = useState<ReadonlySet<string>>(new Set());
  const hideTimers = useRef(new Map<string, number>());
  const [cardDialog, setCardDialog] = useState<{ key: number; cardId: string | null } | null>(null);

  // --- the music ---------------------------------------------------------------------------------------------------------------
  const [tracks, setTracks] = useState<readonly Track[]>(initialPlaylist);
  const tracksRef = useRef(tracks);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  const [music, setMusic] = useState<MusicState>(INITIAL_MUSIC);
  const [musicProgress, setMusicProgress] = useState<{ trackId: string; time: number; duration: number } | null>(null);
  const [musicBlocked, setMusicBlocked] = useState(false);
  const [musicEditing, setMusicEditing] = useState(false);
  const [musicDialog, setMusicDialog] = useState(false);
  const [audioFiles, setAudioFiles] = useState<readonly string[]>([]);
  // The music plays here, in the console's own window (the browser lets it play with the clicks made here); what the player
  // was last told, to know when a change needs a fade and when it is only a new volume.
  const player = useRef<MusicPlayerHandle>(null);
  const lastMusic = useRef<{ sig: string; volume: number } | null>({ sig: ":false", volume: INITIAL_MUSIC.volume });
  // The songs that have started to play: one that ends without ever doing so could not be read.
  const heardTracks = useRef(new Set<string>());
  const [pointDialog, setPointDialog] = useState<{ key: number; itemId: string | null } | null>(null);
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
  // Where the video on the air is, as the projector's window last said.
  const [progress, setProgress] = useState<{ cueId: string; time: number; duration: number } | null>(null);
  const musicRef = useRef(music);
  useEffect(() => {
    musicRef.current = music;
  }, [music]);
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
        if (isFileCue(file) && library && library.kind === "folder-input") {
          const found = await library.resolve(file.path);
          if (found.ok) sent = found.value;
        }
        channel.current?.post({ type: "program", cue: file, slide: state.slide, playing: state.playing, loop: state.loop, volume: state.volume, muted: state.muted, ...(sent ? { file: sent } : {}) });
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
      else if (before.slide !== next.slide || before.playing !== next.playing || before.loop !== next.loop || before.volume !== next.volume || before.muted !== next.muted) {
        channel.current?.post({ type: "transport", slide: next.slide, playing: next.playing, loop: next.loop, volume: next.volume, muted: next.muted });
      }
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
      } else if (message.type === "progress") {
        setProgress({ cueId: message.cueId, time: message.time, duration: message.duration });
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
  }, [openChannel, announce, alert]);

  // --- files that are not where the order says -------------------------------------------------------------------------
  const [missingInFolder, setMissingInFolder] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const library = media.library;
    if (!library || media.status !== "ready") return;
    let cancelled = false;
    (async () => {
      const found = new Set<string>();
      for (const entry of queue) {
        if (!isFileCue(entry.cue)) continue;
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
  const programFile = useResolvedFile(media.library, onAirFile && isFileCue(onAirFile) && onAirFile.kind !== "video" ? onAirFile : null, null, media.revision);
  const imageUrl = useObjectUrl(onAirFile?.kind === "image" && programFile.status === "ready" ? programFile.file : null);
  // The first page, picture or frame of the piece that comes next, for its monitor.
  const nextFile = useResolvedFile(media.library, nextCue && isFileCue(nextCue) ? nextCue : null, null, media.revision);
  const nextUrl = useObjectUrl(nextCue && isFileCue(nextCue) && nextCue.kind !== "slides" && nextFile.status === "ready" ? nextFile.file : null);

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
        case "toggleLoop":
          return commit(toggleLoop(state, q));
        case "mute":
          return commit(toggleMute(state));
        case "volume":
          return commit(setVolume(state, action.volume));
        case "restart":
          return channel.current?.post({ type: "seek", seconds: 0 });
        case "seek":
          return channel.current?.post({ type: "seek", seconds: action.seconds });
      }
    },
    [commit, onAirFile, pressKey, total],
  );

  // --- editing the order -------------------------------------------------------------------------------------------------------
  const save = useCallback(
    async (itemId: string, next: readonly StoredCue[], before: readonly StoredCue[]) => {
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

  async function addGoogleSlides(link: string, name: string): Promise<string | null> {
    const itemId = openItemId ?? agenda[0]?.id;
    if (!itemId) return t.alerts.saveFailed;
    const cue = googleSlidesCueFromLink(link, newCueId(), name);
    if (!cue) return t.picker.gslides.bad;
    const before = cues[itemId] ?? [];
    return (await save(itemId, [...before, cue], before)) ? null : t.alerts.saveFailed;
  }

  /**
   * «Cambiar carpeta»: the paths of the files belong to the folder they were added from, so a new folder takes them out
   * of the agenda (Google Slides decks, QR and scenes stay). The person is told first; nothing is removed unless the new
   * folder is really connected (closing the picker changes nothing).
   */
  async function changeFolder() {
    const fileCount = Object.values(cues).reduce((sum, list) => sum + list.filter(isFileCue).length, 0);
    const yes = await confirm({
      title: t.changeFolder.title,
      description: fileCount > 0 ? interpolate(t.changeFolder.description, { n: String(fileCount) }) : t.changeFolder.descriptionNone,
      confirmLabel: t.changeFolder.confirm,
      tone: fileCount > 0 ? "danger" : "default",
    });
    if (!yes || !(await media.connect())) return;
    if (fileCount === 0) return;

    // What was on the air from the old folder goes off, and what was read about it is forgotten.
    const onAir = mediaOnProgram(playoutRef.current, queueRef.current);
    if (onAir && isFileCue(onAir)) commit(stop(playoutRef.current));
    setSlides(new Map());
    setFailures(new Map());
    setMissingInFolder(new Set());
    for (const [itemId, list] of Object.entries(cues)) {
      const kept = list.filter((cue) => !isFileCue(cue));
      if (kept.length !== list.length) await save(itemId, kept, list);
    }
    alert(t.changeFolder.done);
  }

  /** Saves the cards; if they cannot be saved the list goes back to how it was. */
  async function saveCardList(next: readonly LayerCard[], before: readonly LayerCard[]): Promise<boolean> {
    if (!saveCards) return false;
    setCardList(next);
    const saved = await saveCards({ cards: next });
    if (!saved.ok) {
      setCardList(before);
      alert(t.layers.saveFailed);
    }
    return saved.ok;
  }

  function hideCard(cardId: string) {
    const timer = hideTimers.current.get(cardId);
    if (timer !== undefined) window.clearTimeout(timer);
    hideTimers.current.delete(cardId);
    setShownCards((current) => {
      if (!current.has(cardId)) return current;
      const next = new Set(current);
      next.delete(cardId);
      return next;
    });
  }

  function toggleCard(cardId: string) {
    if (shownCards.has(cardId)) return hideCard(cardId);
    const card = cardsRef.current.find((entry) => entry.id === cardId);
    if (!card) return;
    setShownCards((current) => new Set(current).add(cardId));
    // A card with seconds takes itself off.
    if (card.hideAfter) hideTimers.current.set(cardId, window.setTimeout(() => hideCard(cardId), card.hideAfter * 1000));
  }

  async function saveCard(draft: CardDraft): Promise<string | null> {
    const id = cardDialog?.cardId ?? null;
    const before = cardsRef.current;
    const current = id ? before.find((entry) => entry.id === id) : null;
    const place = current ? { x: current.x, y: current.y } : defaultPlaceOf(draft.kind);
    const card: LayerCard = { id: current?.id ?? newCueId(), ...draft, ...place };
    const next = current ? before.map((entry) => (entry.id === card.id ? card : entry)) : [...before, card];
    return (await saveCardList(next, before)) ? null : t.layers.saveFailed;
  }

  async function removeCard(cardId: string) {
    const card = cardsRef.current.find((entry) => entry.id === cardId);
    if (!card) return;
    const yes = await confirm({ title: t.layers.removeCardTitle, description: interpolate(t.layers.removeCardBody, { title: card.title }), confirmLabel: t.layers.removeCardConfirm, tone: "danger" });
    if (!yes) return;
    hideCard(cardId);
    const before = cardsRef.current;
    void saveCardList(before.filter((entry) => entry.id !== cardId), before);
  }

  /** Moves a layer while it is dragged; a card's new place is saved when the drag ends. */
  function moveLayer(target: LayerTarget, place: { x: number; y: number }) {
    if (target.type === "counter") return setCounter((current) => moveCounter(current, place));
    // The ref moves at once too: the place is saved when the drag ends, which can be in the same event as the last move.
    const moved = cardsRef.current.map((card) => (card.id === target.id ? { ...card, ...placeOf(place.x, place.y) } : card));
    cardsRef.current = moved;
    setCardList(moved);
  }

  function settleLayer(target: LayerTarget) {
    if (target.type === "card") void saveCards?.({ cards: cardsRef.current }).then((saved) => (saved.ok ? undefined : alert(t.layers.saveFailed)));
  }

  /** Saves the playlist; if it cannot be saved the list goes back to how it was. */
  async function saveTracks(next: readonly Track[], before: readonly Track[]): Promise<boolean> {
    if (!savePlaylist) return false;
    setTracks(next);
    const saved = await savePlaylist({ tracks: next });
    if (!saved.ok) {
      setTracks(before);
      alert(t.music.saveFailed);
    }
    return saved.ok;
  }

  async function addTrack(path: string): Promise<string | null> {
    const track = trackFromPath(path, newCueId());
    if (!track) return t.music.badPath;
    return (await saveTracks([...tracksRef.current, track], tracksRef.current)) ? null : t.music.saveFailed;
  }

  function removeTrack(trackId: string) {
    const before = tracksRef.current;
    setMusic((current) => forgetTrack(current, trackId));
    void saveTracks(before.filter((track) => track.id !== trackId), before);
  }

  function moveTrack(trackId: string, delta: -1 | 1) {
    const before = tracksRef.current;
    void saveTracks(moveCue(before, trackId, delta), before);
  }

  function openMusicDialog() {
    setMusicDialog(true);
    void media.library?.list().then((files) => setAudioFiles(files.filter(isAudioPath)));
  }

  /** Sets how long a piece stays on the air; once that time passes the console takes the next piece by itself. */
  function setCueSeconds(itemId: string, cueId: string, seconds: number | null) {
    const before = cues[itemId] ?? [];
    const cue = before.find((entry) => entry.id === cueId);
    if (!cue || (cue.seconds ?? null) === seconds) return;
    if (seconds !== null && !isSeconds(seconds)) return alert(t.alerts.badSeconds);
    void save(itemId, before.map((entry) => (entry.id === cueId ? withSeconds(entry, seconds) : entry)), before);
  }

  /** Saves a point from its dialog: a new one, one made here (everything), or a talk (only its minutes). */
  async function savePoint(draft: PointDraft): Promise<string | null> {
    if (!savePoints || !saveMinutes) return t.point.errors.save;
    const { talks, extras, minutes } = splitAgenda(agenda);
    const itemId = pointDialog?.itemId ?? null;
    const current = itemId ? agenda.find((point) => point.id === itemId) : null;
    let nextExtras = extras;
    const id = current?.id ?? newPointId(draft.title);
    if (!current || current.custom) {
      const point: ExtraPoint = { id, title: draft.title, who: draft.who, time: draft.time };
      nextExtras = current ? extras.map((entry) => (entry.id === id ? point : entry)) : [...extras, point];
      const saved = await savePoints({ points: nextExtras });
      if (!saved.ok) return t.point.errors.save;
    }
    const nextMinutes = { ...minutes };
    if (draft.minutes === null) delete nextMinutes[id];
    else nextMinutes[id] = draft.minutes;
    if ((minutes[id] ?? null) !== draft.minutes) {
      const planned = await saveMinutes({ itemId: id, minutes: draft.minutes });
      if (!planned.ok) return t.point.errors.save;
    }
    setAgenda(mergeAgenda(talks, nextExtras, nextMinutes));
    return null;
  }

  /** Takes a point made here out of the order, with its pieces; asks first. */
  async function removePoint(itemId: string) {
    const point = agenda.find((entry) => entry.id === itemId);
    if (!point || !point.custom || !savePoints || !saveMinutes) return;
    const files = (cues[itemId] ?? []).length;
    const yes = await confirm({
      title: t.point.removeTitle,
      description: interpolate(files > 0 ? t.point.removeBody : t.point.removeBodyEmpty, { title: point.title, n: String(files) }),
      confirmLabel: t.point.removeConfirm,
      tone: "danger",
    });
    if (!yes) return;
    const { talks, extras, minutes } = splitAgenda(agenda);
    const nextExtras = extras.filter((entry) => entry.id !== itemId);
    const saved = await savePoints({ points: nextExtras });
    if (!saved.ok) return alert(t.point.errors.save);
    // What was on the air or waiting from this point lets go of it, and its pieces and minutes are cleared with it.
    for (const cue of cues[itemId] ?? []) commit(forget(playoutRef.current, queueRef.current, cue.id));
    if (files > 0) await save(itemId, [], cues[itemId] ?? []);
    if (minutes[itemId]) await saveMinutes({ itemId, minutes: null });
    const rest = { ...minutes };
    delete rest[itemId];
    setAgenda(mergeAgenda(talks, nextExtras, rest));
    setOpenItemId((open) => (open === itemId ? null : open));
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
    void media.library?.list().then((files) => setPickerFiles(files.filter(isMediaPath)));
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
  const liveStatus = onAirFile?.kind === "video" ? (playout.playing ? t.program.playing : t.program.paused) : onAirFile?.kind === "gslides" ? t.program.googleSlides : onAirFile?.kind === "slides" && total > 0 ? interpolate(t.program.slide, { n: String(playout.slide), total: String(total) }) : onAirFile ? t.program.loading : sceneOnAir || qrOnAir ? t.program.sceneStatus : undefined;
  const videoPlaying = onAirFile?.kind === "video" && playout.playing;

  // --- the music: tell the player what to do ----------------------------------------------------------------------------------------
  const onMusicProgress = useCallback((trackId: string, time: number, duration: number) => {
    heardTracks.current.add(trackId);
    setMusicProgress({ trackId, time, duration });
  }, []);
  const onMusicEnded = useCallback(
    (trackId: string) => {
      const current = musicRef.current;
      if (current.trackId !== trackId) return;
      if (!heardTracks.current.has(trackId)) {
        // It never played: say so, and go on without repeating, so a missing file cannot make the list loop for ever.
        const missing = tracksRef.current.find((track) => track.id === trackId);
        if (missing) alert(interpolate(t.music.failed, { name: missing.name }));
        setMusic(nextTrack({ ...current, repeat: "off" }, tracksRef.current, true));
      } else {
        heardTracks.current.delete(trackId);
        setMusic(nextTrack(current, tracksRef.current, true));
      }
    },
    [alert],
  );

  const sounding = soundingOf(music, videoPlaying);
  useEffect(() => {
    const track = tracks.find((entry) => entry.id === music.trackId) ?? null;
    const sig = `${track?.id ?? ""}:${sounding}`;
    const before = lastMusic.current;
    if (before && before.sig === sig && before.volume === music.volume) return;
    // A song that starts, stops or changes fades; a new volume only moves, at once.
    const fadeMs = before && before.sig !== sig ? music.fadeSeconds * 1000 : 0;
    lastMusic.current = { sig, volume: music.volume };
    player.current?.apply({ track, playing: sounding, volume: music.volume, fadeMs });
  }, [music.trackId, music.volume, music.fadeSeconds, sounding, tracks]);

  // --- the counter runs, and at zero it stops (and may take the next piece) -----------------------------------------------------------
  const counterRunning = isRunning(counter);
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);
  useEffect(() => {
    if (!counterRunning) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setClock(now);
      const current = counterRef.current;
      if (isRunning(current) && remainingOf(current, now) <= 0) {
        // The ref is updated now, so the next tick cannot finish it a second time before the screen is drawn again.
        const done = finishCounter(current);
        counterRef.current = done;
        setCounter(done);
        if (current.onZero === "next") runRef.current({ type: "forward" });
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [counterRunning]);
  const counterLeft = remainingOf(counter, clock);

  // The whole picture of the layers goes to the screen each time one changes, and again when the screen (re)connects.
  useEffect(() => {
    channel.current?.post({ type: "layers", counter: counterWire(counter, Date.now()), cards: cardList.filter((card) => shownCards.has(card.id)).map(cardWire) });
  }, [counter, cardList, shownCards, connected]);

  // --- a piece with seconds takes the next one by itself ----------------------------------------------------------------------------
  const secondsOnAir = onAirFile?.seconds ?? null;
  const timerKey = onAirFile ? `${onAirFile.id}:${playout.slide}` : "";
  const counting = secondsOnAir !== null && (onAirFile?.kind !== "video" || playout.playing);
  const [tick, setTick] = useState<{ key: string; ms: number }>({ key: "", ms: 0 });
  const firedFor = useRef("");
  useEffect(() => {
    if (!counting) return;
    const timer = window.setInterval(() => setTick((before) => (before.key === timerKey ? { key: timerKey, ms: before.ms + 250 } : { key: timerKey, ms: 250 })), 250);
    return () => window.clearInterval(timer);
  }, [counting, timerKey]);
  const elapsedMs = tick.key === timerKey ? tick.ms : 0;
  const secondsLeft = secondsOnAir === null ? null : Math.max(0, Math.ceil((secondsOnAir * 1000 - elapsedMs) / 1000));
  useEffect(() => {
    if (secondsOnAir === null || elapsedMs < secondsOnAir * 1000 || firedFor.current === timerKey) return;
    // Once per piece (and per slide): if there is nothing after it, it simply stays.
    firedFor.current = timerKey;
    run({ type: "forward" });
  }, [elapsedMs, secondsOnAir, timerKey, run]);
  const failedOnAir = onAirFile && failures.has(onAirFile.id);

  const deckIcon = (key: DeckKeyId) =>
    key === "ranking" ? <Icon name="trophy" size={24} /> : key === "poll" ? <Icon name="poll" size={24} /> : key === "reveal" ? <Icon name="medal" size={24} /> : key === "raffle" ? <Icon name="gift" size={24} /> : key === "qr" ? <Icon name="qr" size={24} /> : key === "waiting" ? <ConsoleIcon name="clock" size={24} /> : key === "freeze" ? <ConsoleIcon name="freeze" size={24} /> : <ConsoleIcon name="eye" size={24} />;

  const firstSlides = onAirFile?.kind === "slides" && total > 1 ? slideWindow(playout.slide, total) : [];

  return (
    <div className="bg-background text-foreground fixed inset-0 flex min-w-[320px] flex-col overflow-auto">
      <header className="bg-surface border-ink gap-space-4 flex min-h-16 shrink-0 flex-wrap items-center border-b-2 px-5 py-2">
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
          {media.status !== "none" && media.folder ? <span className="text-muted-foreground font-mono text-xs">{media.folder}</span> : null}
          {media.status === "none" || !media.folder ? (
            <button type="button" onClick={() => setSetupManual(true)} className="underline">
              {t.folderConnect}
            </button>
          ) : (
            <button type="button" onClick={() => void changeFolder()} className="focus-visible:ring-ring rounded-sm underline focus-visible:ring-[3px] focus-visible:outline-none">
              {t.folderChange}
            </button>
          )}
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

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 lg:flex-row lg:overflow-hidden">
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
          onSeconds={setCueSeconds}
          onAddPoint={savePoints && saveMinutes ? () => setPointDialog({ key: Date.now(), itemId: null }) : undefined}
          onEditPoint={savePoints && saveMinutes ? (itemId) => setPointDialog({ key: Date.now(), itemId }) : undefined}
          onRemovePoint={savePoints && saveMinutes ? (itemId) => void removePoint(itemId) : undefined}
        />

        <div className="gap-space-4 flex min-w-0 flex-1 flex-col lg:overflow-y-auto">
          <div className="gap-space-4 flex flex-col md:flex-row">
            <ConsoleMonitor
              tone="live"
              tag={t.rundown.live}
              label={t.program.label}
              title={failedOnAir ? t.program.failed : liveTitle}
              status={secondsLeft !== null && counting ? `${liveStatus ? `${liveStatus} · ` : ""}${interpolate(t.program.autoIn, { n: String(secondsLeft) })}` : liveStatus}
              className="md:flex-[1.5]"
              overlay={
                saveCards && (counter.visible || shownCards.size > 0) ? (
                  <LayerHandles
                    counter={counter.visible ? { x: counter.x, y: counter.y, size: counter.size } : null}
                    cards={cardList.filter((card) => shownCards.has(card.id))}
                    onMove={moveLayer}
                    onMoveEnd={settleLayer}
                  />
                ) : undefined
              }
              icon={sceneOnAir || qrOnAir || !onAirFile ? <Icon name={qrOnAir ? "qr" : "stage"} size={44} /> : onAirFile.kind === "video" ? <ConsoleIcon name="video" size={44} /> : <ConsoleIcon name="slides" size={44} />}
              preview={
                onAirFile?.kind === "slides" && programFile.status === "ready" ? (
                  <SlideCanvas file={programFile.file} page={playout.slide} label={onAirFile.name} onLoaded={(pages) => setSlides((before) => new Map(before).set(onAirFile.id, pages))} onFailed={() => alert(t.program.failed)} />
                ) : onAirFile?.kind === "image" && imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt={onAirFile.name} className="size-full object-contain" />
                ) : (
                  // Anything else (a video, a Google Slides deck, the ranking, the QR, the waiting screen) is the screen's own page.
                  <StageThumbnail src={`${hrefs.screen}?vista=previa`} label={t.program.mirror} />
                )
              }
            />
            <ConsoleMonitor
              tone="next"
              tag={t.rundown.next}
              label={t.program.next}
              title={nextCue ? nextCue.name : t.program.nothingNext}
              className="md:flex-1 md:self-start"
              preview={
                nextCue && isFileCue(nextCue) && nextCue.kind === "slides" && nextFile.status === "ready" ? (
                  <SlideCanvas file={nextFile.file} page={1} label={t.program.nextPreview} />
                ) : nextCue && isFileCue(nextCue) && nextCue.kind === "image" && nextUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={nextUrl} alt={nextCue.name} className="size-full object-contain" />
                ) : nextCue && isFileCue(nextCue) && nextCue.kind === "video" && nextUrl ? (
                  // The first frame: the video is not played, only its beginning is loaded.
                  <video src={`${nextUrl}#t=0.1`} aria-label={nextCue.name} muted playsInline preload="metadata" className="size-full object-contain" />
                ) : undefined
              }
              icon={nextCue?.kind === "video" ? <ConsoleIcon name="video" size={36} /> : nextCue?.kind === "slides" ? <ConsoleIcon name="slides" size={36} /> : nextCue?.kind === "image" ? <Icon name="image" size={36} /> : <Icon name="qr" size={36} />}
            />
          </div>

          <div className="bg-surface border-ink gap-space-3 flex shrink-0 flex-wrap items-center rounded-lg border-2 px-3.5 py-2.5">
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

          {onAirFile?.kind === "video" ? (
            <VideoControls
              loop={playout.loop}
              muted={playout.muted}
              volume={playout.volume}
              progress={progress && progress.cueId === onAirFile.id ? progress : null}
              onRestart={() => run({ type: "restart" })}
              onToggleLoop={() => run({ type: "toggleLoop" })}
              onToggleMute={() => run({ type: "mute" })}
              onVolume={(volume) => run({ type: "volume", volume })}
              onSeek={(seconds) => run({ type: "seek", seconds })}
            />
          ) : null}

          {savePlaylist ? (
            <MusicPanel
              tracks={tracks}
              music={music}
              progress={musicProgress}
              blocked={musicBlocked && sounding}
              ducked={music.playing && music.duck && videoPlaying}
              editing={musicEditing}
              onToggleEditing={() => setMusicEditing((current) => !current)}
              onAdd={openMusicDialog}
              onPlay={(trackId) => setMusic((current) => playTrack(current, tracksRef.current, trackId))}
              onTogglePlayback={() => setMusic((current) => togglePlayback(current, tracksRef.current))}
              onPrevious={() => setMusic((current) => previousTrack(current, tracksRef.current))}
              onNext={() => setMusic((current) => nextTrack(current, tracksRef.current))}
              onStop={() => setMusic(stopMusic)}
              onSeek={(seconds) => player.current?.seek(seconds)}
              onUnlock={() => player.current?.retry()}
              onVolume={(volume) => setMusic((current) => setMusicVolume(current, volume))}
              onRepeat={() => setMusic(cycleRepeat)}
              onFade={(seconds) => setMusic((current) => setFadeSeconds(current, seconds))}
              onDuck={() => setMusic(toggleDuck)}
              onMove={moveTrack}
              onRemove={removeTrack}
            />
          ) : null}

          {saveCards ? (
            <LayersPanel
              counter={counter}
              remainingMs={counterLeft}
              cards={cardList}
              shown={shownCards}
              onToggleCounter={() => setCounter((current) => showCounter(current, !current.visible))}
              onStartPause={() => setCounter((current) => (isRunning(current) ? pauseCounter(current, Date.now()) : startCounter(current, Date.now())))}
              onReset={() => setCounter(resetCounter)}
              onAddMinute={() => setCounter((current) => addCounterTime(current, Date.now(), 60_000))}
              onDuration={(text) => {
                const ms = parseDuration(text);
                if (ms === null) {
                  alert(t.layers.badTime);
                  return false;
                }
                setCounter((current) => setCounterDuration(current, ms));
                return true;
              }}
              onSize={(size: CounterSize) => setCounter((current) => setCounterSize(current, size))}
              onPlace={(name: PlaceName) => setCounter((current) => moveCounter(current, PLACES[name]))}
              onLabel={(label) => setCounter((current) => setCounterLabel(current, label))}
              onZero={(onZero: OnZero) => setCounter((current) => setOnZero(current, onZero))}
              onToggleCard={toggleCard}
              onNewCard={() => setCardDialog({ key: Date.now(), cardId: null })}
              onEditCard={(cardId) => setCardDialog({ key: Date.now(), cardId })}
              onRemoveCard={(cardId) => void removeCard(cardId)}
            />
          ) : null}

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

          <section aria-label={t.deck.title} className="gap-space-2 flex min-h-[13rem] flex-1 flex-col">
            <div className="flex items-baseline gap-3">
              <h2 className="type-pixel-heading text-text-subtle">{t.deck.title}</h2>
              <p className="type-caption text-text-subtle">{t.deck.hint}</p>
            </div>
            <div className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] auto-rows-[minmax(5.5rem,1fr)] gap-3">
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
                  <button key={key} type="button" disabled={disabled} onClick={() => run({ type: "deck", key })} aria-pressed={isLive || isArmed} className={cn("bg-surface focus-visible:ring-ring flex min-h-[5.5rem] flex-col justify-between gap-2 rounded-lg border-2 p-3 text-left focus-visible:ring-[3px] focus-visible:outline-none", isLive ? "border-danger ring-danger ring-2" : isArmed ? "border-gold" : "border-ink", disabled && "opacity-55")}>
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
        onAddGoogleSlides={addGoogleSlides}
      />
      {pointDialog ? (
        <PointDialog
          key={pointDialog.key}
          open
          onOpenChange={(open) => {
            if (!open) setPointDialog(null);
          }}
          point={(() => {
            const found = pointDialog.itemId ? agenda.find((entry) => entry.id === pointDialog.itemId) : null;
            return found ? { title: found.title, who: found.who, time: found.time, minutes: found.minutes ?? null, custom: found.custom === true } : null;
          })()}
          onSave={savePoint}
        />
      ) : null}
      {savePlaylist ? <MusicPlayer handleRef={player} library={media.library} revision={media.revision} onProgress={onMusicProgress} onEnded={onMusicEnded} onBlocked={setMusicBlocked} /> : null}
      {cardDialog ? (
        <CardDialog
          key={cardDialog.key}
          open
          onOpenChange={(open) => {
            if (!open) setCardDialog(null);
          }}
          card={cardDialog.cardId ? (cardList.find((entry) => entry.id === cardDialog.cardId) ?? null) : null}
          onSave={saveCard}
        />
      ) : null}
      <MusicDialog
        open={musicDialog}
        onOpenChange={setMusicDialog}
        files={audioFiles}
        added={new Set(tracks.map((track) => track.path))}
        folderReady={media.status === "ready"}
        onConnect={() => void media.connect().then(() => media.library?.list().then((files) => setAudioFiles(files.filter(isAudioPath))))}
        onAdd={addTrack}
      />
      {confirmDialog}
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
