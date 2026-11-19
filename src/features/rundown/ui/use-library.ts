"use client";

import { useCallback, useEffect, useState } from "react";
import { createMediaLibrary, type LibraryStatus, type MediaLibrary } from "../data/client/media-library";

export interface LibraryView {
  /** `null` until the browser has been reached (it is made on the client only). */
  library: MediaLibrary | null;
  status: LibraryStatus;
  folder: string | null;
  /** Changes whenever the library's state does, so what was read before is read again. */
  revision: number;
  /** Opens the browser's folder picker. Call it from a click. Answers `true` when a folder was connected (not when the picker was closed). */
  connect: () => Promise<boolean>;
  /** Asks the browser for permission to read the remembered folder. Call it from a click. */
  allow: () => Promise<void>;
}

/**
 * The folder of files on this computer, as a screen needs it: whether one is connected, whether the browser still lets it
 * be read, and how to connect or allow it. The state is read again when the window gets focus back, because the person
 * may have changed the permission in the browser meanwhile.
 */
export function useMediaLibrary(injected?: MediaLibrary): LibraryView {
  const [library, setLibrary] = useState<MediaLibrary | null>(injected ?? null);
  const [status, setStatus] = useState<LibraryStatus>("none");
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(async (target: MediaLibrary) => {
    const next = await target.status();
    setStatus((before) => {
      if (before !== next) setRevision((count) => count + 1);
      return next;
    });
  }, []);

  useEffect(() => {
    const made = injected ?? createMediaLibrary();
    // The library needs the browser, so it is made here and held in state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLibrary(made);
    void refresh(made);
    const onFocus = () => void refresh(made);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [injected, refresh]);

  const connect = useCallback(async () => {
    if (!library) return false;
    const connected = await library.connect();
    await refresh(library);
    setRevision((count) => count + 1);
    return connected.ok;
  }, [library, refresh]);

  const allow = useCallback(async () => {
    if (!library) return;
    await library.reconnect();
    await refresh(library);
    setRevision((count) => count + 1);
  }, [library, refresh]);

  return { library, status, folder: library?.folderName() ?? null, revision, connect, allow };
}
