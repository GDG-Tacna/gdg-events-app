import type { CadetsErrorCode } from "../domain/manage";

/** A cadet as the list shows them. Plain data: it crosses the client boundary. */
export interface CadetRow {
  uid: string;
  alias: string;
  squadName: string | null;
  xp: number;
  credits: number;
  /** Whether their first entrance was scanned. */
  attended: boolean;
  banned: boolean;
}

/** A cadet's page. Dates as ISO text. */
export interface CadetDetailData extends CadetRow {
  squad: string | null;
  createdAt: string | null;
  attendedAt: string | null;
  activity: { checkIns: number; missions: number; badges: number; contacts: number };
  bannedAt: string | null;
  banReason: string | null;
  /** From the sign-in account; `null` when it could not be read. */
  account: { email: string | null; displayName: string | null; disabled: boolean } | null;
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
