export type SquadErrorCode =
  | "not-registered"
  | "unauthenticated"
  | "forbidden"
  | "disabled"
  | "unknown";

export interface SquadError {
  code: SquadErrorCode;
}

export const squadError = (code: SquadErrorCode): SquadError => ({ code });
