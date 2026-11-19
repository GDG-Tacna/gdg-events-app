"use client";

import { useEffect, useState } from "react";
import type { MediaLibrary, ResolveError } from "../data/client/media-library";
import type { MediaCue } from "../domain/rundown";

/** An address for a file on this computer, valid while the component is shown; it is released afterwards. */
export function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return;
    const made = URL.createObjectURL(file);
    // The address is created in the browser, so it can only be held in state once the effect runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(made);
    return () => {
      URL.revokeObjectURL(made);
      setUrl(null);
    };
  }, [file]);
  return file ? url : null;
}

export type ResolvedFile = { status: "loading" } | { status: "ready"; file: File } | { status: "failed"; reason: ResolveError };

/**
 * The file of a piece, read from the connected folder (or taken from a file the console sent along when the browser
 * cannot remember the folder). `refresh` changes when the library's state does, so a granted permission reads again.
 */
export function useResolvedFile(library: MediaLibrary | null, cue: Pick<MediaCue, "id" | "path"> | null, sent: File | null = null, refresh = 0): ResolvedFile {
  const [result, setResult] = useState<{ key: string; value: ResolvedFile } | null>(null);
  const key = cue ? `${cue.id}:${cue.path}:${refresh}:${sent ? "sent" : ""}` : "";
  useEffect(() => {
    if (!cue) return;
    let cancelled = false;
    const done = (value: ResolvedFile) => {
      if (!cancelled) setResult({ key, value });
    };
    if (sent) {
      done({ status: "ready", file: sent });
    } else if (!library) {
      done({ status: "failed", reason: "no-library" });
    } else {
      library.resolve(cue.path).then((found) => done(found.ok ? { status: "ready", file: found.value } : { status: "failed", reason: found.error }));
    }
    return () => {
      cancelled = true;
    };
    // `key` carries everything the read depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, library]);
  if (!cue) return { status: "loading" };
  return result?.key === key ? result.value : { status: "loading" };
}
