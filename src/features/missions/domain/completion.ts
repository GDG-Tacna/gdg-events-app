import { normalizeKeyword, QUIZ_ATTEMPTS, type Mission } from "./mission";

/** What an attendee did with a mission: still trying, done (with what it earned) or failed for good. */
export type CompletionStatus = "in-progress" | "completed" | "failed";

export interface MissionCompletion {
  uid: string;
  missionId: string;
  status: CompletionStatus;
  /** Wrong tries so far. */
  attempts: number;
  /** XP this mission earned (0 unless completed). */
  xpEarned: number;
  /** G-Credits this mission earned (0 unless completed, or when credits are off). */
  creditsEarned: number;
  at: Date;
}

/** Completion document id: one per attendee and mission, the idempotency key. */
export const completionId = (uid: string, missionId: string) => `${uid}_${missionId}`;

/** What the attendee hands in. Checkpoint proofs come from a verified scan, never from a form. */
export type MissionProof =
  | { kind: "checkpoint"; checkpointId: string }
  | { kind: "choice"; option: number }
  | { kind: "keyword"; value: string };

export type Evaluation =
  /** The proof changed nothing: the mission was already completed or failed. */
  | { kind: "closed" }
  /** The proof does not fit this mission's type (a keyword for a quiz, another checkpoint). */
  | { kind: "wrong-proof" }
  | { kind: "next"; status: CompletionStatus; attempts: number; xpEarned: number; creditsEarned: number };

const closed = (previous: MissionCompletion | null) => previous !== null && previous.status !== "in-progress";

/** How much of the reward a step earns: all of it, half (a quiz right on its second try), or nothing yet. */
type Share = "full" | "half" | "none";
const part = (value: number, share: Share) => (share === "full" ? value : share === "half" ? Math.floor(value / 2) : 0);

/**
 * One strategy per mission type: given the mission, the proof and what the attendee already did, decides
 * the next state. Pure, so it can run inside a transaction and be tested without a database. `credits` is
 * what the mission gives under the edition's economy (resolved by the caller); it is shared like the XP.
 */
export function evaluate(mission: Mission, proof: MissionProof, previous: MissionCompletion | null, credits = 0): Evaluation {
  if (closed(previous)) return { kind: "closed" };
  const attempts = previous?.attempts ?? 0;
  const next = (status: CompletionStatus, tries: number, share: Share): Evaluation => ({
    kind: "next",
    status,
    attempts: tries,
    xpEarned: part(mission.xp, share),
    creditsEarned: part(credits, share),
  });
  const { config } = mission;

  switch (config.type) {
    case "talk":
    case "stand":
      if (proof.kind !== "checkpoint" || proof.checkpointId !== config.checkpointId) return { kind: "wrong-proof" };
      return next("completed", attempts, "full");

    case "quiz": {
      if (proof.kind !== "choice" || !Number.isInteger(proof.option) || proof.option < 0 || proof.option >= config.options.length) {
        return { kind: "wrong-proof" };
      }
      // Right on the first try: the full reward. On the second: half, rounded down.
      if (proof.option === config.answer) return next("completed", attempts, attempts === 0 ? "full" : "half");
      const used = attempts + 1;
      return next(used >= QUIZ_ATTEMPTS ? "failed" : "in-progress", used, "none");
    }

    case "keyword": {
      if (proof.kind !== "keyword") return { kind: "wrong-proof" };
      if (config.keywords.includes(normalizeKeyword(proof.value))) return next("completed", attempts, "full");
      // A wrong word never closes the mission; the attempt limiter stops guessing.
      return next("in-progress", attempts + 1, "none");
    }
  }
}

/** Tries left on a quiz (`null` for types without a limit). */
export function attemptsLeft(mission: Mission, completion: MissionCompletion | null): number | null {
  if (mission.config.type !== "quiz") return null;
  if (completion && completion.status !== "in-progress") return 0;
  return QUIZ_ATTEMPTS - (completion?.attempts ?? 0);
}
