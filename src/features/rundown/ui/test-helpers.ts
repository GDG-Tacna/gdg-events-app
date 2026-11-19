import { vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import type { LibraryStatus, MediaLibrary } from "../data/client/media-library";
import { openStageChannel, type ChannelLike, type StageChannel } from "../data/client/stage-channel";
import { isMediaPath } from "../domain/rundown";

/** Two ends of one channel, like two windows of a browser: what one posts the other hears, never itself. */
export function channelPair(): { console: StageChannel; stage: StageChannel } {
  const ends: Array<Set<(event: { data: unknown }) => void>> = [new Set(), new Set()];
  const make = (index: number) => (): ChannelLike => ({
    postMessage: (message) => ends[1 - index].forEach((listener) => listener({ data: message })),
    addEventListener: (_type, listener) => void ends[index].add(listener),
    removeEventListener: (_type, listener) => void ends[index].delete(listener),
    close: () => ends[index].clear(),
  });
  return { console: openStageChannel(make(0))!, stage: openStageChannel(make(1))! };
}

/** A library over a fixed set of files, with a status the test can change. */
export function fakeLibrary(files: Record<string, File> = {}, initial: LibraryStatus = "ready") {
  let status: LibraryStatus = initial;
  const state = {
    status: () => status,
    set: (next: LibraryStatus) => void (status = next),
    files,
  };
  const library: MediaLibrary = {
    kind: "folder-access",
    folderName: () => (status === "none" ? null : "archivos"),
    status: async () => status,
    connect: vi.fn(async () => {
      status = "ready";
      return ok(undefined);
    }),
    reconnect: vi.fn(async () => {
      status = "ready";
      return true;
    }),
    resolve: async (path) => {
      if (!isMediaPath(path)) return err("unsupported-path");
      if (status === "none") return err("no-library");
      if (status === "needs-permission") return err("denied");
      return files[path] ? ok(files[path]) : err("missing");
    },
    list: async () => Object.keys(files).sort(),
  };
  return { library, ...state };
}

export const pdf = (name = "keynote.pdf") => new File(["%PDF"], name, { type: "application/pdf" });
export const mp4 = (name = "video.mp4") => new File(["video"], name, { type: "video/mp4" });
export const png = (name = "portada.png") => new File(["png"], name, { type: "image/png" });
