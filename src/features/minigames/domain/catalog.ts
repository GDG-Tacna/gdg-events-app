/**
 * The mini-games: a closed set built in code (a new game needs code), planned in docs/minigames.md. The admin
 * only enables them per edition, sets their difficulty and assigns them to missions. Each one is a bonus on a
 * completed mission: winning grants the mission's XP again, losing keeps the base.
 */
export const MINIGAME_IDS = ["bug-kong", "bug-invaders", "circuits", "code-order", "warp-timing"] as const;
export type MinigameId = (typeof MINIGAME_IDS)[number];

export const DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface MinigameSpec {
  id: MinigameId;
  /** A result sent sooner than this after the ticket was issued is refused (nobody wins that fast). */
  minSeconds: number;
  /** The longest a game lasts at each difficulty (its time limit). */
  maxSeconds: Readonly<Record<Difficulty, number>>;
}

/** Time to read the intro, count down and come back from a short interruption, on top of the game itself. */
export const TICKET_GRACE_SECONDS = 120;

export const MINIGAMES: Readonly<Record<MinigameId, MinigameSpec>> = {
  "bug-kong": { id: "bug-kong", minSeconds: 15, maxSeconds: { easy: 75, normal: 60, hard: 50 } },
  "bug-invaders": { id: "bug-invaders", minSeconds: 15, maxSeconds: { easy: 60, normal: 60, hard: 50 } },
  circuits: { id: "circuits", minSeconds: 8, maxSeconds: { easy: 60, normal: 50, hard: 40 } },
  "code-order": { id: "code-order", minSeconds: 10, maxSeconds: { easy: 60, normal: 45, hard: 35 } },
  "warp-timing": { id: "warp-timing", minSeconds: 6, maxSeconds: { easy: 30, normal: 30, hard: 30 } },
};

export const isMinigameId = (value: unknown): value is MinigameId => typeof value === "string" && (MINIGAME_IDS as readonly string[]).includes(value);
export const isDifficulty = (value: unknown): value is Difficulty => typeof value === "string" && (DIFFICULTIES as readonly string[]).includes(value);

/** How long a play ticket stays valid: the game's longest time plus the grace. */
export const ticketSeconds = (game: MinigameId, difficulty: Difficulty) => MINIGAMES[game].maxSeconds[difficulty] + TICKET_GRACE_SECONDS;

/** The languages the "Ordena el código" snippets come in. */
export const CODE_LANGUAGES = ["javascript", "python"] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];
