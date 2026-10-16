/**
 * How a cadet's astronaut looks: the choices of the avatar editor. Each one is an index into a closed palette or a
 * name from a closed set, so a stored look is small and always drawable. Until a cadet edits it, the look comes from
 * their alias (`lookFromSeed`), exactly as the avatar was drawn before the editor existed.
 */

/** Each skin tone: light, base, shadow. The first five are the ones the alias picks from. */
export const SKIN_TONES = [
  ["#ffe2c8", "#f5c9a3", "#d9a37c"],
  ["#f3c193", "#e0a26f", "#bd7f52"],
  ["#d99a62", "#bf7e45", "#965a2c"],
  ["#a8693c", "#8a5228", "#663a1a"],
  ["#7a4a2a", "#5e3820", "#3f2414"],
  ["#5a3420", "#432616", "#2b170c"],
] as const;

/** Each hair color: light, base, shadow. The first five are the ones the alias picks from. */
export const HAIR_COLORS = [
  ["#5a3a2e", "#3b241c", "#24140f"],
  ["#a8683c", "#7a4526", "#4f2a16"],
  ["#f2c45a", "#d49a2e", "#9c6a1a"],
  ["#3d3d52", "#22222f", "#121219"],
  ["#c75a3a", "#9a3b24", "#6a2414"],
  ["#e8ecf5", "#bcc4d8", "#8a93ab"],
  ["#7fb2ff", "#4a7fe0", "#2b4fa0"],
  ["#ff9ad5", "#e05fae", "#a3367a"],
] as const;

/** Helmet colors (the Design System's accents and the classic blue): highlight, light, base, shadow. */
export const HELMET_COLORS = [
  ["#9ad0ff", "#4f9bff", "#2d6df6", "#1a3fa8"],
  ["#d8ccff", "#a98bff", "#7c4dff", "#4b2bb0"],
  ["#ffd6fb", "#f29cf5", "#d65ce0", "#8f2a9a"],
  ["#e6ffb0", "#bff060", "#8fcc2a", "#4f7d12"],
  ["#fff1b8", "#ffd45c", "#f2a81d", "#a8650b"],
  ["#c8fbff", "#6fe6f5", "#1fc3dd", "#0b7488"],
] as const;

/** Suit colors: light, mid, shadow. The first is the classic white suit. */
export const SUIT_COLORS = [
  ["#f6f8ff", "#cfd7ef", "#98a4c8"],
  ["#c9cfdf", "#9aa3bc", "#6b7591"],
  ["#4a5a9e", "#33417a", "#212c56"],
  ["#ffb36b", "#f08a3c", "#b45a1c"],
  ["#8fe0a8", "#4fbf73", "#2a8048"],
  ["#c4a3ff", "#9670f0", "#6342b8"],
] as const;

export const HAIR_STYLES = ["short-left", "short-right", "long-left", "long-right", "curly", "buzz"] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const BEARDS = ["none", "stubble", "beard", "mustache"] as const;
export type Beard = (typeof BEARDS)[number];
export const GLASSES = ["none", "round", "shades"] as const;
export type Glasses = (typeof GLASSES)[number];

export interface AvatarLook {
  skin: number;
  hairStyle: HairStyle;
  hairColor: number;
  beard: Beard;
  glasses: Glasses;
  helmet: number;
  suit: number;
}

/** FNV-1a: a small, stable string hash. The same name always gives the same number. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (const char of text) {
    value ^= char.codePointAt(0) ?? 0;
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

/** How many choices the alias picks from (the palettes as they were before the editor), so old avatars never change. */
const SEED_HAIR = 5;
const SEED_SKIN = 5;

/** The look an alias gives: hair, skin, helmet, fringe side and length, as always. Case does not matter. */
export function lookFromSeed(seed: string): AvatarLook {
  const value = hash(seed.normalize("NFC").trim().toLowerCase());
  const left = Math.floor(value / 150) % 2 === 0;
  const short = Math.floor(value / 300) % 2 === 0;
  return {
    skin: Math.floor(value / 5) % SEED_SKIN,
    hairStyle: `${short ? "short" : "long"}-${left ? "left" : "right"}`,
    hairColor: value % SEED_HAIR,
    beard: "none",
    glasses: "none",
    helmet: Math.floor(value / 25) % HELMET_COLORS.length,
    suit: 0,
  };
}

const isIndex = (value: unknown, length: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value < length;
const isOneOf = <T extends string>(value: unknown, options: readonly T[]): value is T => typeof value === "string" && (options as readonly string[]).includes(value);

/** A look from stored or submitted data, or `null` when any choice is outside its set. */
export function parseLook(input: unknown): AvatarLook | null {
  if (typeof input !== "object" || input === null) return null;
  const data = input as Record<string, unknown>;
  if (!isIndex(data.skin, SKIN_TONES.length) || !isIndex(data.hairColor, HAIR_COLORS.length) || !isIndex(data.helmet, HELMET_COLORS.length) || !isIndex(data.suit, SUIT_COLORS.length)) return null;
  if (!isOneOf(data.hairStyle, HAIR_STYLES) || !isOneOf(data.beard, BEARDS) || !isOneOf(data.glasses, GLASSES)) return null;
  return { skin: data.skin, hairStyle: data.hairStyle, hairColor: data.hairColor, beard: data.beard, glasses: data.glasses, helmet: data.helmet, suit: data.suit };
}

/** A random look (the editor's "Aleatorio"); `random` returns 0..1. */
export function randomLook(random: () => number = Math.random): AvatarLook {
  const pick = (length: number) => Math.min(length - 1, Math.floor(random() * length));
  return {
    skin: pick(SKIN_TONES.length),
    hairStyle: HAIR_STYLES[pick(HAIR_STYLES.length)],
    hairColor: pick(HAIR_COLORS.length),
    beard: BEARDS[pick(BEARDS.length)],
    glasses: GLASSES[pick(GLASSES.length)],
    helmet: pick(HELMET_COLORS.length),
    suit: pick(SUIT_COLORS.length),
  };
}

export const sameLook = (a: AvatarLook, b: AvatarLook) =>
  a.skin === b.skin && a.hairStyle === b.hairStyle && a.hairColor === b.hairColor && a.beard === b.beard && a.glasses === b.glasses && a.helmet === b.helmet && a.suit === b.suit;
