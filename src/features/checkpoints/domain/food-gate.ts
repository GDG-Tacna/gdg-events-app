import { err, ok, type Result } from "@/shared/lib/result";
import type { GateVerdict, ServeCheckpoint, ServeGate } from "./ports";

/**
 * Food gates: optional conditions of a catering checkpoint, set by the admin in Puestos. A meal with none
 * (the default) serves everyone registered. Levels are positions in the edition's rank ladder, never names,
 * so renaming a rank never changes who may eat.
 */
export interface FoodRequirements {
  /** Lowest rank level that may receive it, or `null` for no condition (level 1 is everyone). */
  minLevel: number | null;
  /** Talks the person must have attended so far, or `null` for no condition. */
  minTalks: number | null;
}

export const NO_FOOD_REQUIREMENTS: FoodRequirements = { minLevel: null, minTalks: null };
export const FOOD_LEVEL_MAX = 10;
export const FOOD_TALKS_MAX = 50;

export type FoodRequirementsErrorCode = "invalid-level" | "invalid-talks";

const wholeIn = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/**
 * Checks requirements from the admin or from a stored document. Missing values mean no condition, and so
 * do level 1 and 0 talks (everyone meets them), which are stored as `null`.
 */
export function checkFoodRequirements(input: unknown): { ok: true; value: FoodRequirements } | { ok: false; code: FoodRequirementsErrorCode } {
  const data = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const { minLevel, minTalks } = data;
  if (minLevel !== null && minLevel !== undefined && !wholeIn(minLevel, 1, FOOD_LEVEL_MAX)) return { ok: false, code: "invalid-level" };
  if (minTalks !== null && minTalks !== undefined && !wholeIn(minTalks, 0, FOOD_TALKS_MAX)) return { ok: false, code: "invalid-talks" };
  return {
    ok: true,
    value: {
      minLevel: typeof minLevel === "number" && minLevel > 1 ? minLevel : null,
      minTalks: typeof minTalks === "number" && minTalks > 0 ? minTalks : null,
    },
  };
}

/** Stored requirements, or none when the document has none or they break the rules. */
export function parseFoodRequirements(input: unknown): FoodRequirements {
  const checked = checkFoodRequirements(input);
  return checked.ok ? checked.value : NO_FOOD_REQUIREMENTS;
}

export const hasFoodRequirements = (requirements: FoodRequirements) => requirements.minLevel !== null || requirements.minTalks !== null;

/** What a person lacks for a meal: the level they must reach and how many more talks they need. */
export interface FoodShortfall {
  /** The level required, when the person is below it; otherwise `null`. */
  level: number | null;
  /** Talks still to attend, when short; otherwise `null`. */
  talks: number | null;
}

/** `null` when the person meets every condition. */
export function foodShortfall(requirements: FoodRequirements, standing: { level: number; talks: number }): FoodShortfall | null {
  const level = requirements.minLevel !== null && standing.level < requirements.minLevel ? requirements.minLevel : null;
  const talks = requirements.minTalks !== null && standing.talks < requirements.minTalks ? requirements.minTalks - standing.talks : null;
  return level === null && talks === null ? null : { level, talks };
}

export interface FoodGateDeps {
  /** The meal's requirements (none when the checkpoint has none). */
  requirements(checkpointId: string): Promise<Result<FoodRequirements, { code: string }>>;
  /** The person's rank level in this edition and the talks they have attended so far. */
  standing(uid: string): Promise<Result<{ level: number; talks: number }, { code: string }>>;
}

/**
 * The real serve gate: only catering checkpoints are gated, and the person's standing is read only when
 * the meal has conditions. A failed read is an error (the staff can scan again), never a silent pass or
 * a wrong refusal.
 */
export class FoodGate implements ServeGate {
  constructor(private readonly deps: FoodGateDeps) {}

  async check(input: { uid: string; checkpoint: Pick<ServeCheckpoint, "id" | "kind"> }): Promise<Result<GateVerdict, { code: "unknown" }>> {
    if (input.checkpoint.kind !== "catering") return ok({ allowed: true });
    const requirements = await this.deps.requirements(input.checkpoint.id);
    if (!requirements.ok) return err({ code: "unknown" });
    if (!hasFoodRequirements(requirements.value)) return ok({ allowed: true });

    const standing = await this.deps.standing(input.uid);
    if (!standing.ok) return err({ code: "unknown" });
    const missing = foodShortfall(requirements.value, standing.value);
    return ok(missing === null ? { allowed: true } : { allowed: false, missing });
  }
}
