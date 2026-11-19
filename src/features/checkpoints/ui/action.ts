import type { TicketType } from "@/features/tickets";
import type { StationKind } from "../domain/serve";
import type { ServeErrorCode } from "../domain/serve-error";

/** A mission the scan completed for the cadet (stands), for the staff to tell them. */
export interface StationMission {
  title: string;
  xpEarned: number;
  /** False when it was already completed (a repeated scan only retries its reward). */
  justCompleted: boolean;
}

/** What the serve action answers to the staff screen. Plain data: it crosses the client boundary. */
export type ServeActionResult =
  | {
      ok: true;
      kind: StationKind;
      status: "served" | "already-served";
      /** True when this scan registered the cadet at the event (their first entrance). */
      firstEntrance: boolean;
      alias: string;
      squadId: string | null;
      /** The ticket of the cadet, shown with the verdict. */
      ticketType: TicketType;
      servedCount: number | null;
      /** Missions this scan completed (only at a stand); empty otherwise. */
      missions: readonly StationMission[];
    }
  /** `missing` comes only with `not-eligible`: the level to reach, the talks still missing and the ticket the meal asks for. */
  | { ok: false; code: ServeErrorCode; missing?: { level: number | null; levelName: string | null; talks: number | null; ticket: TicketType | null } };

export type ServeAction = (input: { checkpointId: string; payload: string }) => Promise<ServeActionResult>;
