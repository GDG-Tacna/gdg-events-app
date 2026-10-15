import type { CodeLanguage, Difficulty } from "../../../domain/catalog";
import { SNIPPETS, type Snippet } from "./snippets";

/**
 * "Ordena el código": a short snippet comes shuffled; the attendee taps its lines in order. A wrong tap is a
 * mistake. Three snippets in a row win; too many mistakes or the time limit lose. Nothing is typed.
 */
export const ROUNDS = 3;

export const CODE_ORDER_CONFIG: Readonly<Record<Difficulty, { lines: number; mistakes: number; seconds: number }>> = {
  easy: { lines: 4, mistakes: 3, seconds: 60 },
  normal: { lines: 5, mistakes: 2, seconds: 45 },
  hard: { lines: 6, mistakes: 1, seconds: 35 },
};

/** Every line of a snippet, groups flattened, in one right order. */
export const flatLines = (snippet: Snippet): string[] => snippet.lines.flatMap((step) => (typeof step === "string" ? [step] : [...step]));

/** Three different snippets of the difficulty's length, from the edition's languages. */
export function pickSnippets(difficulty: Difficulty, languages: readonly CodeLanguage[], random: () => number = Math.random): Snippet[] {
  const { lines } = CODE_ORDER_CONFIG[difficulty];
  const pool = SNIPPETS.filter((snippet) => flatLines(snippet).length === lines && languages.includes(snippet.language));
  return shuffle(pool, random).slice(0, ROUNDS);
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** The snippet's lines in an order that is never already a right one (when they can differ at all). */
export function shuffleLines(snippet: Snippet, random: () => number = Math.random): string[] {
  const lines = flatLines(snippet);
  let shuffled = shuffle(lines, random);
  for (let tries = 0; tries < 10 && lines.length > 1 && isInOrder(snippet, shuffled); tries += 1) shuffled = shuffle(lines, random);
  return shuffled;
}

/**
 * The lines that may come next after the ones already placed: the next line, or any line still missing from
 * the current group. Empty when the snippet is complete (or the placed lines are not a valid start).
 */
export function allowedNext(snippet: Snippet, placed: readonly string[]): Set<string> {
  let at = 0;
  for (const step of snippet.lines) {
    const group = typeof step === "string" ? [step] : [...step];
    const left = [...group];
    while (left.length > 0 && at < placed.length) {
      const index = left.indexOf(placed[at]);
      if (index < 0) return new Set();
      left.splice(index, 1);
      at += 1;
    }
    // The loop only stops with lines left in the group once every placed line is used.
    if (left.length > 0) return new Set(left);
  }
  return new Set();
}

/** Whether these lines are the whole snippet in a valid order. */
export function isInOrder(snippet: Snippet, lines: readonly string[]): boolean {
  if (lines.length !== flatLines(snippet).length) return false;
  for (let placed = 0; placed < lines.length; placed += 1) {
    if (!allowedNext(snippet, lines.slice(0, placed)).has(lines[placed])) return false;
  }
  return true;
}
