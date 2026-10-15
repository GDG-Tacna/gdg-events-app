import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { IMAGE_PATH, IMAGE_RULES, MAX_UPLOAD_BYTES, chooseImage, copyImage, dropReplacedImage, removeImage, sniffFormat, storeImage, type MediaDeps } from "./image";

const text = (value: string) => new TextEncoder().encode(value);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = text("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ");
const SVG = text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>');
const ADMIN = { uid: "a1", role: "admin" };

function setup(overrides: Partial<MediaDeps> = {}) {
  const deps: MediaDeps = {
    processor: {
      raster: vi.fn(async () => ok({ bytes: text("webp-bytes"), width: 640, height: 480 })),
      svg: vi.fn(async () => ok({ bytes: text("<svg/>"), width: 10, height: 10 })),
    },
    store: { put: vi.fn(async (path: string) => ok({ url: `https://cdn/${path}` })), get: vi.fn(async () => ok(null)), remove: vi.fn(async () => ok(undefined)) },
    eventId: async () => "devfest-2026",
    newId: () => "0f8e2c1a-1111-4222-8333-944455556666",
    audit: { append: vi.fn(async () => ok(undefined)) },
    now: () => new Date("2026-10-13T12:00:00Z"),
    ...overrides,
  };
  return deps;
}

describe("sniffFormat", () => {
  it.each([
    [JPEG, "jpeg"],
    [PNG, "png"],
    [WEBP, "webp"],
    [SVG, "svg"],
    [text('﻿<?xml version="1.0"?>\n<!-- made by hand -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x">\n<svg width="2" height="2"></svg>'), "svg"],
  ] as const)("reads the real format from the first bytes (%#)", (bytes, format) => {
    expect(sniffFormat(bytes)).toBe(format);
  });

  it.each([
    ["an HTML page", text("<html><body><svg></svg></body></html>")],
    ["a GIF", text("GIF89a......")],
    ["a PDF", text("%PDF-1.7")],
    ["a word that starts like svg", text("<svgx>")],
    ["nothing", new Uint8Array()],
  ])("does not take %s for an image", (_, bytes) => {
    expect(sniffFormat(bytes)).toBeNull();
  });
});

describe("storeImage", () => {
  it("re-encodes a picture, files it under the edition and the purpose with a new name, and audits it", async () => {
    const deps = setup();

    const stored = await storeImage(deps, ADMIN, { purpose: "badge", bytes: PNG });

    const path = "public/devfest-2026/badge/0f8e2c1a-1111-4222-8333-944455556666.webp";
    expect(stored).toEqual(ok({ path, url: `https://cdn/${path}`, width: 640, height: 480, format: "webp" }));
    expect(deps.processor.raster).toHaveBeenCalledWith(PNG, IMAGE_RULES.picture.maxSide);
    expect(deps.store.put).toHaveBeenCalledWith(path, text("webp-bytes"), "image/webp");
    expect(deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "image.uploaded", actorUid: "a1", targetUid: path, details: { purpose: "badge", format: "webp", bytes: "10" } }));
    expect(IMAGE_PATH.test(path)).toBe(true);
  });

  it("keeps a logo's SVG as SVG after cleaning it", async () => {
    const deps = setup();

    const stored = await storeImage(deps, ADMIN, { purpose: "squad-logo", bytes: SVG });

    expect(stored.ok && stored.value.path).toMatch(/\/squad-logo\/.+\.svg$/);
    expect(deps.processor.svg).toHaveBeenCalledWith(SVG);
    expect(deps.store.put).toHaveBeenCalledWith(expect.stringMatching(/\.svg$/), text("<svg/>"), "image/svg+xml");
  });

  it("refuses an SVG where only pictures are allowed, and a file that is not an image", async () => {
    const deps = setup();

    expect(await storeImage(deps, ADMIN, { purpose: "raffle-prize", bytes: SVG })).toEqual(err({ code: "unsupported-format" }));
    expect(await storeImage(deps, ADMIN, { purpose: "squad-logo", bytes: text("%PDF-1.7") })).toEqual(err({ code: "unsupported-format" }));
    expect(deps.store.put).not.toHaveBeenCalled();
  });

  it("checks the size of each purpose: 2 MB for pictures and logos, 4 MB for the venue plan", async () => {
    const deps = setup();
    const big = (bytes: number) => {
      const file = new Uint8Array(bytes);
      file.set(PNG);
      return file;
    };

    expect(await storeImage(deps, ADMIN, { purpose: "mission", bytes: big(2 * 1024 * 1024 + 1) })).toEqual(err({ code: "too-large" }));
    expect((await storeImage(deps, ADMIN, { purpose: "mission", bytes: big(2 * 1024 * 1024) })).ok).toBe(true);
    expect((await storeImage(deps, ADMIN, { purpose: "venue-plan", bytes: big(4 * 1024 * 1024) })).ok).toBe(true);
    expect(await storeImage(deps, ADMIN, { purpose: "venue-plan", bytes: big(4 * 1024 * 1024 + 1) })).toEqual(err({ code: "too-large" }));
    expect(MAX_UPLOAD_BYTES).toBe(4 * 1024 * 1024);
  });

  it("refuses anyone but an admin, and an empty file", async () => {
    const deps = setup();

    expect(await storeImage(deps, { uid: "s1", role: "staff" }, { purpose: "badge", bytes: PNG })).toEqual(err({ code: "forbidden" }));
    expect(await storeImage(deps, ADMIN, { purpose: "badge", bytes: new Uint8Array() })).toEqual(err({ code: "empty" }));
    expect(deps.processor.raster).not.toHaveBeenCalled();
  });

  it("passes on what the processor finds, and stores nothing then", async () => {
    const deps = setup({
      processor: { raster: vi.fn(async () => err({ code: "unreadable" as const })), svg: vi.fn(async () => err({ code: "unsafe-svg" as const })) },
    });

    expect(await storeImage(deps, ADMIN, { purpose: "badge", bytes: JPEG })).toEqual(err({ code: "unreadable" }));
    expect(await storeImage(deps, ADMIN, { purpose: "venue-plan", bytes: SVG })).toEqual(err({ code: "unsafe-svg" }));
    expect(deps.store.put).not.toHaveBeenCalled();
  });

  it("fails when the store fails, and keeps the image when only the audit line fails", async () => {
    expect(await storeImage(setup({ store: { put: vi.fn(async () => err({ code: "x" })), get: vi.fn(), remove: vi.fn() } }), ADMIN, { purpose: "badge", bytes: PNG })).toEqual(err({ code: "unknown" }));

    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const kept = await storeImage(setup({ audit: { append: vi.fn(async () => err({ code: "x" })) } }), ADMIN, { purpose: "badge", bytes: PNG });
    expect(kept.ok).toBe(true);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("never builds a path outside the app's images (an odd edition id is refused)", async () => {
    const deps = setup({ eventId: async () => "../other" });

    expect(await storeImage(deps, ADMIN, { purpose: "badge", bytes: PNG })).toEqual(err({ code: "unknown" }));
    expect(deps.store.put).not.toHaveBeenCalled();
  });
});

describe("removeImage", () => {
  it("deletes an app image and ignores any other path", async () => {
    const deps = setup();

    await removeImage(deps, "public/devfest-2026/badge/0f8e2c1a-1111-4222-8333-944455556666.webp");
    await removeImage(deps, "private/secrets.json");
    await removeImage(deps, "public/devfest-2026/badge/../../x.webp");

    expect(deps.store.remove).toHaveBeenCalledTimes(1);
  });
});

describe("chooseImage and dropReplacedImage", () => {
  const ref = (path: string) => ({ path, url: `https://cdn/${path}` });
  const images = { ref: vi.fn((path: string, purpose: string) => (path.includes(`/${purpose}/`) ? ref(path) : null)), remove: vi.fn(async () => {}) };
  const BADGE = "public/devfest-2026/badge/0f8e2c1a-1111-4222-8333-944455556666.webp";

  it("keeps the image when the form sends nothing, removes it on null, and points at an upload of the purpose", () => {
    expect(chooseImage(images, "badge", undefined)).toEqual({ keep: true });
    expect(chooseImage(images, "badge", null)).toEqual({ keep: false, image: null });
    expect(chooseImage(images, "badge", BADGE)).toEqual({ keep: false, image: ref(BADGE) });
  });

  it("refuses another purpose's image and anything that is not a path", () => {
    expect(chooseImage(images, "raffle-prize", BADGE)).toBeNull();
    expect(chooseImage(images, "badge", 42)).toBeNull();
    expect(chooseImage(images, "badge", { path: BADGE })).toBeNull();
  });

  it("deletes the image a record stopped using, and only that one", async () => {
    await dropReplacedImage(images, ref("a"), ref("b"));
    await dropReplacedImage(images, ref("c"), null);
    await dropReplacedImage(images, ref("d"), ref("d"));
    await dropReplacedImage(images, null, ref("e"));

    expect(images.remove.mock.calls).toEqual([["a"], ["c"]]);
  });
});

describe("copyImage", () => {
  const PATH = "public/devfest-2026/badge/abcdef123456.webp";
  const store = (found: { bytes: Uint8Array; contentType: string } | null) => ({
    get: vi.fn(async () => ok(found)),
    put: vi.fn(async (path: string) => ok({ url: `/media/${path}` })),
    remove: vi.fn(async () => ok(undefined)),
  });

  it("stores the same bytes under a new name in the other edition's folder, keeping its kind", async () => {
    const images = store({ bytes: new Uint8Array([1, 2]), contentType: "image/webp" });

    expect(await copyImage({ store: images, newId: () => "newid12345678" }, PATH, "meetup-nov")).toEqual(ok("public/meetup-nov/badge/newid12345678.webp"));
    expect(images.put).toHaveBeenCalledWith("public/meetup-nov/badge/newid12345678.webp", new Uint8Array([1, 2]), "image/webp");
  });

  it("answers null for something that is not an app image or no longer exists", async () => {
    const missing = store(null);

    expect(await copyImage({ store: missing, newId: () => "newid12345678" }, "https://example.com/a.png", "meetup-nov")).toEqual(ok(null));
    expect(await copyImage({ store: missing, newId: () => "newid12345678" }, PATH, "meetup-nov")).toEqual(ok(null));
    expect(missing.put).not.toHaveBeenCalled();
  });

  it("reports a failed read or write", async () => {
    const broken = { ...store(null), get: vi.fn(async () => err({ code: "unknown" })) };

    expect(await copyImage({ store: broken, newId: () => "newid12345678" }, PATH, "meetup-nov")).toEqual(err({ code: "unknown" }));
  });
});
