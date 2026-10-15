import type { Analytics } from "@/shared/lib/analytics/analytics";
import { err, ok, type Result } from "@/shared/lib/result";
import type { SquadId } from "@/shared/types/squad";
import type { SquadCatalog, SquadPicker, SquadRepository } from "./ports";
import { offeredSquads, type Squad } from "./squad";
import { squadError, type SquadError } from "./squad-error";

export interface AssignSquadDeps {
  squads: SquadRepository;
  catalog: SquadCatalog;
  analytics: Analytics;
  pick: SquadPicker;
}

export interface AssignSquadResult {
  squad: SquadId;
  /** False when the attendee already had a squad: nothing changed. */
  assigned: boolean;
}

/** Every squad of the edition, active and retired, in order. Screens offer `offeredSquads(...)` and look members' squads up in the full list. */
export async function listSquads(deps: { catalog: SquadCatalog }): Promise<Result<readonly Squad[], SquadError>> {
  return deps.catalog.list();
}

/**
 * Gives the attendee a random squad, once. Idempotent: repeating the call (a double tap, a retry after
 * a lost response) returns the squad they already have, and only a real assignment is counted.
 */
export async function assignSquad(
  deps: AssignSquadDeps,
  uid: string,
): Promise<Result<AssignSquadResult, SquadError>> {
  const catalog = await deps.catalog.list();
  if (!catalog.ok) return catalog;
  // Only active squads are offered. Nothing to choose from (every squad retired): the feature is effectively off.
  const offered = offeredSquads(catalog.value);
  if (offered.length === 0) return err(squadError("disabled"));

  const picked = deps.pick(offered.map((squad) => squad.id));
  const outcome = await deps.squads.assignIfUnassigned(uid, picked);
  if (!outcome.ok) return outcome;

  if (outcome.value.kind === "assigned") {
    deps.analytics.track({ name: "squad_assigned", uid, squad: outcome.value.squad });
    return ok({ squad: outcome.value.squad, assigned: true });
  }
  return ok({ squad: outcome.value.squad, assigned: false });
}
