#!/usr/bin/env node
// Generates the app icons from the GDG planet pixel art. Run with `npm run icons`; the PNGs are committed.
// Output is deterministic, so running it again only changes files when the sprite or the list changes.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { planetSprite } from "../src/shared/ui/pixel/planet-sprites.ts";
import { ICON_BACKGROUND, ICON_OUTPUTS, encodePng, renderIcon, scaleForRatio } from "./icons-lib.mjs";

const SPRITE = planetSprite("gdg");
const SPRITE_SIZE = SPRITE.rows.length;

for (const { file, size, ratio } of ICON_OUTPUTS) {
  const scale = scaleForRatio(size, SPRITE_SIZE, ratio);
  const pixels = renderIcon({ size, sprite: SPRITE, scale, background: ICON_BACKGROUND });

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePng(size, size, pixels));
  console.log(`${file}  ${size}x${size}  planet x${scale} (${SPRITE_SIZE * scale}px)`);
}
