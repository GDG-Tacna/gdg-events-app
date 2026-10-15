/**
 * Stable identifier of a squad: a lowercase slug such as `angular`. The attendee profile stores it.
 * It is deliberately not a closed list: squads become data an admin can define and retire, and a
 * attendee who belongs to a retired squad must keep a valid profile.
 */
export type SquadId = string;

const SQUAD_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,23}$/;

export function isSquadId(value: unknown): value is SquadId {
  return typeof value === "string" && SQUAD_ID_PATTERN.test(value);
}
