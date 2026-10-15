import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { planetSprite } from "@/shared/ui/pixel/planet-sprites";
import manifest from "@/app/manifest";
import {
  ICON_BACKGROUND,
  ICON_OUTPUTS,
  crc32,
  encodePng,
  hexToRgb,
  renderIcon,
  scaleForRatio,
} from "../../scripts/icons-lib.mjs";

const ROOT = resolve(__dirname, "../..");

interface DecodedPng {
  width: number;
  height: number;
  rgba: Uint8Array;
  chunkTypes: string[];
}

/** Minimal PNG reader for the files this project makes: checks every chunk CRC and supports filter 0 only. */
function decodePng(buffer: Buffer): DecodedPng {
  expect([...buffer.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const chunkTypes: string[] = [];
  const data: Buffer[] = [];
  let width = 0;
  let height = 0;
  for (let offset = 8; offset < buffer.length; ) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    expect(buffer.readUInt32BE(offset + 8 + length), `CRC of ${type}`).toBe(crc32(buffer.subarray(offset + 4, offset + 8 + length)));

    chunkTypes.push(type);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      expect([body[8], body[9]]).toEqual([8, 6]); // 8-bit RGBA
    }
    if (type === "IDAT") data.push(body);
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    expect(raw[y * (stride + 1)], `filter of row ${y}`).toBe(0);
    rgba.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), y * stride);
  }
  return { width, height, rgba, chunkTypes };
}

const pixelAt = ({ width, rgba }: DecodedPng, x: number, y: number) => {
  const i = (y * width + x) * 4;
  return [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
};

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });
});

describe("hexToRgb and scaleForRatio", () => {
  it("parses #rrggbb and rejects anything else", () => {
    expect(hexToRgb("#0a0f24")).toEqual([10, 15, 36]);
    expect(hexToRgb("#FFFFFF")).toEqual([255, 255, 255]);
    for (const bad of ["0a0f24", "#fff", "#12345g", ""]) expect(() => hexToRgb(bad)).toThrow(RangeError);
  });

  it("picks the largest whole scale that fits the ratio, and never less than 1", () => {
    expect(scaleForRatio(512, 16, 0.66)).toBe(21);
    expect(scaleForRatio(192, 16, 0.66)).toBe(7);
    expect(scaleForRatio(8, 16, 0.5)).toBe(1);
  });
});

describe("encodePng", () => {
  const pixels = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 0]);

  it("writes a valid PNG that decodes back to the same pixels", () => {
    const decoded = decodePng(encodePng(2, 2, pixels));

    expect(decoded).toMatchObject({ width: 2, height: 2, chunkTypes: ["IHDR", "IDAT", "IEND"] });
    expect([...decoded.rgba]).toEqual([...pixels]);
  });

  it("is deterministic", () => {
    expect(encodePng(2, 2, pixels).equals(encodePng(2, 2, pixels))).toBe(true);
  });

  it("rejects pixel data of the wrong length", () => {
    expect(() => encodePng(2, 2, new Uint8Array(15))).toThrow(RangeError);
  });
});

describe("renderIcon", () => {
  const sprite = { rows: [".a", "b."], palette: { a: "#ff0000", b: "#00ff00" } };
  const render = (scale: number) => renderIcon({ size: 8, sprite, scale, background: "#102030" });
  const at = (pixels: Uint8Array, x: number, y: number) => [...pixels.subarray((y * 8 + x) * 4, (y * 8 + x) * 4 + 4)];

  it("fills the background and leaves transparent sprite cells showing it", () => {
    const pixels = render(2);

    expect(at(pixels, 0, 0)).toEqual([16, 32, 48, 255]);
    expect(at(pixels, 7, 7)).toEqual([16, 32, 48, 255]);
    // "." at the top-left of the sprite: the cell at (2,2)-(3,3) keeps the background.
    expect(at(pixels, 2, 2)).toEqual([16, 32, 48, 255]);
  });

  it("draws each sprite pixel as a solid block of the scale, centered", () => {
    const pixels = render(2); // the 2x2 sprite becomes 4x4, starting at (2,2)

    for (const [x, y] of [[4, 2], [5, 2], [4, 3], [5, 3]]) expect(at(pixels, x, y)).toEqual([255, 0, 0, 255]); // "a"
    for (const [x, y] of [[2, 4], [3, 4], [2, 5], [3, 5]]) expect(at(pixels, x, y)).toEqual([0, 255, 0, 255]); // "b"
  });

  it("fails loudly when the sprite uses a key the palette does not define", () => {
    expect(() => renderIcon({ size: 4, sprite: { rows: ["z"], palette: {} }, scale: 1, background: "#000000" })).toThrow(RangeError);
  });
});

describe("the committed icons", () => {
  const sprite = planetSprite("gdg");
  const bg = [...hexToRgb(ICON_BACKGROUND), 255];

  it.each(ICON_OUTPUTS)("$file exists, is a valid $size x $size PNG and is not stale", ({ file, size, ratio }) => {
    const path = resolve(ROOT, file);
    expect(existsSync(path), `${file} is missing: run npm run icons`).toBe(true);

    const png = decodePng(readFileSync(path));
    expect(png).toMatchObject({ width: size, height: size });

    // If the planet sprite or the specs change, the committed PNG must be regenerated.
    const expected = encodePng(size, size, renderIcon({ size, sprite, scale: scaleForRatio(size, 16, ratio), background: ICON_BACKGROUND }));
    expect(readFileSync(path).equals(expected), `${file} is out of date: run npm run icons`).toBe(true);
  });

  it.each(ICON_OUTPUTS)("$file is fully opaque with the Design System background in the corners", ({ file }) => {
    const png = decodePng(readFileSync(resolve(ROOT, file)));

    for (const [x, y] of [[0, 0], [png.width - 1, 0], [0, png.height - 1], [png.width - 1, png.height - 1]]) {
      expect(pixelAt(png, x, y)).toEqual(bg);
    }
    for (let i = 3; i < png.rgba.length; i += 4) expect(png.rgba[i]).toBe(255);
  });

  it("the maskable icon keeps the whole planet inside the 80% safe circle", () => {
    const spec = ICON_OUTPUTS.find((output: { file: string }) => output.file.includes("maskable"));
    if (!spec) throw new Error("There must be a maskable icon in the icon list");
    const png = decodePng(readFileSync(resolve(ROOT, spec.file)));
    const center = png.width / 2;
    let farthest = 0;

    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        const [r, g, b] = pixelAt(png, x, y);
        if (r === bg[0] && g === bg[1] && b === bg[2]) continue;
        farthest = Math.max(farthest, Math.hypot(x + 0.5 - center, y + 0.5 - center));
      }
    }
    expect(farthest).toBeLessThanOrEqual(png.width * 0.4);
  });

  it("the planet is drawn at a whole-number scale: no blurry edges", () => {
    const png = decodePng(readFileSync(resolve(ROOT, "public/icons/icon-512.png")));
    const scale = scaleForRatio(512, 16, 0.66);
    const left = Math.floor((512 - 16 * scale) / 2);
    const top = Math.floor((512 - 16 * scale) / 2);

    // Every sprite pixel is a solid scale x scale block.
    for (let spriteY = 0; spriteY < 16; spriteY += 1) {
      for (let spriteX = 0; spriteX < 16; spriteX += 1) {
        const first = pixelAt(png, left + spriteX * scale, top + spriteY * scale).join(",");
        for (const [dx, dy] of [[scale - 1, 0], [0, scale - 1], [scale - 1, scale - 1]]) {
          expect(pixelAt(png, left + spriteX * scale + dx, top + spriteY * scale + dy).join(",")).toBe(first);
        }
      }
    }
  });
});

describe("the manifest and the icon files agree", () => {
  it("every icon the manifest declares exists in public/ with exactly the declared size", () => {
    for (const icon of manifest().icons ?? []) {
      const path = resolve(ROOT, "public", icon.src.replace(/^\//, ""));
      expect(existsSync(path), `${icon.src} is declared in the manifest but missing`).toBe(true);

      const png = decodePng(readFileSync(path));
      expect(`${png.width}x${png.height}`).toBe(icon.sizes);
    }
  });

  it("the service worker precaches only files that exist", () => {
    for (const src of ["/icons/icon-192.png", "/icons/icon-512.png"]) {
      expect(existsSync(resolve(ROOT, "public", src.replace(/^\//, ""))), src).toBe(true);
    }
  });
});
