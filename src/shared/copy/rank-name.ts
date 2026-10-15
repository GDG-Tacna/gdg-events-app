import { interpolate } from "@/shared/lib/format";
import { copy } from "./es";

/**
 * The display name of a rank. A name the admin gave the rank wins; otherwise the bundled ranks have their
 * name in the copy, and any other rank shows as "Nivel N" instead of an empty chip.
 */
export function rankName(id: string, level: number, name?: string | null): string {
  if (name) return name;
  const names: Readonly<Record<string, string>> = copy.ranks;
  return Object.hasOwn(names, id) ? names[id] : interpolate(copy.rankFallback, { level: String(level) });
}

/** A rank for a food gate: "Piloto (NV 2)", or "NV 2" when the level has no name in the ladder. */
export function rankWithLevel(level: number, name: string | null): string {
  return name ? interpolate(copy.rankWithLevel, { name, level: String(level) }) : `NV ${level}`;
}
