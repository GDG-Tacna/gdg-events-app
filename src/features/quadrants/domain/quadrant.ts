/** The built-in planets a quadrant can wear (pixel art drawn in `shared/ui`). */
export const QUADRANT_PLANETS = ["cloud", "firebase", "android", "ai", "gdg"] as const;
export type QuadrantPlanet = (typeof QUADRANT_PLANETS)[number];

export const isQuadrantPlanet = (value: unknown): value is QuadrantPlanet =>
  typeof value === "string" && (QUADRANT_PLANETS as readonly string[]).includes(value);

/**
 * A galactic quadrant: one Google technology area of the event (Google Cloud, Firebase...). Missions and
 * stands belong to one. The id is a stable slug; a quadrant is deactivated, never deleted.
 */
export interface Quadrant {
  id: string;
  name: string;
  tagline: string;
  planet: QuadrantPlanet;
  order: number;
  active: boolean;
}

const QUADRANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,23}$/;

export const isQuadrantId = (value: unknown): value is string => typeof value === "string" && QUADRANT_ID_PATTERN.test(value);

const trimmedIn = (value: string, min: number, max: number) => {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
};

/** A quadrant name, 2 to 40 characters once trimmed, or `null`. */
export const normalizeQuadrantName = (value: string) => trimmedIn(value, 2, 40);
/** A quadrant tagline, 2 to 80 characters once trimmed, or `null`. */
export const normalizeQuadrantTagline = (value: string) => trimmedIn(value, 2, 80);

export type QuadrantErrorCode = "unknown";

export interface QuadrantError {
  code: QuadrantErrorCode;
}

export const quadrantError = (code: QuadrantErrorCode): QuadrantError => ({ code });
