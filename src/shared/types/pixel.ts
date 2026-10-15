/**
 * Pixel art as data: one string per row, each character a palette key, "." is transparent.
 * Plain serializable data, so it can live in a catalog and later in Firestore.
 */
export interface PixelSpriteData {
  rows: readonly string[];
  palette: Readonly<Record<string, string>>;
}
