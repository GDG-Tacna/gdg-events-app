import { err, ok, type Result } from "@/shared/lib/result";
import { isMediaPath, kindOfPath } from "../../domain/rundown";

/**
 * The folder with the event's files, on the operator's own computer. The browser cannot read a path somebody typed, so
 * the operator connects the folder once (the browser's own picker) and the pieces keep only their path inside it. Nothing
 * is uploaded: a file is read from the folder when it is needed.
 *
 * Two ways to hold the folder: the File System Access API (Chrome and Edge), which remembers it between visits, and a
 * plain folder input (any browser), which holds it only while the page is open.
 */
export type LibraryStatus = "none" | "needs-permission" | "ready";
export type ResolveError = "missing" | "denied" | "no-library" | "unsupported-path";

export interface MediaLibrary {
  readonly kind: "folder-access" | "folder-input";
  /** The folder's name, for showing, or `null` while none is connected. */
  folderName(): string | null;
  status(): Promise<LibraryStatus>;
  /** Opens the browser's folder picker. Must be called from a click. */
  connect(): Promise<Result<void, "cancelled" | "unsupported" | "unknown">>;
  /** Asks the browser for permission to read the folder remembered from before; `true` when it is granted. */
  reconnect(): Promise<boolean>;
  /** The file at a path inside the folder. */
  resolve(path: string): Promise<Result<File, ResolveError>>;
  /** Every file in the folder the console can show, as paths, sorted. */
  list(): Promise<readonly string[]>;
}

// --- The parts of the File System Access API the console uses (the DOM types do not carry them all) -------------------
export interface FileHandleLike {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
}
export interface DirectoryHandleLike {
  kind: "directory";
  name: string;
  getDirectoryHandle(name: string): Promise<DirectoryHandleLike>;
  getFileHandle(name: string): Promise<FileHandleLike>;
  values(): AsyncIterable<DirectoryHandleLike | FileHandleLike>;
  queryPermission?(descriptor: { mode: "read" }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: "read" }): Promise<PermissionState>;
}
export type DirectoryPicker = () => Promise<DirectoryHandleLike>;

/** Keeps the folder's handle between visits (IndexedDB), shared by every window of the app. */
export interface HandleStore {
  get(): Promise<DirectoryHandleLike | null>;
  set(handle: DirectoryHandleLike): Promise<void>;
  clear(): Promise<void>;
}

/** At most this many files are listed, and folders are walked this deep: a whole disk is not an event's folder. */
const LIST_MAX = 3000;
const DEPTH_MAX = 6;

const errorName = (cause: unknown) => (typeof cause === "object" && cause !== null ? (cause as { name?: unknown }).name : undefined);

export function createFolderAccessLibrary({ picker, handles }: { picker: DirectoryPicker; handles: HandleStore }): MediaLibrary {
  let root: DirectoryHandleLike | null = null;
  let loaded = false;

  async function current(): Promise<DirectoryHandleLike | null> {
    if (!loaded) {
      root = await handles.get().catch(() => null);
      loaded = true;
    }
    return root;
  }

  async function permission(handle: DirectoryHandleLike): Promise<PermissionState> {
    return handle.queryPermission ? handle.queryPermission({ mode: "read" }) : "granted";
  }

  return {
    kind: "folder-access",
    folderName: () => root?.name ?? null,

    async status() {
      const handle = await current();
      if (!handle) return "none";
      return (await permission(handle).catch(() => "denied" as const)) === "granted" ? "ready" : "needs-permission";
    },

    async connect() {
      try {
        const handle = await picker();
        root = handle;
        loaded = true;
        await handles.set(handle).catch(() => undefined);
        return ok(undefined);
      } catch (cause) {
        // The person closed the picker: not an error.
        return errorName(cause) === "AbortError" ? err("cancelled") : err("unknown");
      }
    },

    async reconnect() {
      const handle = await current();
      if (!handle) return false;
      if ((await permission(handle).catch(() => "denied")) === "granted") return true;
      return handle.requestPermission ? (await handle.requestPermission({ mode: "read" }).catch(() => "denied")) === "granted" : false;
    },

    async resolve(path) {
      if (!isMediaPath(path)) return err("unsupported-path");
      const handle = await current();
      if (!handle) return err("no-library");
      if ((await permission(handle).catch(() => "denied")) !== "granted") return err("denied");
      try {
        const segments = path.split("/");
        let directory = handle;
        for (const segment of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(segment);
        const file = await (await directory.getFileHandle(segments.at(-1) ?? "")).getFile();
        return ok(file);
      } catch (cause) {
        const name = errorName(cause);
        // A name that does not exist, or one that is a folder where a file was expected, is a missing file.
        return name === "NotAllowedError" || name === "SecurityError" ? err("denied") : err("missing");
      }
    },

    async list() {
      const handle = await current();
      if (!handle || (await permission(handle).catch(() => "denied")) !== "granted") return [];
      const found: string[] = [];
      async function walk(directory: DirectoryHandleLike, prefix: string, depth: number): Promise<void> {
        if (depth > DEPTH_MAX) return;
        for await (const entry of directory.values()) {
          if (found.length >= LIST_MAX) return;
          if (entry.kind === "directory") await walk(entry, `${prefix}${entry.name}/`, depth + 1);
          else if (kindOfPath(entry.name) !== null) found.push(`${prefix}${entry.name}`);
        }
      }
      try {
        await walk(handle, "", 0);
      } catch {
        // A folder that cannot be read leaves what was found so far.
      }
      return found.sort((a, b) => a.localeCompare(b, "es"));
    },
  };
}

/** The folder held in memory from a picker that gives every file of it (a folder input), for browsers without the API. */
export function createFolderInputLibrary(pickFiles: () => Promise<readonly File[]>): MediaLibrary {
  const files = new Map<string, File>();
  let folder: string | null = null;

  return {
    kind: "folder-input",
    folderName: () => folder,
    async status() {
      return files.size > 0 ? "ready" : "none";
    },
    async connect() {
      try {
        const picked = await pickFiles();
        if (picked.length === 0) return err("cancelled");
        files.clear();
        for (const file of picked) {
          // `webkitRelativePath` is `folder/sub/file.pdf`: the folder's own name is not part of the path inside it.
          const [first, ...rest] = (file.webkitRelativePath || file.name).split("/");
          if (rest.length === 0) {
            files.set(first, file);
          } else {
            folder = first;
            files.set(rest.join("/"), file);
          }
        }
        return ok(undefined);
      } catch {
        return err("unknown");
      }
    },
    async reconnect() {
      return files.size > 0;
    },
    async resolve(path) {
      if (!isMediaPath(path)) return err("unsupported-path");
      if (files.size === 0) return err("no-library");
      const file = files.get(path);
      return file ? ok(file) : err("missing");
    },
    async list() {
      return [...files.keys()].filter((path) => kindOfPath(path) !== null).sort((a, b) => a.localeCompare(b, "es")).slice(0, LIST_MAX);
    },
  };
}

// --- The browser's own pieces, in one place so everything above can be tested without a browser -----------------------

const DB_NAME = "devfest-console";
const STORE_NAME = "handles";
const HANDLE_KEY = "media-folder";

export function createHandleStore(factory: IDBFactory = indexedDB): HandleStore {
  function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = action(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }
  return {
    async get() {
      return ((await run("readonly", (store) => store.get(HANDLE_KEY))) as DirectoryHandleLike | undefined) ?? null;
    },
    async set(handle) {
      await run("readwrite", (store) => store.put(handle, HANDLE_KEY));
    },
    async clear() {
      await run("readwrite", (store) => store.delete(HANDLE_KEY));
    },
  };
}

/** Whether this browser can remember a folder between visits. */
export const canRememberFolder = () => typeof window !== "undefined" && typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";

/** A folder input opened from a click, answering the files the person picked. */
function pickFromFolderInput(): Promise<readonly File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

/** The library this browser can hold: the remembered folder where the API exists, the plain folder input elsewhere. */
export function createMediaLibrary(): MediaLibrary {
  if (canRememberFolder()) {
    const picker = (window as unknown as { showDirectoryPicker: (options: { mode: "read" }) => Promise<DirectoryHandleLike> }).showDirectoryPicker;
    return createFolderAccessLibrary({ picker: () => picker.call(window, { mode: "read" }), handles: createHandleStore() });
  }
  return createFolderInputLibrary(pickFromFolderInput);
}
