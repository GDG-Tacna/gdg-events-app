// Pure helpers to draw pixel-art icons and encode them as PNG without any dependency.
// Used by `generate-icons.mjs` and covered by `src/pwa-assets/icons.test.ts`.
import { deflateSync } from "node:zlib";

/** `bg` of the Design System: the splash screen and the icon background match the app. */
export const ICON_BACKGROUND = "#0a0f24";

/**
 * `ratio` is how much of the icon the planet may fill. The maskable icon keeps the planet well inside
 * the central 80% circle that Android guarantees to show whatever the mask shape (circle, squircle...).
 */
export const ICON_OUTPUTS = [
  { file: "public/icons/icon-192.png", size: 192, ratio: 0.66 },
  { file: "public/icons/icon-512.png", size: 512, ratio: 0.66 },
  { file: "public/icons/icon-maskable-512.png", size: 512, ratio: 0.6 },
  { file: "src/app/apple-icon.png", size: 180, ratio: 0.66 },
  { file: "src/app/icon.png", size: 64, ratio: 0.75 },
];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 as PNG chunks use it. */
export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encodes RGBA pixels (8 bits per channel, row by row) as a PNG. Output is deterministic. */
export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new RangeError(`Expected ${width * height * 4} bytes of RGBA, got ${rgba.length}`);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // color type: RGBA
  // compression, filter and interlace stay 0

  // Each scanline starts with its filter type; 0 means "none".
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function hexToRgb(hex) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new RangeError(`Not a #rrggbb color: ${hex}`);
  return [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16), Number.parseInt(match[3], 16)];
}

/** The largest whole-number scale for which a sprite of `spriteSize` pixels fills at most `ratio` of the icon. */
export function scaleForRatio(iconSize, spriteSize, ratio) {
  return Math.max(1, Math.floor((iconSize * ratio) / spriteSize));
}

/**
 * Draws a pixel-art sprite, centered and at a whole-number scale, on a solid background.
 * `sprite` is `{ rows, palette }` (a character per pixel, "." is transparent).
 */
export function renderIcon({ size, sprite, scale, background }) {
  const pixels = new Uint8Array(size * size * 4);
  const [br, bg, bb] = hexToRgb(background);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = br;
    pixels[i + 1] = bg;
    pixels[i + 2] = bb;
    pixels[i + 3] = 255;
  }

  const spriteWidth = sprite.rows[0].length;
  const spriteHeight = sprite.rows.length;
  const left = Math.floor((size - spriteWidth * scale) / 2);
  const top = Math.floor((size - spriteHeight * scale) / 2);

  sprite.rows.forEach((row, spriteY) => {
    [...row].forEach((key, spriteX) => {
      if (key === ".") return;
      const color = sprite.palette[key];
      if (!color) throw new RangeError(`Sprite uses "${key}" but the palette does not define it`);
      const [r, g, b] = hexToRgb(color);

      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const offset = ((top + spriteY * scale + dy) * size + (left + spriteX * scale + dx)) * 4;
          pixels[offset] = r;
          pixels[offset + 1] = g;
          pixels[offset + 2] = b;
        }
      }
    });
  });

  return pixels;
}
