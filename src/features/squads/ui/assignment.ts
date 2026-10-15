import type { SquadId } from "@/shared/types/squad";
import type { SquadErrorCode } from "../domain/squad-error";

/** Serializable result of the server action (it crosses the server/client boundary). */
export type AssignSquadActionResult =
  | { ok: true; squad: SquadId; assigned: boolean }
  | { ok: false; code: SquadErrorCode };

/** The server action the app shell injects into the reveal screen. */
export type AssignSquadAction = () => Promise<AssignSquadActionResult>;
