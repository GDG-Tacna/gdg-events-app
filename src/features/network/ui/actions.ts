import type { ContactLinks, LinkKind } from "../domain/links";
import type { CadetCard, NetworkErrorCode } from "../domain/network";

/** The picture and timing of the cadet's own contact code. Plain data: it crosses the client boundary. */
export interface ContactCodeView {
  cells: readonly string[];
  /** Server clock, in ms. */
  issuedAt: number;
  expiresAt: number;
}

export type IssueContactCodeActionResult = { ok: true; code: ContactCodeView } | { ok: false; code: NetworkErrorCode };
export type IssueContactCodeAction = () => Promise<IssueContactCodeActionResult>;

export type ConnectContactActionResult =
  | {
      ok: true;
      card: CadetCard;
      created: boolean;
      xpEarned: number;
      creditsEarned: number;
      capReached: boolean;
      achievements: ReadonlyArray<{ id: string; name: string; tone: string; imageUrl?: string | null }>;
    }
  | { ok: false; code: NetworkErrorCode };
export type ConnectContactAction = (payload: string) => Promise<ConnectContactActionResult>;

export type SaveContactLinksActionResult = { ok: true; links: ContactLinks } | { ok: false; code: NetworkErrorCode };
export type SaveContactLinksAction = (input: Record<LinkKind, string>) => Promise<SaveContactLinksActionResult>;
