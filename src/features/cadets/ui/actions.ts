import type { TicketSource, TicketType } from "@/features/tickets";
import type { CadetsErrorCode } from "../domain/manage";

/** A cadet as the list shows them. Plain data: it crosses the client boundary. */
export interface CadetRow {
  uid: string;
  alias: string;
  /** The name and email of their sign-in account; `null` when the account could not be read or has none. */
  name: string | null;
  email: string | null;
  squadName: string | null;
  xp: number;
  credits: number;
  /** Whether their first entrance was scanned. */
  attended: boolean;
  banned: boolean;
  /** Their ticket. */
  ticket: TicketType;
  /** Their role in the team, when they hold one (the list only marks it; it is changed on their page). */
  teamRole?: CadetTeamRole | null;
}

/** A cadet's page. Dates as ISO text. */
export interface CadetDetailData extends CadetRow {
  squad: string | null;
  createdAt: string | null;
  attendedAt: string | null;
  activity: { checkIns: number; missions: number; badges: number; contacts: number };
  bannedAt: string | null;
  banReason: string | null;
  /** Where the ticket came from, and who set it by hand (their name, or `null` when it is not by hand or the account could not be read). */
  ticketSource: TicketSource;
  ticketSetByName: string | null;
  /** From the sign-in account; `null` when it could not be read. */
  account: { email: string | null; displayName: string | null; disabled: boolean } | null;
}

/** The roles of the team a cadet's account can hold (the same ones as the Equipo screen). */
export type CadetTeamRole = "staff" | "organizer" | "admin";

/** What giving or taking a team role answers; `code` is the Equipo screen's error code. */
export type TeamRoleActionResult = { ok: true } | { ok: false; code: string };
export type GiveTeamRoleAction = (input: { email: string; role: CadetTeamRole }) => Promise<TeamRoleActionResult>;
export type TakeTeamRoleAction = (input: { email: string }) => Promise<TeamRoleActionResult>;

/** What the cadet's page needs to give or take a team role: who they are in the team now, what may be given, and the actions. */
export interface CadetTeamControls {
  /** The role the account holds in the team now, or `null` for none. */
  role: CadetTeamRole | null;
  /** The roles the viewer may give (an organizer only staff); the server checks it again. */
  assignable: readonly CadetTeamRole[];
  give: GiveTeamRoleAction;
  take: TakeTeamRoleAction;
}

/** What the cadet management actions answer. The screen refreshes after a success. */
export type CadetActionResult = { ok: true } | { ok: false; code: CadetsErrorCode };
export type RenameCadetAction = (input: { uid: string; alias: string }) => Promise<CadetActionResult>;
export type ChangeCadetSquadAction = (input: { uid: string; squad: string | null }) => Promise<CadetActionResult>;
export type BanCadetAction = (input: { uid: string; reason: string }) => Promise<CadetActionResult>;
export type UnbanCadetAction = (input: { uid: string }) => Promise<CadetActionResult>;
/** Deleting answers with the alias of the cadet, for the message. */
export type DeleteCadetActionResult = { ok: true; alias: string } | { ok: false; code: CadetsErrorCode };
export type DeleteCadetAction = (input: { uid: string }) => Promise<DeleteCadetActionResult>;
