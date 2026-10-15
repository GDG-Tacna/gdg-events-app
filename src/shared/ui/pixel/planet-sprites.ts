// Pure data (no React, no aliases at runtime): the planet sprites are shared by the component and by the
// icon script (`scripts/generate-icons.mjs`), which runs this file directly with Node. Keep it erasable TypeScript.
import type { PixelSpriteData } from "../../types/pixel";

/** Technology planets from the Design System (Angular is a squad planet). `charla` arrives with the phase that needs it. */
export type PlanetKind = "gdg" | "cloud" | "firebase" | "angular" | "android" | "ai";

export const PLANET_SIZE = 16;

interface Band {
  base: string;
  shadow: string;
  highlight: string;
}

/**
 * Horizontal color bands per planet. Brand colors live inside the pixel art, never in the interface
 * chrome, and official logos are not redrawn: a planet only borrows the technology's colors.
 */
const PLANET_BANDS: Record<PlanetKind, readonly Band[]> = {
  gdg: [
    { base: "#4285f4", shadow: "#2a5db0", highlight: "#8ab4f8" },
    { base: "#ea4335", shadow: "#b3261e", highlight: "#f28b82" },
    { base: "#fbbc05", shadow: "#c98f00", highlight: "#fde293" },
    { base: "#34a853", shadow: "#1e7e34", highlight: "#81c995" },
  ],
  cloud: [
    { base: "#8ab4f8", shadow: "#5a8fd8", highlight: "#c6dafc" },
    { base: "#e8f0fe", shadow: "#aecbfa", highlight: "#ffffff" },
    { base: "#4285f4", shadow: "#2a5db0", highlight: "#8ab4f8" },
    { base: "#1a73e8", shadow: "#1257b0", highlight: "#669df6" },
  ],
  firebase: [
    { base: "#ffca28", shadow: "#c79a00", highlight: "#ffe082" },
    { base: "#ffa000", shadow: "#c67100", highlight: "#ffd54f" },
    { base: "#f57c00", shadow: "#b85600", highlight: "#ffb74d" },
    { base: "#e65100", shadow: "#a63a00", highlight: "#ff8a50" },
  ],
  angular: [
    { base: "#dd0031", shadow: "#a30023", highlight: "#ff5c7c" },
    { base: "#c3002f", shadow: "#8f0021", highlight: "#ef4a69" },
    { base: "#dd0031", shadow: "#a30023", highlight: "#ff5c7c" },
    { base: "#7a0020", shadow: "#4d0014", highlight: "#b3002c" },
  ],
  android: [
    { base: "#3ddc84", shadow: "#2bb36a", highlight: "#8ef0b8" },
    { base: "#30c070", shadow: "#20945a", highlight: "#6fe3a3" },
    { base: "#1fa463", shadow: "#13784a", highlight: "#56c98e" },
    { base: "#0f7d4a", shadow: "#095634", highlight: "#2fa36b" },
  ],
  ai: [
    { base: "#4f8ff7", shadow: "#2f6ad0", highlight: "#9cc2ff" },
    { base: "#7b6cf0", shadow: "#5546c4", highlight: "#b3a8ff" },
    { base: "#a25ce0", shadow: "#7a3bb5", highlight: "#d1a2f5" },
    { base: "#d65db1", shadow: "#a63d86", highlight: "#f0a3d6" },
  ],
};

/** Palette keys are single letters: three per band (base, shadow, highlight), in band order. */
function keysFor(bandIndex: number): [string, string, string] {
  const first = 97 + bandIndex * 3; // "a"
  return [String.fromCharCode(first), String.fromCharCode(first + 1), String.fromCharCode(first + 2)];
}

function buildSprite(bands: readonly Band[]): PixelSpriteData {
  const palette: Record<string, string> = {};
  bands.forEach((band, index) => {
    const [base, shadow, highlight] = keysFor(index);
    palette[base] = band.base;
    palette[shadow] = band.shadow;
    palette[highlight] = band.highlight;
  });

  const rows: string[] = [];
  for (let y = 0; y < PLANET_SIZE; y += 1) {
    let row = "";
    for (let x = 0; x < PLANET_SIZE; x += 1) {
      const dx = x + 0.5 - PLANET_SIZE / 2;
      const dy = y + 0.5 - PLANET_SIZE / 2;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > PLANET_SIZE / 2 - 0.3) {
        row += ".";
        continue;
      }
      const bandIndex = Math.floor(y / (PLANET_SIZE / bands.length));
      const [base, shadow, highlight] = keysFor(bandIndex);
      const light = dx + dy; // negative = lit from the top-left
      if (light < -5.5 && distance < PLANET_SIZE / 2 - 1.4) row += highlight;
      else if (light > 4.5 || distance > PLANET_SIZE / 2 - 1.3) row += shadow;
      else row += base;
    }
    rows.push(row);
  }
  return { rows, palette };
}

const SPRITES: Record<PlanetKind, PixelSpriteData> = {
  gdg: buildSprite(PLANET_BANDS.gdg),
  cloud: buildSprite(PLANET_BANDS.cloud),
  firebase: buildSprite(PLANET_BANDS.firebase),
  angular: buildSprite(PLANET_BANDS.angular),
  android: buildSprite(PLANET_BANDS.android),
  ai: buildSprite(PLANET_BANDS.ai),
};

export function planetSprite(kind: PlanetKind): PixelSpriteData {
  return SPRITES[kind];
}
