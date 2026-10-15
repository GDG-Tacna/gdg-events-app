import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { imageProcessor } = await import("./image-processor");

const text = (value: string) => new TextEncoder().encode(value);
const read = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

async function clean(svg: string) {
  const result = await imageProcessor.svg(text(svg));
  if (!result.ok) throw new Error(result.error.code);
  return { svg: read(result.value.bytes), width: result.value.width, height: result.value.height };
}

describe("imageProcessor.raster", () => {
  it("shrinks to the longest side allowed and re-encodes as WebP", async () => {
    const png = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: "#22d3ee" } }).png().toBuffer();

    const result = await imageProcessor.raster(new Uint8Array(png), 1024);

    expect(result.ok && { width: result.value.width, height: result.value.height }).toEqual({ width: 1024, height: 512 });
    const meta = await sharp(result.ok ? result.value.bytes : new Uint8Array()).metadata();
    expect(meta.format).toBe("webp");
  });

  it("never enlarges a small image", async () => {
    const png = await sharp({ create: { width: 64, height: 32, channels: 4, background: "#a3e635" } }).png().toBuffer();

    const result = await imageProcessor.raster(new Uint8Array(png), 1024);

    expect(result.ok && [result.value.width, result.value.height]).toEqual([64, 32]);
  });

  it("drops the photo's metadata (EXIF such as a GPS position) and applies its orientation", async () => {
    const jpeg = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#fb7185" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExifMerge({ IFD0: { Copyright: "secret place" } })
      .toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();

    const result = await imageProcessor.raster(new Uint8Array(jpeg), 1024);

    const out = result.ok ? result.value : null;
    expect((await sharp(out!.bytes).metadata()).exif).toBeUndefined();
    // Orientation 6 is a quarter turn: the stored image is upright, so taller than wide.
    expect([out!.width, out!.height]).toEqual([20, 40]);
  });

  it("refuses bytes it cannot decode and a canvas too large to decode safely", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    expect(await imageProcessor.raster(broken, 1024)).toEqual({ ok: false, error: { code: "unreadable" } });

    const huge = await sharp({ create: { width: 10000, height: 5000, channels: 3, background: "#000" } }).png({ compressionLevel: 9 }).toBuffer();
    expect(await imageProcessor.raster(new Uint8Array(huge), 1024)).toEqual({ ok: false, error: { code: "unreadable" } });
    error.mockRestore();
  });
});

describe("imageProcessor.svg", () => {
  // The first SVG loads jsdom, which is slow to start (seconds); load it once before timing the tests.
  beforeAll(async () => {
    await imageProcessor.svg(text("<svg/>"));
  }, 120_000);

  it("removes scripts, event handlers, foreignObject and links", async () => {
    const { svg } = await clean(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" onload="alert(1)"><script>alert(2)</script>' +
        '<rect width="16" height="16" fill="#22d3ee" onclick="alert(3)"/><foreignObject><div>x</div></foreignObject>' +
        '<a href="javascript:alert(4)"><circle r="2"/></a></svg>',
    );

    expect(svg).toContain("<rect");
    expect(svg).toContain('fill="#22d3ee"');
    expect(svg).not.toMatch(/script|onload|onclick|foreignObject|javascript|alert/i);
  });

  it("keeps references inside the drawing and embedded rasters, and drops anything that loads from outside", async () => {
    const { svg } = await clean(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 8 8">' +
        '<defs><path id="p" d="M0 0h8v8z"/></defs><use href="#p"/><use xlink:href="https://evil.example/x.svg#a"/>' +
        '<image href="data:image/png;base64,iVBORw0KGgo="/><image href="https://tracker.example/pixel.png"/></svg>',
    );

    expect(svg).toContain('href="#p"');
    expect(svg).toContain("data:image/png;base64");
    expect(svg).not.toContain("evil.example");
    expect(svg).not.toContain("tracker.example");
  });

  it("keeps styles unless they load something from outside", async () => {
    const { svg } = await clean(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><style>.a{fill:#a3e635}</style>' +
        '<style>@import url(https://evil.example/x.css);</style>' +
        '<rect class="a" width="8" height="8" style="fill:url(#g)"/><rect style="fill:url(https://evil.example/x)"/></svg>',
    );

    expect(svg).toContain(".a{fill:#a3e635}");
    expect(svg).toContain("fill:url(#g)");
    expect(svg).not.toContain("evil.example");
  });

  it("reads the drawing's size from its viewBox, or from its width and height", async () => {
    expect(await clean('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 842.5 595"></svg>')).toMatchObject({ width: 843, height: 595 });
    expect(await clean('<svg xmlns="http://www.w3.org/2000/svg" width="120px" height="60"></svg>')).toMatchObject({ width: 120, height: 60 });
    expect(await clean("<svg><rect/></svg>")).toMatchObject({ width: null, height: null });
  });

  it("adds the SVG namespace when it is missing, so the file shows in an img", async () => {
    expect((await clean("<svg viewBox='0 0 1 1'></svg>")).svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("refuses a file that is not a drawing once cleaned", async () => {
    expect(await imageProcessor.svg(text("<p>not a drawing</p>"))).toEqual({ ok: false, error: { code: "unsafe-svg" } });
    // An unclosed one that only had a script is cleaned to an empty, harmless drawing.
    expect((await clean("<svg><script>alert(1)</script>")).svg).not.toContain("script");
  });
});
