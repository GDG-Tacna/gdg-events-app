import { NAME_MAX, isAudioPath, nameFromPath } from "./rundown";

/**
 * The music of the event: a playlist of songs from the same folder as the pieces. Like a piece, a song is never stored
 * as a file, only where it is. The playlist and what plays are kept apart: the console owns the order and the state, the
 * projector's window only plays the one song it is told to. Pure: every operation answers a new state.
 */
export const TRACKS_MAX = 100;
export const FADE_MAX_SECONDS = 10;
const TRACK_ID = /^[A-Za-z0-9_-]{4,40}$/;

export interface Track {
  id: string;
  name: string;
  /** Relative to the connected folder, with forward slashes. */
  path: string;
}

/** A song from stored or submitted data, or `null` when any field breaks the rules. */
export function parseTrack(input: unknown): Track | null {
  if (typeof input !== "object" || input === null) return null;
  const data = input as Record<string, unknown>;
  if (typeof data.id !== "string" || !TRACK_ID.test(data.id) || !isAudioPath(data.path) || typeof data.name !== "string") return null;
  const name = data.name.trim();
  if (name.length === 0 || name.length > NAME_MAX) return null;
  return { id: data.id, name, path: data.path };
}

/** A playlist, or `null` when it is too long, repeats an id or a path, or holds anything invalid. */
export function parseTracks(input: unknown): Track[] | null {
  if (!Array.isArray(input) || input.length > TRACKS_MAX) return null;
  const tracks: Track[] = [];
  for (const entry of input) {
    const track = parseTrack(entry);
    if (!track || tracks.some((other) => other.id === track.id)) return null;
    tracks.push(track);
  }
  return tracks;
}

/** A new song from a path, named after its file; `null` when the path is not a song the browser can play. */
export function trackFromPath(path: string, id: string): Track | null {
  return isAudioPath(path) && TRACK_ID.test(id) ? { id, name: nameFromPath(path), path } : null;
}

export type RepeatMode = "off" | "all" | "one";
export const REPEAT_MODES: readonly RepeatMode[] = ["off", "all", "one"];

export interface MusicState {
  /** The song that is loaded (playing or paused), or `null` when none is. */
  trackId: string | null;
  playing: boolean;
  /** From 0 to 1. */
  volume: number;
  repeat: RepeatMode;
  /** The seconds a song takes to fade in or out when it starts, stops or changes (0: no fade). */
  fadeSeconds: number;
  /** Whether the music fades out while a video plays, and comes back after it. */
  duck: boolean;
}

export const INITIAL_MUSIC: MusicState = { trackId: null, playing: false, volume: 0.8, repeat: "all", fadeSeconds: 2, duck: true };

const indexOf = (tracks: readonly Track[], trackId: string | null) => (trackId === null ? -1 : tracks.findIndex((track) => track.id === trackId));

/** Plays a song from its start; with none given, the loaded one, or else the first of the list. An unknown song changes nothing. */
export function playTrack(state: MusicState, tracks: readonly Track[], trackId?: string): MusicState {
  const wanted = trackId ?? (indexOf(tracks, state.trackId) >= 0 ? state.trackId : (tracks[0]?.id ?? null));
  return wanted !== null && indexOf(tracks, wanted) >= 0 ? { ...state, trackId: wanted, playing: true } : state;
}

/** Plays or pauses the loaded song (the first one if none is loaded). */
export function togglePlayback(state: MusicState, tracks: readonly Track[]): MusicState {
  return state.playing ? { ...state, playing: false } : playTrack(state, tracks);
}

/** Stops the music and unloads the song. */
export const stopMusic = (state: MusicState): MusicState => ({ ...state, trackId: null, playing: false });

/**
 * The song after the loaded one. `auto` is a song that ended by itself: it honours «repetir una» and, at the end of the
 * list, stops unless the list repeats. The operator's own «siguiente» always moves on (and wraps around).
 */
export function nextTrack(state: MusicState, tracks: readonly Track[], auto = false): MusicState {
  if (tracks.length === 0) return state;
  const index = indexOf(tracks, state.trackId);
  if (auto && state.repeat === "one" && index >= 0) return { ...state, playing: true };
  const following = tracks[index + 1];
  if (following) return { ...state, trackId: following.id, playing: state.playing || auto };
  if (auto && state.repeat === "off") return { ...state, playing: false };
  return { ...state, trackId: tracks[0].id, playing: state.playing || auto };
}

/** The song before the loaded one, wrapping around to the last. */
export function previousTrack(state: MusicState, tracks: readonly Track[]): MusicState {
  if (tracks.length === 0) return state;
  const index = indexOf(tracks, state.trackId);
  const before = tracks[index <= 0 ? tracks.length - 1 : index - 1];
  return { ...state, trackId: before.id, playing: state.playing };
}

export function setMusicVolume(state: MusicState, volume: number): MusicState {
  return Number.isFinite(volume) ? { ...state, volume: Math.round(Math.min(1, Math.max(0, volume)) * 100) / 100 } : state;
}

export function setFadeSeconds(state: MusicState, seconds: number): MusicState {
  return Number.isInteger(seconds) && seconds >= 0 && seconds <= FADE_MAX_SECONDS ? { ...state, fadeSeconds: seconds } : state;
}

/** off → all → one → off. */
export const cycleRepeat = (state: MusicState): MusicState => ({ ...state, repeat: REPEAT_MODES[(REPEAT_MODES.indexOf(state.repeat) + 1) % REPEAT_MODES.length] });

export const toggleDuck = (state: MusicState): MusicState => ({ ...state, duck: !state.duck });

/** A song was taken out of the list: if it was the loaded one, the music lets go of it (and stops). */
export function forgetTrack(state: MusicState, trackId: string): MusicState {
  return state.trackId === trackId ? { ...state, trackId: null, playing: false } : state;
}

/** Whether the music is really sounding: it is set to play and no video is taking the sound. */
export const soundingOf = (state: MusicState, videoPlaying: boolean): boolean => state.playing && state.trackId !== null && !(state.duck && videoPlaying);
