import { describe, expect, it, vi } from "vitest";
import { createFolderAccessLibrary, createFolderInputLibrary, type DirectoryHandleLike, type FileHandleLike, type HandleStore } from "./media-library";

const file = (name: string, content = "x") => new File([content], name);

function domError(name: string) {
  const error = new Error(name);
  error.name = name;
  return error;
}

function fileHandle(name: string, content?: string): FileHandleLike {
  return { kind: "file", name, getFile: async () => file(name, content) };
}

/** A folder of the connected disk: files and folders by name, with the permission it was given. */
function folder(name: string, entries: Record<string, DirectoryHandleLike | FileHandleLike>, permission: PermissionState = "granted"): DirectoryHandleLike & { permission: PermissionState; request: ReturnType<typeof vi.fn> } {
  const handle = {
    kind: "directory" as const,
    name,
    permission,
    request: vi.fn(async () => {
      handle.permission = "granted";
      return "granted" as PermissionState;
    }),
    async getDirectoryHandle(child: string) {
      const found = entries[child];
      if (!found) throw domError("NotFoundError");
      if (found.kind !== "directory") throw domError("TypeMismatchError");
      return found;
    },
    async getFileHandle(child: string) {
      const found = entries[child];
      if (!found) throw domError("NotFoundError");
      if (found.kind !== "file") throw domError("TypeMismatchError");
      return found;
    },
    async *values() {
      yield* Object.values(entries);
    },
    queryPermission: async () => handle.permission,
    requestPermission: async () => handle.request(),
  };
  return handle;
}

function memoryHandles(initial: DirectoryHandleLike | null = null): HandleStore & { saved: () => DirectoryHandleLike | null } {
  let held = initial;
  return { get: async () => held, set: async (handle) => void (held = handle), clear: async () => void (held = null), saved: () => held };
}

const EVENT = () =>
  folder("archivos", {
    apertura: folder("apertura", { "keynote.pdf": fileHandle("keynote.pdf", "pdf"), "video.mp4": fileHandle("video.mp4"), "notas.txt": fileHandle("notas.txt") }),
    "Pausa del café": folder("Pausa del café", { "loop 1.mp4": fileHandle("loop 1.mp4") }),
    "portada.png": fileHandle("portada.png"),
  });

describe("folder access library", () => {
  it("has no folder until one is connected, then remembers it and reads files from it", async () => {
    const handles = memoryHandles();
    const root = EVENT();
    const library = createFolderAccessLibrary({ picker: async () => root, handles });

    expect(await library.status()).toBe("none");
    expect(library.folderName()).toBeNull();
    expect(await library.connect()).toEqual({ ok: true, value: undefined });

    expect(library.folderName()).toBe("archivos");
    expect(handles.saved()).toBe(root);
    expect(await library.status()).toBe("ready");
    const found = await library.resolve("apertura/keynote.pdf");
    expect(found.ok && (await found.value.text())).toBe("pdf");
  });

  it("finds the folder remembered from an earlier visit", async () => {
    const library = createFolderAccessLibrary({ picker: async () => EVENT(), handles: memoryHandles(EVENT()) });

    expect(await library.status()).toBe("ready");
    expect(await library.resolve("portada.png")).toMatchObject({ ok: true });
  });

  it("is not an error when the person closes the picker", async () => {
    const library = createFolderAccessLibrary({
      picker: async () => {
        throw domError("AbortError");
      },
      handles: memoryHandles(),
    });

    expect(await library.connect()).toEqual({ ok: false, error: "cancelled" });
    expect(await library.status()).toBe("none");
  });

  it("answers unknown when the picker fails for another reason", async () => {
    const library = createFolderAccessLibrary({
      picker: async () => {
        throw domError("SecurityError");
      },
      handles: memoryHandles(),
    });

    expect(await library.connect()).toEqual({ ok: false, error: "unknown" });
  });

  it("says a file is missing, in a folder that is not there or where a folder holds the name of a file", async () => {
    const library = createFolderAccessLibrary({ picker: async () => EVENT(), handles: memoryHandles(EVENT()) });

    expect(await library.resolve("apertura/no-existe.pdf")).toEqual({ ok: false, error: "missing" });
    expect(await library.resolve("otra/video.mp4")).toEqual({ ok: false, error: "missing" });
    expect(await library.resolve("apertura.pdf")).toEqual({ ok: false, error: "missing" });
  });

  it("refuses a path that is not a media path before reading anything", async () => {
    const library = createFolderAccessLibrary({ picker: async () => EVENT(), handles: memoryHandles(EVENT()) });

    for (const path of ["../fuera.pdf", "/abs.pdf", "a\\b.pdf", "notas.txt"]) expect(await library.resolve(path)).toEqual({ ok: false, error: "unsupported-path" });
  });

  it("asks for permission again when the browser took it back, and reads once it is granted", async () => {
    const root = folder("archivos", { "portada.png": fileHandle("portada.png") }, "prompt");
    const library = createFolderAccessLibrary({ picker: async () => root, handles: memoryHandles(root) });

    expect(await library.status()).toBe("needs-permission");
    expect(await library.resolve("portada.png")).toEqual({ ok: false, error: "denied" });
    expect(await library.list()).toEqual([]);

    expect(await library.reconnect()).toBe(true);
    expect(root.request).toHaveBeenCalledTimes(1);
    expect(await library.status()).toBe("ready");
    expect(await library.resolve("portada.png")).toMatchObject({ ok: true });
  });

  it("does not ask again when the permission is already there, and says no when it is refused", async () => {
    const granted = EVENT();
    expect(await createFolderAccessLibrary({ picker: async () => granted, handles: memoryHandles(granted) }).reconnect()).toBe(true);
    expect(granted.request).not.toHaveBeenCalled();

    const refused = folder("archivos", {}, "denied");
    refused.request.mockResolvedValue("denied");
    expect(await createFolderAccessLibrary({ picker: async () => refused, handles: memoryHandles(refused) }).reconnect()).toBe(false);
    expect(await createFolderAccessLibrary({ picker: async () => refused, handles: memoryHandles() }).reconnect()).toBe(false);
  });

  it("lists the files it can show, with their path, sorted, and leaves the rest out", async () => {
    const library = createFolderAccessLibrary({ picker: async () => EVENT(), handles: memoryHandles(EVENT()) });

    expect(await library.list()).toEqual(["apertura/keynote.pdf", "apertura/video.mp4", "Pausa del café/loop 1.mp4", "portada.png"]);
  });

  it("answers an error from a missing path as denied when the browser says so", async () => {
    const root = folder("archivos", {});
    root.getFileHandle = async () => {
      throw domError("NotAllowedError");
    };
    const library = createFolderAccessLibrary({ picker: async () => root, handles: memoryHandles(root) });

    expect(await library.resolve("a.pdf")).toEqual({ ok: false, error: "denied" });
  });
});

describe("folder input library", () => {
  const picked = (...paths: string[]) => paths.map((path) => Object.assign(file(path.split("/").at(-1) ?? path), { webkitRelativePath: path }));

  it("holds the folder picked while the page is open, with paths inside it", async () => {
    const library = createFolderInputLibrary(async () => picked("archivos/apertura/keynote.pdf", "archivos/portada.png", "archivos/notas.txt"));
    expect(await library.status()).toBe("none");
    expect(await library.resolve("portada.png")).toEqual({ ok: false, error: "no-library" });

    expect(await library.connect()).toEqual({ ok: true, value: undefined });

    expect(library.folderName()).toBe("archivos");
    expect(await library.status()).toBe("ready");
    expect(await library.reconnect()).toBe(true);
    expect(await library.resolve("apertura/keynote.pdf")).toMatchObject({ ok: true });
    expect(await library.resolve("apertura/otro.pdf")).toEqual({ ok: false, error: "missing" });
    expect(await library.resolve("../x.pdf")).toEqual({ ok: false, error: "unsupported-path" });
    expect(await library.list()).toEqual(["apertura/keynote.pdf", "portada.png"]);
  });

  it("is a cancel when nothing is picked, and unknown when the picker fails", async () => {
    expect(await createFolderInputLibrary(async () => []).connect()).toEqual({ ok: false, error: "cancelled" });
    expect(
      await createFolderInputLibrary(async () => {
        throw new Error("boom");
      }).connect(),
    ).toEqual({ ok: false, error: "unknown" });
  });
});
